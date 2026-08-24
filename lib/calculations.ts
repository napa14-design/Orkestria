/**
 * Regras de cálculo centrais do sistema.
 *
 * Todas as funções são puras: recebem entidades e parâmetros resolvidos e
 * devolvem números/objetos. Nenhuma depende da fonte de dados — valem
 * igualmente para Google Sheets hoje e Firebase Firestore no futuro.
 */
import type {
  ClassificacaoOcupacao,
  Feriado,
  Funcionario,
  Local,
  ParametrosResolvidos,
  PeriodoLetivo,
  RotinaPlanejada,
  Tarefa,
  TipoLocal,
  TipoServico,
} from "@/types";
import { diaDaSemana, hhmmParaMin, parseDiasSemana } from "./dateUtils";

/**
 * Situação de uma sede no calendário acadêmico em uma data:
 *  - "sem_calendario" → a sede não tem nenhum período letivo ativo cadastrado;
 *  - "dentro"         → a data cai dentro de um período letivo (dia com aula);
 *  - "fora"           → há calendário, mas a data está em férias/recesso.
 * Tarefas com `depende_calendario` só são exigidas quando "dentro".
 */
export type StatusPeriodoLetivo = "sem_calendario" | "dentro" | "fora";

export function statusPeriodoLetivo(
  periodos: PeriodoLetivo[],
  sedeId: string,
  dataISO: string,
): StatusPeriodoLetivo {
  const daSede = periodos.filter((p) => p.ativo && p.sede_id === sedeId);
  if (daSede.length === 0) return "sem_calendario";
  const dow = diaDaSemana(dataISO);
  const dentro = daSede.some((p) => {
    if (!(p.data_inicio <= dataISO && dataISO <= p.data_fim)) return false;
    const dias = parseDiasSemana(p.dias_semana);
    return dias.length === 0 || dias.includes(dow);
  });
  return dentro ? "dentro" : "fora";
}

/**
 * O dia está fechado por feriado/recesso? Devolve o registro que fecha, ou `null`.
 *
 * Registro com `sede_id` vazio vale para **todas** as sedes — é como se cadastra
 * feriado nacional, estadual e municipal uma única vez (as 18 sedes são em
 * Fortaleza). Com `sede_id` preenchido, fecha só aquela.
 *
 * Não confundir com período letivo: aquele responde "esta tarefa que depende do
 * calendário é exigida hoje?"; este responde "existe operação hoje?".
 */
export function feriadoDoDia(
  feriados: Feriado[],
  sedeId: string | undefined,
  dataISO: string,
): Feriado | null {
  return (
    feriados.find(
      (f) =>
        f.ativo &&
        (!f.sede_id || f.sede_id === sedeId) &&
        f.data_inicio <= dataISO &&
        dataISO <= f.data_fim,
    ) ?? null
  );
}

/**
 * Fator sugerido pelo TIPO DE USO do local — "o local guia o nível de limpeza"
 * (decisão da ata de 17/07/2026). Só vale como padrão: um fator digitado no
 * cadastro sempre vence. Segue a orientação já publicada na tela de Locais
 * (banheiros e copas densos · áreas abertas leves · o resto normal); corredor,
 * escada e demais ficam em 1,0 até a operação calibrar.
 */
export const FATOR_POR_TIPO_LOCAL: Record<TipoLocal, number> = {
  banheiro: 1.5,
  copa: 1.5,
  area_externa: 0.8,
  sala: 1,
  corredor: 1,
  area_comum: 1,
  escada: 1,
  recepcao: 1,
  auditorio: 1,
  almoxarifado: 1,
  outros: 1,
};

/**
 * Fator de intensidade do AMBIENTE (local): o quanto o espaço suja e pesa na
 * limpeza. Presets: leve 0,8 · normal 1,0 · densa 1,5. Migrou da categoria para
 * o local (ata de 16/06/2026).
 *
 * Sem fator informado (ausente/≤0), cai no padrão do TIPO do local — antes caía
 * sempre em 1. Locais que já têm fator gravado não mudam de comportamento.
 */
