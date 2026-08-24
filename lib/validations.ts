/**
 * Validações de negócio. Cada função devolve uma lista de AlertaValidacao:
 * nivel "erro" deve bloquear a operação; "alerta" apenas avisa o supervisor.
 */
import type {
  AlertaValidacao,
  Funcionario,
  Local,
  NivelQualificacao,
  ParametrosResolvidos,
  QualificacaoFuncionario,
  Requisito,
  RotinaPlanejada,
  Tarefa,
} from "@/types";
import { NIVEL_ORDEM } from "@/types";
import {
  intervalosDoFuncionario,
  jornadaLiquidaMin,
  ocupacaoPercentual,
  tempoPlanejadoMin,
} from "./calculations";
import { hhmmParaMin, intervalosSobrepoem, minParaHHMM } from "./dateUtils";
import { problemaNosIntervalos } from "./intervalos";

/** Valida a alocação de um bloco [inicioMin, fimMin) na agenda do funcionário. */
export function validarAlocacao(args: {
  funcionario: Funcionario;
  rotinasExistentes: RotinaPlanejada[]; // do mesmo funcionário/dia, sem a rotina movida
  inicioMin: number;
  fimMin: number;
  tarefa?: Tarefa;
  local?: Local;
  parametros: ParametrosResolvidos;
  tempoPrevistoNovo: number;
  /** Conformidade: catálogo de requisitos + qualificações do funcionário + data. */
  requisitosCatalogo?: Requisito[];
  qualificacoesFuncionario?: QualificacaoFuncionario[];
  data?: string;
  /**
   * Ids de tarefas **de espera** — as que ocupam o relógio, não a pessoa
   * (ex.: café: coloca a água e sai). Elas não geram conflito de horário nem
   * nos dois sentidos: nem a nova em cima de uma existente, nem o contrário.
   *
   * Sem este conjunto, tudo se comporta como antes. Quem chama e tem as
   * tarefas em mão passa; quem não tem, não muda de comportamento.
   */
  tarefasEspera?: Set<string>;
}): AlertaValidacao[] {
  const { funcionario: f, rotinasExistentes, inicioMin, fimMin } = args;
  const alertas: AlertaValidacao[] = [];

  const entrada = hhmmParaMin(f.entrada);
  const saida = hhmmParaMin(f.saida);

  if (Number.isNaN(entrada) || Number.isNaN(saida)) {
    alertas.push({
      nivel: "erro",
      codigo: "SEM_JORNADA",
      mensagem: `${f.nome} não possui jornada cadastrada.`,
    });
    return alertas;
  }

  // Regra de horário: a tarefa não pode INICIAR fora do expediente, mas PODE
  // terminar depois da saída (uma tarefa começada perto do fim do turno se
  // estende — a decisão da ata é "pode terminar, não iniciar fora").
  if (inicioMin < entrada || inicioMin >= saida) {
    alertas.push({
      nivel: "erro",
      codigo: "FORA_DO_EXPEDIENTE",
      mensagem: `Tarefa inicia fora do expediente de ${f.nome} (${f.entrada}–${f.saida}).`,
    });
  }

  for (const iv of intervalosDoFuncionario(f)) {
    const intIni = hhmmParaMin(iv.inicio);
    const intFim = hhmmParaMin(iv.fim);
    if (
      !Number.isNaN(intIni) &&
      !Number.isNaN(intFim) &&
      intervalosSobrepoem(inicioMin, fimMin, intIni, intFim)
    ) {
      alertas.push({
        nivel: "erro",
        codigo: "INTERVALO",
        mensagem: `Conflito com o intervalo de ${f.nome} (${iv.inicio}–${iv.fim}).`,
      });
      break;
    }
  }

  // Tarefa de espera não disputa a pessoa: o equipamento trabalha, ela não.
  // Marcar aqui vale para os dois lados — a nova sobre uma existente e a
  // existente sob a nova.
  const espera = args.tarefasEspera;
  const novaEhEspera = args.tarefa?.espera === true;
  for (const r of rotinasExistentes) {
    if (r.status === "cancelada") continue;
    if (novaEhEspera || espera?.has(r.tarefa_id)) continue;
    const rIni = hhmmParaMin(r.inicio_planejado);
    const rFim = hhmmParaMin(r.fim_planejado);
    if (intervalosSobrepoem(inicioMin, fimMin, rIni, rFim)) {
      alertas.push({
        nivel: "erro",
        codigo: "SOBREPOSICAO",
        mensagem: `Sobreposição com tarefa já planejada às ${r.inicio_planejado} (${minParaHHMM(rIni)}–${minParaHHMM(rFim)}).`,
      });
      break;
    }
  }

  if (args.tarefa && args.tempoPrevistoNovo <= 0) {
    alertas.push({
      nivel: "erro",
      codigo: "SEM_TEMPO_PREVISTO",
      mensagem: `A tarefa "${args.tarefa.nome_tarefa}" está sem tempo previsto.`,
    });
  }

  // Restrição de gênero (ex.: banheiro feminino só por ASG mulher).
  if (
    args.tarefa?.restricao_genero &&
    f.genero !== args.tarefa.restricao_genero
  ) {
    alertas.push({
      nivel: "erro",
      codigo: "RESTRICAO_GENERO",
      mensagem: `"${args.tarefa.nome_tarefa}" é restrita a ASG ${
        args.tarefa.restricao_genero === "feminino" ? "mulheres" : "homens"
      } — ${f.nome} não pode executá-la.`,
    });
  }

  // Requisitos de execução (aptidão/treinamento): bloqueiam quem não tem ou
  // está vencido. EPI é exibido na UI, mas não bloqueia (confirmação é futura).
  const exigidos = (args.tarefa?.requisitos ?? "").split(",").filter(Boolean);
  if (exigidos.length && args.requisitosCatalogo) {
    const catPorId = new Map(args.requisitosCatalogo.map((r) => [r.id, r]));
    const minhas = args.qualificacoesFuncionario ?? [];
    for (const reqId of exigidos) {
      const req = catPorId.get(reqId);
      if (!req || req.tipo === "epi") continue; // EPI não bloqueia
      const q = minhas.find((x) => x.requisito_id === reqId && x.funcionario_id === f.id);
      if (!q) {
        alertas.push({
          nivel: "erro",
          codigo: "REQUISITO_FALTANDO",
          mensagem: `${f.nome} não possui o requisito "${req.nome}" exigido por "${args.tarefa?.nome_tarefa}".`,
        });
      } else if (q.validade && args.data && q.validade < args.data) {
        alertas.push({
          nivel: "erro",
          codigo: "REQUISITO_VENCIDO",
          mensagem: `O requisito "${req.nome}" de ${f.nome} venceu em ${q.validade}.`,
        });
      }
    }
  }

  // Janela de horário (ex.: refeitório só após o almoço).
  if (args.tarefa?.janela_inicio && args.tarefa?.janela_fim) {
    const ji = hhmmParaMin(args.tarefa.janela_inicio);
    const jf = hhmmParaMin(args.tarefa.janela_fim);
    if (!Number.isNaN(ji) && !Number.isNaN(jf) && (inicioMin < ji || fimMin > jf)) {
      alertas.push({
        nivel: "erro",
        codigo: "JANELA_HORARIO",
        mensagem: `"${args.tarefa.nome_tarefa}" só pode ser feita entre ${args.tarefa.janela_inicio} e ${args.tarefa.janela_fim}.`,
      });
    }
  }

  if (
    args.tarefa?.regra_calculo === "por_m2" &&
    (!args.local || args.local.metragem <= 0)
  ) {
    alertas.push({
      nivel: "alerta",
      codigo: "LOCAL_SEM_METRAGEM",
      mensagem: `O local "${args.local?.nome_local ?? "?"}" está sem metragem cadastrada.`,
    });
  }

  // Sobrecarga é alerta, não bloqueio: o supervisor decide.
  const jornada = jornadaLiquidaMin(f);
  const planejadoComNova =
    tempoPlanejadoMin(rotinasExistentes) + args.tempoPrevistoNovo;
  const ocupacao = ocupacaoPercentual(planejadoComNova, jornada);
  if (ocupacao > args.parametros.ocupacao_alta) {
    alertas.push({
      nivel: "alerta",
      codigo: "SOBRECARGA",
      mensagem: `${f.nome} ficará com ${ocupacao.toFixed(0)}% de ocupação (sobrecarga).`,
    });
  }

  return alertas;
}

