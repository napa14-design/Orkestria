"use client";

import { createPortal } from "react-dom";

/**
 * Modal renderizado em portal no <body>: garante que o position:fixed se
 * refira sempre à janela, imune a ancestrais com transform/animação
 * (que virariam containing block e "prenderiam" o modal ao conteúdo).
 */
export default function Modal({
  titulo,
  aberto,
  aoFechar,
  children,
  larguraMax = 640,
}: {
  titulo: string;
  aberto: boolean;
  aoFechar: () => void;
  children: React.ReactNode;
  larguraMax?: number;
}) {
  if (!aberto || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="modal-fundo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div className="modal-caixa" style={{ maxWidth: larguraMax }}>
        <div className="painel-cabecalho">
          <h3 style={{ fontSize: 17 }}>{titulo}</h3>
          <button
            onClick={aoFechar}
            className="btn btn-mini btn-fantasma"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
