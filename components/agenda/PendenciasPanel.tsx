"use client";

/**
 * Cobertura de frequência: o que deveria estar no planejamento de hoje e não
 * está — tarefas diárias não alocadas e periódicas (semanal/quinzenal/mensal)
 * vencidas em relação ao último planejamento.
 */
import { useMemo, useState } from "react";
import { diaDaSemana, DIAS_SEMANA } from "@/lib/dateUtils";
import { calcularPendenciasCobertura } from "@/lib/pendenciasCobertura";
import type { Local, PeriodoLetivo, RotinaPlanejada, Tarefa } from "@/types";

export default function PendenciasPanel({
  tarefas,
  locais,
  rotinasDoDia,
  historico,
  data,
  periodos = [],
  aoAlocarTarefa,
}: {
  tarefas: Tarefa[];
  locais: Local[];
  rotinasDoDia: RotinaPlanejada[];
  /** Rotinas dos últimos ~31 dias (para calcular vencimento das periódicas). */
  historico: RotinaPlanejada[];
  data: string;
  /** Períodos letivos cadastrados (calendário acadêmico por sede). */
  periodos?: PeriodoLetivo[];
  /** Ativa a tarefa no modo rápido e calcula o melhor encaixe disponível. */
  aoAlocarTarefa?: (tarefaId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);

  const localPorId = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);

  const {
    criticasSemCobertura,
    diariasFaltando,
    devidasHoje,
    periodicasVencidas,
    letivasSemCalendario,
  } = useMemo(
    () =>
      calcularPendenciasCobertura({
        tarefas,
        rotinasDoDia,
        historico,
        data,
        periodos,
      }),
    [tarefas, rotinasDoDia, historico, data, periodos],
  );

  const rotuloLocal = (t: Tarefa) => {
    const l = localPorId.get(t.local_id);
    return l ? `${l.nome_local} · ${l.andar}` : "";
  };

  function iniciarAlocacao(tarefaId: string) {
    aoAlocarTarefa?.(tarefaId);
    setAberto(false);
  }

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
  const proximaTarefa =
    criticasSemCobertura[0]?.tarefa ??
    diariasFaltando[0] ??
    devidasHoje[0] ??
    periodicasVencidas[0]?.tarefa;

  return (
    <>
    {avisoCalendario}
    <div
      className="painel entra"
      style={{ marginBottom: 14, borderLeft: `6px solid ${temCritica ? "var(--vermelho)" : "var(--laranja)"}` }}
    >
      <div
        style={{
          width: "100%",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          style={{
            flex: 1,
            minWidth: 240,
            border: "none",
            background: "transparent",
            textAlign: "left",
            fontSize: 13,
            color: "inherit",
          }}
        >
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
          <span className="rotulo" style={{ marginLeft: 8 }}>
            {aberto ? "▲ fechar" : "▼ detalhar"}
          </span>
        </button>
        {proximaTarefa && (
          <button
            type="button"
            className={`btn btn-mini${temCritica ? " btn-primario" : ""}`}
            onClick={() => iniciarAlocacao(proximaTarefa.id)}
            title={`Receber sugestão para ${proximaTarefa.nome_tarefa}`}
          >
            Resolver próxima →
          </button>
        )}
      </div>
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
                <div key={tarefa.id} className="linha-pendencia-acao">
                  <span style={{ flex: 1, minWidth: 180 }}>
                    <span className="selo selo-vermelho" style={{ marginRight: 8 }}>{motivo}</span>
                    <strong>{tarefa.nome_tarefa}</strong>{" "}
                    <span style={{ color: "var(--tinta-3)" }}>— {rotuloLocal(tarefa)}</span>
                  </span>
                  <button type="button" className="btn btn-mini btn-primario" onClick={() => iniciarAlocacao(tarefa.id)}>
                    Alocar →
                  </button>
                </div>
              ))}
            </div>
          )}
          {diariasFaltando.map((t) => (
            <div key={t.id} className="linha-pendencia-acao">
              <span style={{ flex: 1, minWidth: 180 }}>
                <span className="selo selo-laranja" style={{ marginRight: 8 }}>diária</span>
                <strong>{t.nome_tarefa}</strong>{" "}
                <span style={{ color: "var(--tinta-3)" }}>— {rotuloLocal(t)}</span>
              </span>
              <button type="button" className="btn btn-mini" onClick={() => iniciarAlocacao(t.id)}>
                Alocar →
              </button>
            </div>
          ))}
          {devidasHoje.map((t) => (
            <div key={t.id} className="linha-pendencia-acao">
              <span style={{ flex: 1, minWidth: 180 }}>
                <span className="selo selo-azul" style={{ marginRight: 8 }}>
                  {DIAS_SEMANA[diaDaSemana(data)]}
                </span>
                <strong>{t.nome_tarefa}</strong>{" "}
                <span style={{ color: "var(--tinta-3)" }}>
                  — {rotuloLocal(t)} · dia fixo da semana
                </span>
              </span>
              <button type="button" className="btn btn-mini" onClick={() => iniciarAlocacao(t.id)}>
                Alocar →
              </button>
            </div>
          ))}
          {periodicasVencidas.map(({ tarefa, ultima }) => (
            <div key={tarefa.id} className="linha-pendencia-acao">
              <span style={{ flex: 1, minWidth: 180 }}>
                <span className="selo selo-vermelho" style={{ marginRight: 8 }}>
                  {tarefa.frequencia}
                </span>
                <strong>{tarefa.nome_tarefa}</strong>{" "}
                <span style={{ color: "var(--tinta-3)" }}>
                  — {rotuloLocal(tarefa)} ·{" "}
                  {ultima ? `último planejamento em ${ultima}` : "nunca planejada"}
                </span>
              </span>
              <button type="button" className="btn btn-mini" onClick={() => iniciarAlocacao(tarefa.id)}>
                Alocar →
              </button>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "var(--tinta-3)", marginTop: 4 }}>
            Use “Alocar” para receber o melhor encaixe sugerido ou arraste a tarefa manualmente.
          </p>
        </div>
      )}
    </div>
    </>
  );
}
