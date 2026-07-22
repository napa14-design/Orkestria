import { statusPeriodoLetivo } from "./calculations";
import { diaDaSemana, parseDiasSemana } from "./dateUtils";
import type { PeriodoLetivo, RotinaPlanejada, Tarefa } from "@/types";

const JANELA_DIAS: Record<string, number> = {
  semanal: 7,
  quinzenal: 14,
  mensal: 30,
};

export interface PendenciasCobertura {
  criticasSemCobertura: Array<{ tarefa: Tarefa; motivo: string }>;
  diariasFaltando: Tarefa[];
  devidasHoje: Tarefa[];
  periodicasVencidas: Array<{ tarefa: Tarefa; ultima: string | null }>;
  letivasSemCalendario: Tarefa[];
}

/**
 * Calcula o circuito de tarefas esperado para uma data.
 *
 * A função é compartilhada pela agenda (feedback imediato) e pela Central do
 * dia (priorização operacional), evitando duas interpretações de cobertura.
 */
export function calcularPendenciasCobertura(args: {
  tarefas: Tarefa[];
  rotinasDoDia: RotinaPlanejada[];
  historico: RotinaPlanejada[];
  data: string;
  periodos?: PeriodoLetivo[];
}): PendenciasCobertura {
  const alocadasHoje = new Set(
    args.rotinasDoDia
      .filter((r) => r.status !== "cancelada")
      .map((r) => r.tarefa_id),
  );
  const dowHoje = diaDaSemana(args.data);
  const ultimaData = new Map<string, string>();

  for (const r of args.historico) {
    if (r.status === "cancelada") continue;
    const atual = ultimaData.get(r.tarefa_id);
    if (!atual || r.data > atual) ultimaData.set(r.tarefa_id, r.data);
  }

  const criticasSemCobertura: PendenciasCobertura["criticasSemCobertura"] = [];
  const diariasFaltando: Tarefa[] = [];
  const devidasHoje: Tarefa[] = [];
  const periodicasVencidas: PendenciasCobertura["periodicasVencidas"] = [];
  const letivasSemCalendario: Tarefa[] = [];

  for (const tarefa of args.tarefas) {
    if (!tarefa.ativo || alocadasHoje.has(tarefa.id)) continue;

    let avisoSemCalendario = false;
    if (tarefa.depende_calendario) {
      const status = statusPeriodoLetivo(
        args.periodos ?? [],
        tarefa.sede_id,
        args.data,
      );
      if (status === "fora") continue;
      avisoSemCalendario = status === "sem_calendario";
    }

    const dias =
      tarefa.frequencia === "semanal"
        ? parseDiasSemana(tarefa.dias_semana)
        : [];
    let regra: "diaria" | "doDia" | "periodica" | null = null;
    let ultima: string | null = null;

    if (tarefa.frequencia === "diaria") {
      regra = "diaria";
    } else if (dias.length > 0) {
      if (dias.includes(dowHoje)) regra = "doDia";
    } else if (tarefa.frequencia in JANELA_DIAS) {
      ultima = ultimaData.get(tarefa.id) ?? null;
      const limite = JANELA_DIAS[tarefa.frequencia];
      const diasDesde = ultima
        ? Math.floor(
            (new Date(`${args.data}T12:00:00`).getTime() -
              new Date(`${ultima}T12:00:00`).getTime()) /
              86_400_000,
          )
        : Infinity;
      if (diasDesde >= limite) regra = "periodica";
    }

    if (!regra) continue;
    if (avisoSemCalendario) letivasSemCalendario.push(tarefa);

    if (tarefa.critica) {
      const motivo =
        regra === "diaria"
          ? "diária"
          : regra === "doDia"
            ? "dia fixo"
            : tarefa.frequencia;
      criticasSemCobertura.push({ tarefa, motivo });
    } else if (regra === "diaria") {
      diariasFaltando.push(tarefa);
    } else if (regra === "doDia") {
      devidasHoje.push(tarefa);
    } else {
      periodicasVencidas.push({ tarefa, ultima });
    }
  }

  return {
    criticasSemCobertura,
    diariasFaltando,
    devidasHoje,
    periodicasVencidas,
    letivasSemCalendario,
  };
}
