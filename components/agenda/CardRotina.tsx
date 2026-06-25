"use client";

/**
 * Um card de rotina na agenda (um {@link Run}). Apresentacional: posição/altura
 * e estilo chegam prontos; ações (mover, redimensionar, abrir detalhe, remover)
 * sobem por callbacks. O estado de redimensionamento vive no AgendaGrid.
 */
import { formatarDuracao, hhmmParaMin } from "@/lib/dateUtils";
import type { Run } from "@/lib/agenda";
import type { Tarefa } from "@/types";

interface CardRotinaProps {
  run: Run;
  tarefa?: Tarefa;
  topo: number;
  altura: number;
  unico: boolean;
  emResize: boolean;
  compacto: boolean;
  espinha: string;
  fundo: string;
  visualBlocos: number;
  /** Duração formatada exibida durante o arrasto da alça (só quando emResize). */
  rotuloResize?: string;
  podeRedimensionar: boolean;
  aoIniciarArrasto?: (blocos: number) => void;
  aoTerminarArrasto?: () => void;
  aoAbrirDetalhe: (run: Run, ancora: DOMRect) => void;
  aoRemoverRun: (run: Run) => void;
  aoIniciarResize: (run: Run, clientY: number, visualBlocos: number) => void;
}

export default function CardRotina({
  run,
  tarefa,
  topo,
  altura,
  unico,
  emResize,
  compacto,
  espinha,
  fundo,
  visualBlocos,
  rotuloResize,
  podeRedimensionar,
  aoIniciarArrasto,
  aoTerminarArrasto,
  aoAbrirDetalhe,
  aoRemoverRun,
  aoIniciarResize,
}: CardRotinaProps) {
  const durMin = hhmmParaMin(run.fim) - hhmmParaMin(run.inicio);
  const nome = tarefa?.nome_tarefa ?? "Tarefa";

  return (
    <div
      className="agenda-card-tarefa pop-card"
      draggable={unico && !emResize}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ tipo: "mover", rotina_id: run.id }));
        e.dataTransfer.effectAllowed = "move";
        aoIniciarArrasto?.(visualBlocos);
      }}
      onDragEnd={() => aoTerminarArrasto?.()}
      onClick={(e) => {
        e.stopPropagation();
        aoAbrirDetalhe(run, (e.currentTarget as HTMLElement).getBoundingClientRect());
      }}
      style={{
        position: "absolute",
        top: topo + 1,
        left: 3,
        right: 3,
        height: altura - 2,
        boxSizing: "border-box",
        background: fundo,
        color: "var(--tinta)",
        padding: "2px 8px",
        overflow: "hidden",
        zIndex: 5,
        borderRadius: 3,
        border: "1px solid var(--linha)",
        borderLeft: `4px solid ${espinha}`,
        boxShadow: "1px 1.5px 0 rgba(34,49,39,0.10)",
        cursor: "pointer",
      }}
      title={`${nome} · ${run.inicio}–${run.fim} · ${formatarDuracao(durMin)}${
        run.membros.length > 1 ? ` (${run.membros.length} blocos contíguos)` : ""
      }\nArraste para mover.`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          aoRemoverRun(run);
        }}
        aria-label="Remover"
        className="card-x"
        style={{ position: "absolute", top: 2, right: 4, border: "none", background: "transparent", color: "inherit", fontSize: 13, fontWeight: 700 }}
      >
        ×
      </button>
      <div
        style={{
          fontWeight: 600,
          fontSize: compacto ? 11 : 12,
          lineHeight: 1.15,
          paddingRight: 14,
          color: "var(--tinta)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: compacto ? 1 : 3,
        }}
      >
        {nome}
      </div>
      {podeRedimensionar && (
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            aoIniciarResize(run, e.clientY, visualBlocos);
          }}
          title="Arraste para mudar a duração (blocos de agenda)"
          className="card-alca"
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 9, cursor: "ns-resize", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, lineHeight: 1, touchAction: "none" }}
        >
          ⠿⠿
        </div>
      )}
      {emResize && rotuloResize && (
        <div className="num" style={{ position: "absolute", bottom: 10, right: 6, fontSize: 10, fontWeight: 700 }}>
          {rotuloResize}
        </div>
      )}
    </div>
  );
}
