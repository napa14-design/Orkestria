/**
 * Símbolo da Orkestria em SVG vetorial: o "O" em vinho amaranto atravessado
 * pela batuta de maestro, com barras de crescimento dentro do vazado.
 *
 * variante "claro"  → barras evergreen (para fundos claros/marfim)
 * variante "escuro" → barras marfim (para o cabeçalho evergreen e fundos escuros)
 */
const VINHO = "#9c0d38";

export default function LogoOrkestria({
  variante = "claro",
  tamanho = 32,
}: {
  variante?: "claro" | "escuro";
  tamanho?: number;
}) {
  const corBarras = variante === "escuro" ? "#f5f1e6" : "#223127";
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Símbolo da Orkestria"
      style={{ flexShrink: 0 }}
    >
      {/* O didone (elipse externa + vazado interno) */}
      <path
        fillRule="evenodd"
        fill={VINHO}
        d="M58 14a34 42 0 1 0 0 84a34 42 0 1 0 0-84Zm0 8a20 34 0 1 1 0 68a20 34 0 1 1 0-68Z"
      />
      {/* barras de crescimento dentro do vazado */}
      <rect x="44" y="58" width="6" height="14" rx="1" fill={corBarras} />
      <rect x="54" y="50" width="6" height="22" rx="1" fill={corBarras} />
      <rect x="64" y="42" width="6" height="30" rx="1" fill={corBarras} />
      {/* batuta do maestro (afinada na ponta, bolinha na empunhadura) */}
      <path d="M12 99 L94 35 L97 40 Z" fill={VINHO} />
      <circle cx="99" cy="34" r="5.5" fill={VINHO} />
    </svg>
  );
}
