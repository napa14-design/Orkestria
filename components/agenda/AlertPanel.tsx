"use client";

/** Alertas de validação (conflitos, sobrecarga, etc.) — fecháveis e com auto-dispensa. */
import { useEffect, useRef } from "react";
import type { AlertaValidacao } from "@/types";

const AUTO_DISPENSA_MS = 7000;

export default function AlertPanel({
  alertas,
  aoLimpar,
  aoDispensar,
}: {
  alertas: AlertaValidacao[];
  aoLimpar: () => void;
  /** Dispensa um aviso específico pelo índice. */
  aoDispensar?: (index: number) => void;
}) {
  // Some sozinho alguns segundos após o último aviso aparecer.
  const limparRef = useRef(aoLimpar);
  limparRef.current = aoLimpar;
  useEffect(() => {
    if (alertas.length === 0) return;
    const t = setTimeout(() => limparRef.current(), AUTO_DISPENSA_MS);
    return () => clearTimeout(t);
  }, [alertas]);

  if (alertas.length === 0) return null;
  return (
    <div
      style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "grid", gap: 8, maxWidth: 420 }}
      className="entra"
    >
      {alertas.map((a, i) => (
        <div
          key={`${a.codigo}-${i}`}
          className={`alerta ${a.nivel === "erro" ? "alerta-erro" : "alerta-aviso"}`}
          style={{ boxShadow: "var(--sombra-leve)", alignItems: "flex-start" }}
        >
          <strong style={{ fontFamily: "var(--fonte-mono)", fontSize: 10, textTransform: "uppercase", paddingTop: 2 }}>
            {a.nivel === "erro" ? "✕" : "⚠"}
          </strong>
          <span style={{ flex: 1 }}>{a.mensagem}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => (aoDispensar ? aoDispensar(i) : aoLimpar())}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontSize: 18,
              lineHeight: 1,
              padding: "0 2px",
              marginLeft: 4,
              opacity: 0.65,
            }}
          >
            ×
          </button>
        </div>
      ))}
      {alertas.length > 1 && (
        <button className="btn btn-mini" onClick={aoLimpar} style={{ justifySelf: "end" }}>
          Limpar todos
        </button>
      )}
    </div>
  );
}