export function fatorIntensidadeLocal(local: Local | undefined): number {
  const f = local?.fator_intensidade;
  if (typeof f === "number" && f > 0) return f;
  return (local && FATOR_POR_TIPO_LOCAL[local.tipo_local]) || 1;
}

/**
 * Multiplicadores por natureza do serviço de limpeza. Constantes calibráveis:
 * a 1ª fase usa estes valores; podem virar parâmetro no futuro.
 */
export const FATOR_TIPO_SERVICO: Record<TipoServico, number> = {
  rotina: 1,
  pesada: 1.5,
  desincrustante: 2,
};

/** Fator do tipo de serviço da tarefa (ausente = "rotina" → 1). */
export function fatorServico(tarefa: Pick<Tarefa, "tipo_servico"> | undefined): number {
  return FATOR_TIPO_SERVICO[tarefa?.tipo_servico ?? "rotina"] ?? 1;
}

/**
 * A tarefa cobra desvio previsto × realizado? Tarefas de tempo-referência e de
 * presença/plantão NÃO cobram (a variação é esperada / é tempo de permanência).
 */
export function cobraDesvio(
  tarefa: Pick<Tarefa, "tempo_referencia" | "presenca"> | undefined | null,
): boolean {
  return !(tarefa?.tempo_referencia || tarefa?.presenca);
}

export const PARAMETROS_PADRAO: ParametrosResolvidos = {
  bloco_agenda_min: 15,
  ocupacao_baixa: 60,
  ocupacao_adequada: 85,
  ocupacao_alta: 100,
  desvio_justificativa_percentual: 30,
  min_execucoes_ajuste: 3,
  desvio_ajuste_percentual: 15,
};

/** Mediana de uma lista de números (robusta a execuções atípicas). */
export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

/** jornada_liquida = saida - entrada - intervalo (em minutos). */
/**
 * Intervalos do funcionário (lanches + almoço). Usa o campo `intervalos` (CSV
 * de pares "HH:mm-HH:mm") quando presente; senão cai no intervalo único.
 */
export function intervalosDoFuncionario(
  f: Pick<Funcionario, "intervalos" | "intervalo_inicio" | "intervalo_fim">,
): Array<{ inicio: string; fim: string }> {
  if (f.intervalos && f.intervalos.trim()) {
    return f.intervalos
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((par) => {
        const [inicio, fim] = par.split("-");
        return { inicio: (inicio ?? "").trim(), fim: (fim ?? "").trim() };
      })
      .filter((iv) => iv.inicio && iv.fim);
  }
  if (f.intervalo_inicio && f.intervalo_fim)
    return [{ inicio: f.intervalo_inicio, fim: f.intervalo_fim }];
  return [];
}

/** Total de minutos de intervalo no dia (soma de todos os intervalos). */
export function minutosIntervalo(
  f: Pick<Funcionario, "intervalos" | "intervalo_inicio" | "intervalo_fim" | "intervalo_min">,
): number {
  if (f.intervalos && f.intervalos.trim()) {
    return intervalosDoFuncionario(f).reduce((s, iv) => {
      const a = hhmmParaMin(iv.inicio);
      const b = hhmmParaMin(iv.fim);
      return s + (Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, b - a));
    }, 0);
  }
  return f.intervalo_min || 0;
}

export function jornadaLiquidaMin(
  f: Pick<
    Funcionario,
    "entrada" | "saida" | "intervalo_min" | "intervalos" | "intervalo_inicio" | "intervalo_fim"
  >,
): number {
  const entrada = hhmmParaMin(f.entrada);
  const saida = hhmmParaMin(f.saida);
  if (Number.isNaN(entrada) || Number.isNaN(saida)) return 0;
  return Math.max(0, saida - entrada - minutosIntervalo(f));
}

/** Horário efetivo de um funcionário numa data (trata sábado e folgas). */
export interface JornadaEfetiva {
  entrada: string;
  saida: string;
  intervalo_min: number;
  intervalo_inicio: string;
  intervalo_fim: string;
  intervalos: string;
  trabalha: boolean;
}