export function validarFuncionario(f: Partial<Funcionario>): AlertaValidacao[] {
  const alertas: AlertaValidacao[] = [];
  if (!f.nome?.trim())
    alertas.push({ nivel: "erro", codigo: "NOME", mensagem: "Nome é obrigatório." });
  if (!f.sede_id)
    alertas.push({
      nivel: "erro",
      codigo: "FUNCIONARIO_SEM_SEDE",
      mensagem: "Todo funcionário precisa estar vinculado a uma sede.",
    });
  if (Number.isNaN(hhmmParaMin(f.entrada ?? "")) || Number.isNaN(hhmmParaMin(f.saida ?? "")))
    alertas.push({
      nivel: "erro",
      codigo: "SEM_JORNADA",
      mensagem: "Horários de entrada e saída são obrigatórios (HH:mm).",
    });
  // O intervalo entra na jornada líquida, que é o denominador de toda ocupação
  // do sistema. CSV malformado passava batido e sumia da conta em silêncio.
  const problema = problemaNosIntervalos(f.intervalos, { entrada: f.entrada, saida: f.saida });
  if (problema)
    alertas.push({ nivel: "erro", codigo: "INTERVALOS_INVALIDOS", mensagem: problema });
  return alertas;
}

export function validarLocal(l: Partial<Local>): AlertaValidacao[] {
  const alertas: AlertaValidacao[] = [];
  if (!l.sede_id)
    alertas.push({
      nivel: "erro",
      codigo: "LOCAL_SEM_SEDE",
      mensagem: "Todo local precisa ter uma sede associada.",
    });
  if (!l.nome_local?.trim())
    alertas.push({ nivel: "erro", codigo: "NOME", mensagem: "Nome do local é obrigatório." });
  if (!l.metragem || l.metragem <= 0)
    alertas.push({
      nivel: "alerta",
      codigo: "LOCAL_SEM_METRAGEM",
      mensagem: "Local sem metragem: tarefas por m² não terão tempo calculado.",
    });
  return alertas;
}

