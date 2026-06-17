"use client";

/**
 * Cobertura de frequência: o que deveria estar no planejamento de hoje e não
 * está — tarefas diárias não alocadas e periódicas (semanal/quinzenal/mensal)
 * vencidas em relação ao último planejamento.
 */
import { useMemo, useState } from "react";
import { statusPeriodoLetivo } from "@/lib/calculations";
import { diaDaSemana, DIAS_SEMANA, parseDiasSemana } from "@/lib/dateUtils";
import type { Local, PeriodoLetivo, RotinaPlanejada, Tarefa } from "@/types";

const JANELA_DIAS: Record<string, number> = {
  semanal: 7,
  quinzenal: 14,
  mensal: 30,
};

export default function PendenciasPanel({
  tarefas,
  locais,
  rotinasDoDia,
  historico,
  data,
  periodos = [],
}: {
  tarefas: Tarefa[];
  locais: Local[];
  rotinasDoDia: RotinaPlanejada[];
  /** Rotinas dos últimos ~31 dias (para calcular vencimento das periódicas). */
  historico: RotinaPlanejada[];
  data: string;
  /** Períodos letivos cadastrados (calendário acadêmico por sede). */
  periodos?: PeriodoLetivo[];
}) {
  const [aberto, setAberto] = useState(false);

  const localPorId = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);

  const { criticasSemCobertura, diariasFaltando, devidasHoje, periodicasVencidas, letivasSemCalendario } = useMemo(() => {
    const alocadasHoje = new Set(rotinasDoDia.map((r) => r.tarefa_id));
    const dowHoje = diaDaSemana(data);
    const ultimaData = new Map<string, string>();
    for (const r of historico) {
      if (r.status === "cancelada") continue;
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
      } else if (t.frequencia in JANELA_DIAS) {
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
  }, [tarefas, rotinasDoDia, historico, data, periodos]);

  const rotuloLocal = (t: Tarefa) => {
    const l = localPorId.get(t.local_id);
    return l ? `${l.nome_local} · ${l.andar}` : "";
  };

  // Aviso forte: tarefa letiva sendo cobrada sem calendário cadastrado na sede.
  const avisoCalendario =
    letivasSemCalendario.length > 0 ? (
      <div
        className="painel entra"
        style={{ marginBottom: 14, padding: "8px 14px", borderLeft: "6px solid var(--vermelho)", fontSize: 13 }}
      >
        📅 <strong>Calendário acadêmico não cadastrado:</strong>{" "}
        {letivasSemCalendario.length} tarefa(s) que dependem do calendário estão
        sendo cobradas sem um período letivo cadastrado para a sede —{" "}
        {letivasSemCalendario.map((t) => t.nome_tarefa).join(", ")}. Cadastre o
        período em <strong>Estrutura → Calendário acadêmico</strong> para não exigir
        tarefas letivas em férias.
      </div>
    ) : null;

  const total =
    criticasSemCobertura.length +
    diariasFaltando.length +
    devidasHoje.length +
    periodicasVencidas.length;
  if (total === 0) {
    return (
      <>
        {avisoCalendario}
        <div
          className="painel entra"
          style={{ marginBottom: 14, padding: "8px 14px", borderLeft: "6px solid var(--verde)", fontSize: 13 }}
        >
          ✓ <strong>Cobertura completa:</strong> todas as tarefas diárias estão alocadas
          e nenhuma periódica está vencida.
        </div>
      </>
    );
  }

  const temCritica = criticasSemCobertura.length > 0;

  return (
    <>
    {avisoCalendario}
    <div
      className="painel entra"
      style={{ marginBottom: 14, borderLeft: `6px solid ${temCritica ? "var(--vermelho)" : "var(--laranja)"}` }}
    >
      <button
        onClick={() => setAberto(!aberto)}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          padding: "8px 14px",
          textAlign: "left",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ flex: 1 }}>
          {temCritica ? "⛔ " : "⚠ "}
          <strong>{temCritica ? "Circuito essencial descoberto:" : "Ficou de fora hoje:"}</strong>{" "}
          {[
            temCritica && `${criticasSemCobertura.length} crítica(s)`,
            diariasFaltando.length > 0 && `${diariasFaltando.length} diária(s) sem alocação`,
            devidasHoje.length > 0 && `${devidasHoje.length} do dia (dia fixo)`,
            periodicasVencidas.length > 0 && `${periodicasVencidas.length} periódica(s) vencida(s)`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="rotulo">{aberto ? "▲ fechar" : "▼ detalhar"}</span>
      </button>
      {aberto && (
        <div style={{ padding: "0 14px 12px", display: "grid", gap: 4, fontSize: 13 }}>
          {temCritica && (
            <div
              style={{
                marginBottom: 4,
                padding: "6px 8px",
                background: "var(--papel-2)",
                borderLeft: "4px solid var(--vermelho)",
                borderRadius: 3,
                display: "grid",
                gap: 4,
              }}
            >
              <span className="rotulo" style={{ color: "var(--vermelho)" }}>
                ⛔ Circuito essencial — cobrir com prioridade
              </span>
              {criticasSemCobertura.map(({ tarefa, motivo }) => (
                <div key={tarefa.id}>
                  <span className="selo selo-vermelho" style={{ marginRight: 8 }}>{motivo}</span>
                  <strong>{tarefa.nome_tarefa}</strong>{" "}
                  <span style={{ color: "var(--tinta-3)" }}>— {rotuloLocal(tarefa)}</span>
                </div>
              ))}
            </div>
          )}
          {diariasFaltando.map((t) => (
            <div key={t.id}>
              <span className="selo selo-laranja" style={{ marginRight: 8 }}>diária</span>
              <strong>{t.nome_tarefa}</strong>{" "}
              <span style={{ color: "var(--tinta-3)" }}>— {rotuloLocal(t)}</span>
            </div>
          ))}
          {devidasHoje.map((t) => (
            <div key={t.id}>
              <span className="selo selo-azul" style={{ marginRight: 8 }}>
                {DIAS_SEMANA[diaDaSemana(data)]}
              </span>
              <strong>{t.nome_tarefa}</strong>{" "}
              <span style={{ color: "var(--tinta-3)" }}>
                — {rotuloLocal(t)} · dia fixo da semana
              </span>
            </div>
          ))}
          {periodicasVencidas.map(({ tarefa, ultima }) => (
            <div key={tarefa.id}>
              <span className="selo selo-vermelho" style={{ marginRight: 8 }}>
                {tarefa.frequencia}
              </span>
              <strong>{tarefa.nome_tarefa}</strong>{" "}
              <span style={{ color: "var(--tinta-3)" }}>
                — {rotuloLocal(tarefa)} ·{" "}
                {ultima ? `último planejamento em ${ultima}` : "nunca planejada"}
              </span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "var(--tinta-3)", marginTop: 4 }}>
            Arraste essas tarefas da paleta à esquerda para a agenda de alguém.
          </p>
        </div>
      )}
    </div>
    </>
  );
}