export function jornadaDoDia(f: Funcionario, dataISO: string): JornadaEfetiva {
  const dia = new Date(`${dataISO}T12:00:00`).getDay(); // 0=dom … 6=sáb
  const escala = f.escala || "seg_sex";
  const trabalha =
    dia === 0 ? escala === "todos" : dia === 6 ? escala !== "seg_sex" : true;

  // sábado com horário próprio (ex.: turno de 4h, sem intervalo)
  if (dia === 6 && f.entrada_sabado && f.saida_sabado) {
    return {
      entrada: f.entrada_sabado,
      saida: f.saida_sabado,
      intervalo_min: 0,
      intervalo_inicio: "",
      intervalo_fim: "",
      intervalos: "",
      trabalha,
    };
  }
  return {
    entrada: f.entrada,
    saida: f.saida,
    intervalo_min: f.intervalo_min,
    intervalo_inicio: f.intervalo_inicio,
    intervalo_fim: f.intervalo_fim,
    intervalos: f.intervalos ?? "",
    trabalha,
  };
}

/** Funcionário com o horário daquela data aplicado (para agenda/validação). */
export function funcionarioNoDia(f: Funcionario, dataISO: string): Funcionario {
  return { ...f, ...jornadaDoDia(f, dataISO) };
}

/** Carga horária semanal líquida (soma dos dias trabalhados). */
export function cargaSemanalMin(f: Funcionario): number {
  // 2026-06-15 é segunda; varremos uma semana inteira.
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const ef = jornadaDoDia(f, `2026-06-${15 + i}`);
    if (ef.trabalha) total += jornadaLiquidaMin(ef);
  }
  return total;
}

/**
 * Multiplicador aplicado ao tempo base da tarefa:
 *  - intensidade do AMBIENTE (local) — leve 0,8 · normal 1,0 · densa 1,5 — só
 *    incide em regras dimensionadas pela área/quantidade (`por_m2`,
 *    `por_unidade`), onde o quanto o ambiente "suja" escala o esforço. Em
 *    tarefas de tempo fixo/manual (café, recolhimento, reposição) o tempo já é
 *    explícito e a intensidade NÃO se aplica (evita inflar atividades que não
 *    dependem da metragem);
 *  - natureza do SERVIÇO (rotina 1,0 · pesada 1,5 · desincrustante 2,0) incide
 *    em todas as regras (a forma de limpar pesa mesmo num tempo fixo, ex.: vidros
 *    desincrustantes).
 */
export function multiplicadorTempo(tarefa: Tarefa, local: Local | undefined): number {
  const escalaPelaArea =
    tarefa.regra_calculo === "por_m2" || tarefa.regra_calculo === "por_unidade";
  const intensidade = escalaPelaArea ? fatorIntensidadeLocal(local) : 1;
  return intensidade * fatorServico(tarefa);
}

/**
 * Tempo previsto da tarefa segundo sua regra de cálculo:
 *  - fixo/manual → tempo_base_min
 *  - por_m2      → tempo_base_min × metragem do local (base 1 m² ≈ 1 min)
 *  - por_unidade → tempo_base_min × quantidade
 *
 * O resultado é multiplicado por `multiplicadorTempo` (intensidade do ambiente,
 * só em por_m2/por_unidade, × natureza do serviço, sempre).
 * Fórmula da 1ª fase: m² × tipo de ambiente × tipo de serviço.
 */
export function tempoPrevistoMin(tarefa: Tarefa, local: Local | undefined): number {
  let base: number;
  switch (tarefa.regra_calculo) {
    case "por_m2":
      base = tarefa.tempo_base_min * (local?.metragem ?? 0);
      break;
    case "por_unidade":
      base = tarefa.tempo_base_min * (tarefa.quantidade || 1);
      break;
    case "fixo":
    case "manual":
    default:
      base = tarefa.tempo_base_min;
  }
  return Math.round(base * multiplicadorTempo(tarefa, local));
}

/** blocos = teto(tempo_previsto / bloco). 80min em blocos de 30 → 3 blocos. */
export function blocosOcupados(tempoPrevistoMin: number, blocoMin: number): number {
  if (blocoMin <= 0) return 0;
  return Math.max(1, Math.ceil(tempoPrevistoMin / blocoMin));
}

