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
  /**
   * A tarefa termina depois da saída do funcionário. Não bloqueia nada — o
   * sistema permite de propósito (rota que não cabe na jornada é o dado que
   * interessa) —, mas precisa ser VISÍVEL, senão passa por tarefa normal.
   */
  passaDaSaida?: boolean;
  /** Hora de saída, só para explicar no tooltip. */
  saida?: string;
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
  passaDaSaida,
  saida,
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
  /**
   * Card curto demais para o texto padrão. A escala é ~2,4px por minuto, então
   * uma tarefa de 5min tem 12px de altura — e uma linha de 12px com entrelinha
   * 1,15 mais o respiro pede ~17px. O texto era simplesmente cortado no meio.
   * Rotas com muita tarefa curta não são exceção: na CESIU são 92 de 151.
   * Aqui o card aperta a tipografia e devolve o espaço que estava reservado
   * para o "×" (que só aparece no hover), em vez de esconder o nome da tarefa.
   */
  const micro = altura < 20;

  return (
    <div
      className={`agenda-card-tarefa pop-card${passaDaSaida ? " passa-da-saida" : ""}`}
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
        // Hachura amaranto por cima do fundo do status: o mesmo desenho das
        // faixas de "fora do turno" e de ocioso, para ler como a mesma família.
        // Precisa ser inline — a faixa `.celula-fora-jornada` fica ATRÁS do card,
        // e classe CSS não vence `background`/`border` inline.
        background: passaDaSaida
          ? `repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(156,13,56,0.16) 5px, rgba(156,13,56,0.16) 10px), ${fundo}`
          : fundo,
        color: "var(--tinta)",
        padding: micro ? "0 6px" : "2px 8px",
        overflow: "hidden",
        zIndex: 5,
        borderRadius: 3,
        border: passaDaSaida ? "1px dashed var(--acento)" : "1px solid var(--linha)",
        borderLeft: `4px solid ${passaDaSaida ? "var(--acento)" : espinha}`,
        boxShadow: "1px 1.5px 0 rgba(34,49,39,0.10)",
        cursor: "pointer",
      }}
      title={`${nome} · ${run.inicio}–${run.fim} · ${formatarDuracao(durMin)}${
        run.membros.length > 1 ? ` (${run.membros.length} blocos contíguos)` : ""
      }${
        passaDaSaida
          ? `\n⚠ Passa da saída${saida ? ` (${saida})` : ""} — este serviço não cabe na jornada.`
          : ""
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
          fontSize: micro ? 10 : compacto ? 11 : 12,
          lineHeight: micro ? 1 : 1.15,
          paddingRight: micro ? 4 : 14,
          color: "var(--tinta)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: micro || compacto ? 1 : 3,
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
