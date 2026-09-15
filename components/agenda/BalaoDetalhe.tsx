"use client";

/**
 * Balãozinho de detalhes de um card (abre ao clicar). Recebe o {@link Run} e as
 * entidades já resolvidas; deriva o que exibe daí (sem objeto pré-formatado).
 */
import { useEffect, useState } from "react";
import { formatarDuracao, hhmmParaMin } from "@/lib/dateUtils";
import type { Run } from "@/lib/agenda";
import type { Categoria, Local, StatusRotina, Tarefa } from "@/types";

const ROTULO_STATUS: Record<StatusRotina, string> = {
  planejada: "Planejada",
  realizada: "Realizada",
  nao_realizada: "Não realizada",
  remanejada: "Remanejada",
  pendente: "Pendente",
  cancelada: "Cancelada",
};

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, margin: "3px 0" }}>
      <span style={{ color: "var(--tinta-3)" }}>{rotulo}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{valor}</span>
    </div>
  );
}

interface BalaoDetalheProps {
  run: Run;
  /** Âncora: canto superior-direito do card clicado (viewport). */
  x: number;
  y: number;
  tarefa?: Tarefa;
  local?: Local;
  categoria?: Categoria;
  aoRemover: (run: Run) => void;
  aoFechar: () => void;
  /**
   * Muda hora e duração sem arrastar. Existe porque arrastar é o único caminho
   * hoje, e num monitor pequeno — onde a lista de tarefas e a grade brigam pelo
   * espaço — arrastar é o passo em que a pessoa trava.
   */
  aoEditar?: (run: Run, inicio: string, duracaoMin: number) => void;
}

export default function BalaoDetalhe({ run, x, y, tarefa, local, categoria, aoRemover, aoFechar, aoEditar }: BalaoDetalheProps) {
  const duracaoMin = hhmmParaMin(run.fim) - hhmmParaMin(run.inicio);
  const [editando, setEditando] = useState(false);
  const [inicio, setInicio] = useState(run.inicio);
  const [minutos, setMinutos] = useState(String(duracaoMin));
  // Um run é a junção de blocos iguais e seguidos. Mexer só no primeiro
  // desmancharia a junção sem avisar, então a edição fica para o bloco único.
  const unico = run.membros.length === 1;
  // Fecha no Esc ou ao rolar a página.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", aoFechar, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", aoFechar, true);
    };
  }, [aoFechar]);

  const dur = formatarDuracao(duracaoMin);
  const localTxt = local
    ? `${local.nome_local}${local.andar && local.andar !== "—" ? ` · ${local.andar}` : ""}`
    : undefined;
  const botao: React.CSSProperties = {
    flex: 1,
    border: "1px solid var(--linha)",
    background: "var(--papel)",
    borderRadius: 4,
    padding: "5px 0",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <>
      <div onClick={aoFechar} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: Math.min(x + 8, window.innerWidth - 256),
          top: Math.max(8, Math.min(y, window.innerHeight - 230)),
          width: 240,
          zIndex: 41,
          background: "var(--cartao)",
          border: "1px solid var(--tinta)",
          borderRadius: 6,
          boxShadow: "3px 4px 0 rgba(34,49,39,0.18)",
          padding: "12px 14px",
          color: "var(--tinta)",
        }}
      >
        <button
          onClick={aoFechar}
          aria-label="Fechar"
          title="Fechar"
          style={{
            position: "absolute", top: 4, right: 6, border: "none", background: "transparent",
            color: "var(--tinta-3)", fontSize: 18, lineHeight: 1, fontWeight: 700, cursor: "pointer", padding: "2px 4px",
          }}
        >
          ×
        </button>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, lineHeight: 1.25, paddingRight: 16, fontFamily: "var(--fonte-serif, inherit)" }}>
          {tarefa?.nome_tarefa ?? "Tarefa"}
        </div>
        <Linha rotulo="Horário" valor={`${run.inicio}–${run.fim}`} />
        <Linha rotulo="Duração" valor={dur} />
        {localTxt && <Linha rotulo="Local" valor={localTxt} />}
        {categoria && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, margin: "3px 0" }}>
            <span style={{ color: "var(--tinta-3)", marginRight: "auto" }}>Categoria</span>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: categoria.cor || "#3a6ea5", display: "inline-block" }} />
            <span style={{ fontWeight: 600 }}>{categoria.nome}</span>
          </div>
        )}
        <Linha rotulo="Situação" valor={ROTULO_STATUS[run.status]} />
        {run.membros.length > 1 && <Linha rotulo="Blocos" valor={`${run.membros.length} contíguos`} />}
        {editando ? (
          <div style={{ marginTop: 10, borderTop: "1px solid var(--linha)", paddingTop: 10 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: "var(--tinta-3)" }}>Começa às</span>
              <input
                type="time"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                style={{ width: 100, padding: "4px 6px", border: "1.5px solid var(--tinta)", borderRadius: 3, background: "var(--cartao)", fontSize: 12 }}
              />
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ color: "var(--tinta-3)" }}>Dura (min)</span>
              <input
                type="number"
                min={5}
                step={5}
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
                style={{ width: 100, padding: "4px 6px", border: "1.5px solid var(--tinta)", borderRadius: 3, background: "var(--cartao)", fontSize: 12 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => setEditando(false)} style={{ ...botao, color: "var(--tinta-2)" }}>
                Cancelar
              </button>
              <button
                onClick={() => {
                  const m = Number(minutos);
                  if (!inicio || !Number.isFinite(m) || m <= 0) return;
                  aoEditar?.(run, inicio, m);
                  aoFechar();
                }}
                style={{ ...botao, background: "var(--acento)", color: "#fff", borderColor: "var(--acento)" }}
              >
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => aoRemover(run)} style={{ ...botao, color: "var(--vermelho)" }}>
              Remover
            </button>
            <button
              onClick={() => setEditando(true)}
              disabled={!aoEditar || !unico}
              title={unico ? "Mudar hora e duração" : "Este card junta blocos iguais e seguidos — ajuste pela grade."}
              style={{ ...botao, color: aoEditar && unico ? "var(--tinta)" : "var(--tinta-3)", cursor: aoEditar && unico ? "pointer" : "not-allowed" }}
            >
              Editar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
