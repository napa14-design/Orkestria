/**
 * Validações de negócio. Cada função devolve uma lista de AlertaValidacao:
 * nivel "erro" deve bloquear a operação; "alerta" apenas avisa o supervisor.
 */
import type {
  AlertaValidacao,
  Funcionario,
  Local,
  ParametrosResolvidos,
  QualificacaoFuncionario,
  Requisito,
  RotinaPlanejada,
  Tarefa,
} from "@/types";
import {
  jornadaLiquidaMin,
  ocupacaoPercentual,
  tempoPlanejadoMin,
} from "./calculations";
import { hhmmParaMin, intervalosSobrepoem, minParaHHMM } from "./dateUtils";

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

  const intIni = hhmmParaMin(f.intervalo_inicio);
  const intFim = hhmmParaMin(f.intervalo_fim);
  if (
    !Number.isNaN(intIni) &&
    !Number.isNaN(intFim) &&
    intervalosSobrepoem(inicioMin, fimMin, intIni, intFim)
  ) {
    alertas.push({
      nivel: "erro",
      codigo: "INTERVALO",
      mensagem: `Conflito com o intervalo de ${f.nome} (${f.intervalo_inicio}–${f.intervalo_fim}).`,
    });
  }

  for (const r of rotinasExistentes) {
    if (r.status === "cancelada") continue;
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
