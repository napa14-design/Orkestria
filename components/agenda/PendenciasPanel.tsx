"use client";

/**
 * Cobertura de frequência: o que deveria estar no planejamento de hoje e não
 * está — tarefas diárias não alocadas e periódicas (semanal/quinzenal/mensal)
 * vencidas em relação ao último planejamento.
 */
import { useMemo, useState } from "react";
import { diaDaSemana, DIAS_SEMANA, parseDiasSemana } from "@/lib/dateUtils";
import type { Local, RotinaPlanejada, Tarefa } from "@/types";

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
}: {
  tarefas: Tarefa[];
  locais: Local[];
  rotinasDoDia: RotinaPlanejada[];
  /** Rotinas dos últimos ~31 dias (para calcular vencimento das periódicas). */
  historico: RotinaPlanejada[];
  data: string;
}) {
  const [aberto, setAberto] = useState(false);

  const localPorId = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);

  const { diariasFaltando, devidasHoje, periodicasVencidas } = useMemo(() => {
    const alocadasHoje = new Set(rotinasDoDia.map((r) => r.tarefa_id));
    const dowHoje = diaDaSemana(data);
    const ultimaData = new Map<string, string>();
    for (const r of historico) {
      if (r.status === "cancelada") continue;
      const atual = ultimaData.get(r.tarefa_id);
      if (!atual || r.data > atual) ultimaData.set(r.tarefa_id, r.data);
    }

    const diarias: Tarefa[] = [];
    const doDia: Tarefa[] = [];
    const periodicas: Array<{ tarefa: Tarefa; ultima: string | null }> = [];
    for (const t of tarefas) {
      if (!t.ativo || alocadasHoje.has(t.id)) continue;
      const dias = t.frequencia === "semanal" ? parseDiasSemana(t.dias_semana) : [];
      if (t.frequencia === "diaria") {
        diarias.push(t);
      } else if (dias.length) {
        // periodicidade fina: devida exatamente nos dias da semana marcados
        if (dias.includes(dowHoje)) doDia.push(t);
      } else if (t.frequencia in JANELA_DIAS) {
        const ultima = ultimaData.get(t.id) ?? null;
        const limite = JANELA_DIAS[t.frequencia];
        const diasDesde = ultima
          ? Math.floor(
              (new Date(`${data}T12:00:00`).getTime() -
                new Date(`${ultima}T12:00:00`).getTime()) /
                86_400_000,
            )
          : Infinity;
        if (diasDesde >= limite) periodicas.push({ tarefa: t, ultima });
      }
    }
    return { diariasFaltando: diarias, devidasHoje: doDia, periodicasVencidas: periodicas };
  }, [tarefas, rotinasDoDia, historico, data]);

  const total = diariasFaltando.length + devidasHoje.length + periodicasVencidas.length;
  if (total === 0) {
    return (
      <div
        className="painel entra"
        style={{ marginBottom: 14, padding: "8px 14px", borderLeft: "6px solid var(--verde)", fontSize: 13 }}
      >
        ✓ <strong>Cobertura completa:</strong> todas as tarefas diárias estão alocadas
        e nenhuma periódica está vencida.
      </div>
    );
  }

  const rotuloLocal = (t: Tarefa) => {
    const l = localPorId.get(t.local_id);
    return l ? `${l.nome_local} · ${l.andar}` : "";
  };

  return (
    <div
      className="painel entra"
      style={{ marginBottom: 14, borderLeft: "6px solid var(--laranja)" }}
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
          ⚠ <strong>Ficou de fora hoje:</strong>{" "}
          {[
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
  );
}