export function validarTarefa(t: Partial<Tarefa>): AlertaValidacao[] {
  const alertas: AlertaValidacao[] = [];
  if (!t.local_id)
    alertas.push({
      nivel: "erro",
      codigo: "TAREFA_SEM_LOCAL",
      mensagem: "Toda tarefa precisa estar vinculada a um local.",
    });
  if (!t.nome_tarefa?.trim())
    alertas.push({ nivel: "erro", codigo: "NOME", mensagem: "Nome da tarefa é obrigatório." });
  if (!t.tempo_base_min || t.tempo_base_min <= 0)
    alertas.push({
      nivel: "erro",
      codigo: "SEM_TEMPO_PREVISTO",
      mensagem: "Tempo base deve ser maior que zero.",
    });
  return alertas;
}

export function validarRotina(r: Partial<RotinaPlanejada>): AlertaValidacao[] {
  const alertas: AlertaValidacao[] = [];
  const obrigatorios: Array<[keyof RotinaPlanejada, string]> = [
    ["funcionario_id", "funcionário"],
    ["tarefa_id", "tarefa"],
    ["local_id", "local"],
    ["sede_id", "sede"],
    ["data", "data"],
    ["inicio_planejado", "horário de início"],
  ];
  for (const [campo, rotulo] of obrigatorios) {
    if (!r[campo])
      alertas.push({
        nivel: "erro",
        codigo: `ROTINA_SEM_${String(campo).toUpperCase()}`,
        mensagem: `Rotina sem ${rotulo}.`,
      });
  }
  return alertas;
}

export function temErro(alertas: AlertaValidacao[]): boolean {
  return alertas.some((a) => a.nivel === "erro");
}

/**
 * Quem chamar primeiro para uma tarefa que exige requisitos — pedido da ata de
 * 17/07 ("direcionar a pessoa mais habilitada", ex.: montagem de palco).
 *
 * Espelha a MESMA regra de conformidade do bloqueio (posse + validade, EPI não
 * conta), mas só ORDENA: não decide quem pode: quem tem a qualificação válida
 * continua liberado, com ou sem nível. O nível efetivo é o MENOR entre os
 * requisitos exigidos — de nada adianta ser referência numa habilitação e
 * apenas apto na outra que a tarefa também pede.
 *
 * Devolve [] quando a tarefa não exige nada (não há o que sugerir).
 */
export function sugerirPorHabilitacao(args: {
  tarefa: Tarefa;
  funcionarios: Funcionario[];
  qualificacoes: QualificacaoFuncionario[];
  requisitosCatalogo: Requisito[];
  data: string;
}): { funcionario: Funcionario; nivel: NivelQualificacao }[] {
  const exigidos = (args.tarefa.requisitos ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!exigidos.length) return [];
  const catPorId = new Map(args.requisitosCatalogo.map((r) => [r.id, r]));
  // MESMO critério do bloqueio (linhas acima): só EPI é dispensado. Requisito
  // fora do catálogo ou com tipo em branco continua contando — divergir daqui
  // faria a paleta sugerir alguém que a alocação recusaria.
  const bloqueantes = exigidos.filter((id) => catPorId.get(id)?.tipo !== "epi");
  if (!bloqueantes.length) return [];

  // Índice (funcionário|requisito) → evita varrer todas as qualificações dentro
  // do laço (a paleta chama isto para cada tarefa visível).
  const porFuncReq = new Map<string, QualificacaoFuncionario>();
  for (const q of args.qualificacoes) porFuncReq.set(`${q.funcionario_id}|${q.requisito_id}`, q);

  const saida: { funcionario: Funcionario; nivel: NivelQualificacao }[] = [];
  for (const f of args.funcionarios) {
    let menor: NivelQualificacao | null = null;
    let habilitado = true;
    for (const reqId of bloqueantes) {
      const q = porFuncReq.get(`${f.id}|${reqId}`);
      if (!q || (q.validade && q.validade < args.data)) {
        habilitado = false;
        break;
      }
      // hasOwn: `in` aceitaria "toString" e derrubaria a ordenação com NaN.
      const nv: NivelQualificacao =
        q.nivel && Object.hasOwn(NIVEL_ORDEM, q.nivel) ? q.nivel : "apto";
      if (!menor || NIVEL_ORDEM[nv] < NIVEL_ORDEM[menor]) menor = nv;
    }
    if (habilitado && menor) saida.push({ funcionario: f, nivel: menor });
  }
  return saida.sort(
    (a, b) =>
      NIVEL_ORDEM[b.nivel] - NIVEL_ORDEM[a.nivel] ||
      a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR"),
  );
}
