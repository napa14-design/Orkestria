/**
 * Cobertura de frequência: o que deveria estar no planejamento do dia e não está
 * — tarefas diárias não alocadas, de dia fixo e periódicas vencidas em relação ao
 * último planejamento. Uma regra só para o painel da Agenda e para a Central: em
 * 04/11/2026 a Central dizia "em ordem" sem olhar nada disto.
 */
import { coberturaPorHistorico, ocupaHorario, statusPeriodoLetivo } from "./calculations";
import { diaDaSemana, parseDiasSemana } from "./dateUtils";
import type { PeriodoLetivo, RotinaPlanejada, Tarefa } from "@/types";

const JANELA_DIAS: Record<string, number> = {
  semanal: 7,
  quinzenal: 14,
  mensal: 30,
};

export function pendenciasDoDia(args: {
  tarefas: Tarefa[];
  rotinasDoDia: RotinaPlanejada[];
  /** Rotinas dos últimos ~31 dias (para calcular vencimento das periódicas). */
  historico: RotinaPlanejada[];
  data: string;
  /** Períodos letivos cadastrados (calendário acadêmico por sede). */
  periodos: PeriodoLetivo[];
}) {
  const { tarefas, rotinasDoDia, historico, data, periodos } = args;
  const alocadasHoje = new Set(rotinasDoDia.filter(ocupaHorario).map((r) => r.tarefa_id));
  const dowHoje = diaDaSemana(data);
  const ultimaData = new Map<string, string>();
  for (const r of historico) {
    if (!ocupaHorario(r)) continue;
    const atual = ultimaData.get(r.tarefa_id);
    if (!atual || r.data > atual) ultimaData.set(r.tarefa_id, r.data);
  }

  const criticas: Array<{ tarefa: Tarefa; motivo: string }> = [];
  const diarias: Tarefa[] = [];
  const doDia: Tarefa[] = [];
  const periodicas: Array<{ tarefa: Tarefa; ultima: string | null }> = [];
  const semCal: Tarefa[] = [];
  for (const t of tarefas) {
    if (!t.ativo || alocadasHoje.has(t.id)) continue;

    // Calendário acadêmico: tarefas letivas só são cobradas em período letivo.
    let avisoSemCalendario = false;
    if (t.depende_calendario) {
      const st = statusPeriodoLetivo(periodos, t.sede_id, data);
      if (st === "fora") continue; // férias/recesso → não é exigida hoje
      avisoSemCalendario = st === "sem_calendario";
    }

    const dias = t.frequencia === "semanal" ? parseDiasSemana(t.dias_semana) : [];

    // decide se a tarefa é esperada hoje e por qual regra
    let regra: "diaria" | "doDia" | "periodica" | null = null;
    let ultima: string | null = null;
    if (t.frequencia === "diaria") {
      regra = "diaria";
    } else if (dias.length) {
      if (dias.includes(dowHoje)) regra = "doDia";
    } else if (coberturaPorHistorico(t) && t.frequencia in JANELA_DIAS) {
      // Mesma regra que decide se a Agenda busca o histórico — uma só, para
      // as duas não se desencontrarem.
      ultima = ultimaData.get(t.id) ?? null;
      const limite = JANELA_DIAS[t.frequencia];
      const diasDesde = ultima
        ? Math.floor(
            (new Date(`${data}T12:00:00`).getTime() -
              new Date(`${ultima}T12:00:00`).getTime()) /
              86_400_000,
          )
        : Infinity;
      if (diasDesde >= limite) regra = "periodica";
    }
    if (!regra) continue;

    // devida hoje, mas a sede não tem calendário cadastrado → sinaliza
    if (avisoSemCalendario) semCal.push(t);

    // tarefas críticas saem dos baldes normais e vão para o circuito essencial
    if (t.critica) {
      const motivo =
        regra === "diaria" ? "diária" : regra === "doDia" ? "dia fixo" : t.frequencia;
      criticas.push({ tarefa: t, motivo });
      continue;
    }
    if (regra === "diaria") diarias.push(t);
    else if (regra === "doDia") doDia.push(t);
    else periodicas.push({ tarefa: t, ultima });
  }
  return {
    criticasSemCobertura: criticas,
    diariasFaltando: diarias,
    devidasHoje: doDia,
    periodicasVencidas: periodicas,
    letivasSemCalendario: semCal,
  };
}
