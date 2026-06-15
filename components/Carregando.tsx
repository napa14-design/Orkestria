/**
 * Indicador de carregamento "Tetris": bloquinhos coloridos caem e empilham,
 * no lugar do spinner genérico. Usa as cores do sistema (azul/amarelo/verde/
 * vinho) — remete à própria agenda de blocos do Orkestria.
 */
const BLOCOS = ["var(--azul)", "var(--amarelo)", "var(--verde)", "var(--acento)"];

export default function Carregando({
  texto = "Carregando…",
  style,
}: {
  texto?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: 28,
        ...style,
      }}
    >
      <div className="tetris-poco" aria-hidden="true">
        {BLOCOS.map((cor, i) => (
          <span
            key={i}
            className="tetris-bloco"
            style={{
              bottom: i * 13,
              background: cor,
              animationDelay: `${i * 0.22}s`,
            }}
          />
        ))}
      </div>
      {texto && (
        <span className="rotulo" style={{ color: "var(--tinta-3)" }}>
          {texto}
        </span>
      )}
      <span
        role="status"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        Carregando
      </span>
    </div>
  );
}
