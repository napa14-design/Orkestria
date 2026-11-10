"use client";

/**
 * Sede da tela. Quem só opera uma sede vê o nome dela, sem lista para abrir: a lista de uma
 * opção só era clique sem efeito (pedido do dono, 10/11/2026).
 */
import type { Sede } from "@/types";

export default function SeletorSede({
  sedes,
  valor,
  aoMudar,
}: {
  sedes: Sede[];
  valor: string;
  aoMudar: (id: string) => void;
}) {
  const ativas = sedes.filter((s) => s.ativo);
  return (
    <div className="campo">
      <span className="rotulo">Sede</span>
      {ativas.length === 1 ? (
        <span className="seletor-sede-unica">{ativas[0].nome_sede}</span>
      ) : (
        <label className="seletor-lista">
          <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label="Sede">
            {ativas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome_sede}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