/** Tempo visual da agenda = blocos × tamanho do bloco (80min → 90min). */
export function tempoVisualMin(tempoPrevistoMin: number, blocoMin: number): number {
  return blocosOcupados(tempoPrevistoMin, blocoMin) * blocoMin;
}

/** Soma dos tempos previstos reais das rotinas (não o tempo visual). */
export function tempoPlanejadoMin(rotinas: RotinaPlanejada[]): number {
  return rotinas
    .filter((r) => r.status !== "cancelada")
    .reduce((soma, r) => soma + (r.tempo_previsto_min || 0), 0);
}

export function ociosidadePrevistaMin(
  jornadaLiquida: number,
  tempoPlanejado: number,
): number {
  return jornadaLiquida - tempoPlanejado;
}

/** Ocupação em % (0–100+). Jornada zerada → 0. */
export function ocupacaoPercentual(
  tempoPlanejado: number,
  jornadaLiquida: number,
): number {
  if (jornadaLiquida <= 0) return 0;
  return (tempoPlanejado / jornadaLiquida) * 100;
}

export function classificarOcupacao(
  ocupacao: number,
  p: ParametrosResolvidos,
): ClassificacaoOcupacao {
  if (ocupacao > p.ocupacao_alta) return "sobrecarga";
  if (ocupacao > p.ocupacao_adequada) return "alta_ocupacao";
  if (ocupacao > p.ocupacao_baixa) return "adequado";
  return "subutilizado";
}

export const ROTULO_CLASSIFICACAO: Record<ClassificacaoOcupacao, string> = {
  subutilizado: "Subutilizado",
  adequado: "Adequado",
  alta_ocupacao: "Alta ocupação",
  sobrecarga: "Sobrecarga",
};

export function desvioMin(tempoRealMin: number, tempoPrevistoMin: number): number {
  return tempoRealMin - tempoPrevistoMin;
}

export function desvioPercentual(
  tempoRealMin: number,
  tempoPrevistoMin: number,
): number {
  if (tempoPrevistoMin <= 0) return 0;
  return (desvioMin(tempoRealMin, tempoPrevistoMin) / tempoPrevistoMin) * 100;
}

/** Desvio acima do limite configurado exige justificativa. */
export function exigeJustificativa(
  tempoRealMin: number,
  tempoPrevistoMin: number,
  p: ParametrosResolvidos,
): boolean {
  return (
    Math.abs(desvioPercentual(tempoRealMin, tempoPrevistoMin)) >
    p.desvio_justificativa_percentual
  );
}

/** Produtividade: m² atendidos por hora trabalhada. */
export function produtividadeM2PorHora(totalM2: number, totalMin: number): number {
  if (totalMin <= 0) return 0;
  return totalM2 / (totalMin / 60);
}

/** Resumo completo de um funcionário em uma data (painel lateral e dashboard). */
export interface ResumoFuncionario {
  jornada_liquida_min: number;
  tempo_planejado_min: number;
  /** Deslocamento estimado do dia (nº de tarefas × parâmetro da sede). */
  ociosidade_prevista_min: number;
  ocupacao_percentual: number;
  classificacao: ClassificacaoOcupacao;
  total_tarefas: number;
}

export function resumoFuncionario(
  funcionario: Funcionario,
  rotinasDoDia: RotinaPlanejada[],
  p: ParametrosResolvidos,
): ResumoFuncionario {
  const jornada = jornadaLiquidaMin(funcionario);
  const planejado = tempoPlanejadoMin(rotinasDoDia);
  const totalTarefas = rotinasDoDia.filter((r) => r.status !== "cancelada").length;
  const ocupacao = ocupacaoPercentual(planejado, jornada);
  return {
    jornada_liquida_min: jornada,
    tempo_planejado_min: planejado,
    ociosidade_prevista_min: ociosidadePrevistaMin(jornada, planejado),
    ocupacao_percentual: ocupacao,
    classificacao: classificarOcupacao(ocupacao, p),
    total_tarefas: totalTarefas,
  };
}
