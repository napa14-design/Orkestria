"use client";

/** Alertas de validação (conflitos, sobrecarga, etc.) com auto-dispensa. */
import type { AlertaValidacao } from "@/types";

export default function AlertPanel({
  alertas,
  aoLimpar,
}: {
  alertas: AlertaValidacao[];
  aoLimpar: () => void;
}) {
  if (alertas.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 200,
        display: "grid",
        gap: 8,
        maxWidth: 420,
      }}
      className="entra"
    >
      {alertas.map((a, i) => (
        <div key={`${a.codigo}-${i}`} className={`alerta ${a.nivel === "erro" ? "alerta-erro" : "alerta-aviso"}`} style={{ boxShadow: "var(--sombra-leve)" }}>
          <strong style={{ fontFamily: "var(--fonte-mono)", fontSize: 10, textTransform: "uppercase", paddingTop: 2 }}>
            {a.nivel === "erro" ? "✕" : "⚠"}
          </strong>
          <span style={{ flex: 1 }}>{a.mensagem}</span>
        </div>
      ))}
      <button className="btn btn-mini" onClick={aoLimpar} style={{ justifySelf: "end" }}>
        Limpar avisos
      </button>
    </div>
  );
}
