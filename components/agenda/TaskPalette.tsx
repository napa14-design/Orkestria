"use client";

/** Lado esquerdo da tela de rotina: tarefas disponíveis para arrastar. */
import { useMemo, useState } from "react";
import { tempoPrevistoMin, blocosOcupados } from "@/lib/calculations";
import { formatarDuracao } from "@/lib/dateUtils";
import type { Local, Tarefa } from "@/types";

const COR_PRIORIDADE: Record<string, string> = {
  alta: "var(--vermelho)",
  media: "var(--amarelo)",
  baixa: "var(--cinza-bloco)",
};

export default function TaskPalette({
  tarefas,
  locais,
  blocoMin,
  aoIniciarArrasto,
  aoTerminarArrasto,
}: {
  tarefas: Tarefa[];
  locais: Local[];
  blocoMin: number;
  /** Informa quantos blocos o item arrastado ocupa (para o fantasma da agenda). */
  aoIniciarArrasto?: (blocos: number) => void;
  aoTerminarArrasto?: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtroAndar, setFiltroAndar] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");

  const localPorId = useMemo(
    () => new Map(locais.map((l) => [l.id, l])),
    [locais],
  );

  const andares = useMemo(
    () => [...new Set(locais.map((l) => l.andar).filter(Boolean))].sort(),
    [locais],
  );
  const tipos = useMemo(
    () => [...new Set(tarefas.map((t) => t.tipo_tarefa).filter(Boolean))].sort(),
    [tarefas],
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tarefas.filter((t) => {
      if (!t.ativo) return false;
      const local = localPorId.get(t.local_id);
      if (filtroAndar && local?.andar !== filtroAndar) return false;
      if (filtroTipo && t.tipo_tarefa !== filtroTipo) return false;
      if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false;
      if (q) {
        const texto = `${t.nome_tarefa} ${local?.nome_local ?? ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [tarefas, localPorId, busca, filtroAndar, filtroTipo, filtroPrioridade]);

  return (
    <aside className="painel entra paleta-tarefas">
      <div className="painel-cabecalho" style={{ padding: "10px 12px" }}>
        <span className="rotulo">Tarefas disponíveis</span>
        <span className="selo selo-cinza num">{visiveis.length}</span>
      </div>

      <div style={{ padding: 10, display: "grid", gap: 6, borderBottom: "1px solid var(--linha)" }}>
        <input
          placeholder="Buscar tarefa/local…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ padding: "6px 8px", border: "1.5px solid var(--tinta)", borderRadius: 3, background: "var(--cartao)", fontSize: 13, width: "100%", boxSizing: "border-box" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
          <select value={filtroAndar} onChange={(e) => setFiltroAndar(e.target.value)} style={{ fontSize: 12, padding: 4, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            <option value="">Andar: todos</option>
            {andares.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ fontSize: 12, padding: 4, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            <option value="">Tipo: todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={filtroPrioridade}
            onChange={(e) => setFiltroPrioridade(e.target.value)}
            style={{ fontSize: 12, padding: 4, gridColumn: "1 / -1", width: "100%", minWidth: 0, boxSizing: "border-box" }}
          >
            <option value="">Prioridade: todas</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: 10, display: "grid", gap: 8 }}>
        {visiveis.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--tinta-3)", textAlign: "center", padding: 12 }}>
            Nenhuma tarefa para os filtros atuais.
          </p>
        )}
        {visiveis.map((t) => {
          const local = localPorId.get(t.local_id);
          const previsto = tempoPrevistoMin(t, local);
          const blocos = blocosOcupados(previsto, blocoMin);
          return (
            <div
              key={t.id}
              className="agenda-card-tarefa"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "text/plain",
                  JSON.stringify({ tipo: "nova", tarefa_id: t.id }),
                );
                e.dataTransfer.effectAllowed = "copy";
                aoIniciarArrasto?.(blocos);
              }}
              onDragEnd={() => aoTerminarArrasto?.()}
              style={{ background: "var(--cartao)", padding: "8px 10px", borderLeft: `5px solid ${COR_PRIORIDADE[t.prioridade] ?? "var(--cinza-bloco)"}` }}
              title="Arraste para a agenda de um funcionário"
            >
              <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25 }}>
                {t.nome_tarefa}
                {t.restricao_genero && (
                  <span
                    title={`Restrita a ASG ${t.restricao_genero === "feminino" ? "mulheres" : "homens"}`}
                    style={{ marginLeft: 5, color: t.restricao_genero === "feminino" ? "var(--vermelho)" : "var(--azul)", fontWeight: 700 }}
                  >
                    {t.restricao_genero === "feminino" ? "♀" : "♂"}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--tinta-2)", marginTop: 2 }}>
                {local ? `${local.nome_local} · ${local.andar}` : "local?"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, alignItems: "center" }}>
                <span className="num" style={{ fontSize: 11, fontWeight: 700 }}>
                  {formatarDuracao(previsto)}
                </span>
                <span className="rotulo" style={{ fontSize: 9 }}>
                  {blocos} bloco{blocos > 1 ? "s" : ""} · ⠿
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
