"use client";

/**
 * Remanejo entre sedes (Fase F) — visão de gerência multi-sede. Lista as tarefas
 * de funcionários ausentes em TODAS as sedes e permite atribuí-las a colegas com
 * folga, inclusive de outra sede. A movimentação passa pelas validações normais
 * (jornada, conflito, conformidade); cruzar sedes é destacado (há deslocamento).
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import { jornadaDoDia, jornadaLiquidaMin } from "@/lib/calculations";
import { apiPut, ErroApi, fetcher } from "@/lib/clientApi";
import { formatarDataBR, formatarDuracao, hojeISO } from "@/lib/dateUtils";
import type { Ausencia, Funcionario, RotinaPlanejada, Sede, Tarefa } from "@/types";

export default function PaginaRemanejo() {
  const [data, setData] = useState(hojeISO());
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [movendo, setMovendo] = useState<string | null>(null);

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: tarefas } = useSWR<Tarefa[]>("/api/tarefas", fetcher);
  const { data: rotinas, mutate } = useSWR<RotinaPlanejada[]>(`/api/rotinas?data=${data}`, fetcher);
  const { data: ausencias } = useSWR<Ausencia[]>(`/api/ausencias?data=${data}`, fetcher);

  const carregando = !sedes || !funcionarios || !rotinas || !ausencias;

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const tarefaPorId = useMemo(() => new Map((tarefas ?? []).map((t) => [t.id, t])), [tarefas]);
  const funcPorId = useMemo(() => new Map((funcionarios ?? []).map((f) => [f.id, f])), [funcionarios]);

  // ids de funcionários ausentes no dia
  const ausentes = useMemo(
    () => new Set((ausencias ?? []).map((a) => a.funcionario_id)),
    [ausencias],
  );

  // tarefas órfãs (de ausentes) em todas as sedes
  const orfas = useMemo(
    () =>
      (rotinas ?? [])
        .filter((r) => ausentes.has(r.funcionario_id) && (r.status === "planejada" || r.status === "pendente"))
        .sort((a, b) => nomeSede(a.sede_id).localeCompare(nomeSede(b.sede_id)) || a.inicio_planejado.localeCompare(b.inicio_planejado)),
    [rotinas, ausentes], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // candidatos (presentes) com folga estimada no dia, em todas as sedes
  const candidatos = useMemo(() => {
    return (funcionarios ?? [])
      .filter((f) => f.ativo && !ausentes.has(f.id) && jornadaDoDia(f, data).trabalha)
      .map((f) => {
        const minhas = (rotinas ?? []).filter((r) => r.funcionario_id === f.id && r.status !== "cancelada");
        const planejado = minhas.reduce((s, r) => s + (r.tempo_previsto_min || 0), 0);
        const folga = Math.max(0, jornadaLiquidaMin({ ...f, ...jornadaDoDia(f, data) }) - planejado);
        return { funcionario: f, folga };
      })
      .sort((a, b) => b.folga - a.folga);
  }, [funcionarios, ausentes, rotinas, data]);

  async function mover(r: RotinaPlanejada) {
    const destino = destinos[r.id];
    if (!destino) return;
    setMovendo(r.id);
    setErro("");
    setMsg("");
    try {
      await apiPut(`/api/rotinas/${r.id}`, { funcionario_id: destino, inicio_planejado: r.inicio_planejado });
      const d = funcPorId.get(destino);
      setMsg(`"${tarefaPorId.get(r.tarefa_id)?.nome_tarefa ?? "Tarefa"}" remanejada para ${d?.nome ?? ""}.`);
      await mutate();
      setDestinos((s) => ({ ...s, [r.id]: "" }));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao remanejar.");
    } finally {
      setMovendo(null);
    }
  }

  return (
    <div className="entra">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Remanejo entre sedes</h1>
          <p style={{ color: "var(--tinta-2)", marginTop: 2 }}>
            Tarefas de ausentes em todas as sedes, cobríveis por colegas com folga — inclusive de outra sede.
          </p>
        </div>
        <label className="campo"><span className="rotulo">Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
      </div>

      {msg && <div className="alerta alerta-ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {erro && <div className="alerta alerta-erro" style={{ marginBottom: 12 }}>{erro}</div>}

      {carregando ? (
        <div className="painel"><Carregando texto="Carregando…" style={{ padding: 48 }} /></div>
      ) : orfas.length === 0 ? (
        <div className="painel" style={{ padding: 28, textAlign: "center", color: "var(--tinta-3)" }}>
          Nenhuma tarefa órfã em {formatarDataBR(data)} — nenhum ausente com tarefas planejadas.
        </div>
      ) : (
        <div className="painel" style={{ padding: 12, display: "grid", gap: 8 }}>
          {orfas.map((r) => {
            const tarefa = tarefaPorId.get(r.tarefa_id);
            const ausente = funcPorId.get(r.funcionario_id);
            const destino = destinos[r.id] ?? "";
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, borderBottom: "1px dashed var(--linha)", paddingBottom: 8 }}>
                <span className="selo selo-cinza" style={{ minWidth: 90, justifyContent: "center" }}>{nomeSede(r.sede_id)}</span>
                <span className="num" style={{ color: "var(--tinta-2)", width: 84 }}>{r.inicio_planejado}–{r.fim_planejado}</span>
                <span style={{ flex: 1, minWidth: 180 }}>
                  <strong>{tarefa?.nome_tarefa ?? "Tarefa"}</strong>{" "}
                  <span style={{ color: "var(--tinta-3)" }}>(de {ausente?.nome ?? "?"} · {formatarDuracao(r.tempo_previsto_min)})</span>
                </span>
                <select value={destino} onChange={(e) => setDestinos((d) => ({ ...d, [r.id]: e.target.value }))} style={{ fontSize: 12, padding: 4, minWidth: 220 }}>
                  <option value="">— remanejar para —</option>
                  {candidatos
                    .filter(({ funcionario }) => !tarefa?.restricao_genero || funcionario.genero === tarefa.restricao_genero)
                    .map(({ funcionario, folga }) => {
                      const outra = funcionario.sede_id !== r.sede_id;
                      return (
                        <option key={funcionario.id} value={funcionario.id}>
                          {outra ? "↗ " : ""}{funcionario.nome}{outra ? ` (${nomeSede(funcionario.sede_id)})` : ""} · livre {formatarDuracao(folga)}
                        </option>
                      );
                    })}
                </select>
                {destino && funcPorId.get(destino)?.sede_id !== r.sede_id && (
                  <span className="selo selo-amarelo" title="Cruza sedes: há deslocamento envolvido">↗ outra sede</span>
                )}
                <button className="btn btn-mini btn-primario" disabled={!destino || movendo === r.id} onClick={() => mover(r)}>
                  {movendo === r.id ? "…" : "Remanejar →"}
                </button>
              </div>
            );
          })}
          <p style={{ fontSize: 11, color: "var(--tinta-3)" }}>
            A movimentação mantém o horário e passa pelas validações (jornada, conflito, conformidade).
            Remanejar entre sedes implica deslocamento — combine o transporte à parte.
          </p>
        </div>
      )}
    </div>
  );
}
