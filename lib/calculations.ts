/**
 * Regras de cálculo centrais do sistema.
 *
 * Todas as funções são puras: recebem entidades e parâmetros resolvidos e
 * devolvem números/objetos. Nenhuma depende da fonte de dados — valem
 * igualmente para Google Sheets hoje e Firebase Firestore no futuro.
 */
import type {
  ClassificacaoOcupacao,
  Funcionario,
  Local,
  ParametrosResolvidos,
  RotinaPlanejada,
  Tarefa,
} from "@/types";
import { hhmmParaMin } from "./dateUtils";

export const PARAMETROS_PADRAO: ParametrosResolvidos = {
  bloco_agenda_min: 30,
  ocupacao_baixa: 60,
  ocupacao_adequada: 85,
  ocupacao_alta: 100,
  desvio_justificativa_percentual: 30,
  tolerancia_sobrecarga_min: 0,
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
export function jornadaLiquidaMin(
  f: Pick<Funcionario, "entrada" | "saida" | "intervalo_min">,
): number {
  const entrada = hhmmParaMin(f.entrada);
  const saida = hhmmParaMin(f.saida);
  if (Number.isNaN(entrada) || Number.isNaN(saida)) return 0;
  return Math.max(0, saida - entrada - (f.intervalo_min || 0));
}

/** Horário efetivo de um funcionário numa data (trata sábado e folgas). */
export interface JornadaEfetiva {
  entrada: string;
  saida: string;
  intervalo_min: number;
  intervalo_inicio: string;
  intervalo_fim: string;
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
      trabalha,
    };
  }
  return {
    entrada: f.entrada,
    saida: f.saida,
    intervalo_min: f.intervalo_min,
    intervalo_inicio: f.intervalo_inicio,
    intervalo_fim: f.intervalo_fim,
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
 * Tempo previsto da tarefa segundo sua regra de cálculo:
 *  - fixo/manual → tempo_base_min
 *  - por_m2      → tempo_base_min × metragem do local
 *  - por_unidade → tempo_base_min × quantidade
 */
export function tempoPrevistoMin(tarefa: Tarefa, local: Local | undefined): number {
  switch (tarefa.regra_calculo) {
    case "por_m2":
      return Math.round(tarefa.tempo_base_min * (local?.metragem ?? 0));
    case "por_unidade":
      return Math.round(tarefa.tempo_base_min * (tarefa.quantidade || 1));
    case "fixo":
    case "manual":
    default:
      return Math.round(tarefa.tempo_base_min);
  }
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
  const ocupacao = ocupacaoPercentual(planejado, jornada);
  return {
    jornada_liquida_min: jornada,
    tempo_planejado_min: planejado,
    ociosidade_prevista_min: ociosidadePrevistaMin(jornada, planejado),
    ocupacao_percentual: ocupacao,
    classificacao: classificarOcupacao(ocupacao, p),
    total_tarefas: rotinasDoDia.filter((r) => r.status !== "cancelada").length,
  };
}
