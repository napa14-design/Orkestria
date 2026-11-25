/**
 * O total de pessoas no topo de Funcionários (pedido da operação, 25/11/2026): a unidade que está na
 * lista, a soma das unidades que a pessoa vê e, ao abrir, quantas em cada uma.
 */
import { useState } from "react";
import type { EquipeDaSede, ResumoEquipe as Resumo } from "@/lib/resumoEquipe";

type Contagem = Pick<EquipeDaSede, "ativos" | "total">;
const numero = (s: Contagem) => `${s.ativos}${s.total > s.ativos ? ` de ${s.total}` : ""}`;
const ativos = (s: Contagem) => `${numero(s)} ${s.ativos === 1 ? "ativo" : "ativos"}`;

export default function ResumoEquipe({ resumo, sedeId }: { resumo: Resumo; sedeId: string }) {
  // Abre minimizado: uma linha. A lista por unidade só aparece para quem pede.
  const [aberto, setAberto] = useState(false);
  if (resumo.total === 0) return null;
  const daSede = resumo.porSede.find((s) => s.sede_id === sedeId);
  const varias = resumo.porSede.length > 1;
  const linha = (
    <>
      <span className="rotulo">Funcionários</span>
      {daSede && (
        <span style={{ fontSize: 13.5 }}>
          {daSede.nome}: <strong className="num">{ativos(daSede)}</strong>
        </span>
      )}
      {(varias || !daSede) && (
        <span style={{ fontSize: 13.5 }}>
          Total{varias ? ` em ${resumo.porSede.length} unidades` : ""}: <strong className="num">{ativos(resumo)}</strong>
        </span>
      )}
    </>
  );
  const estilo = { display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" } as const;
  if (!varias) return <div className="painel" style={{ ...estilo, padding: "12px 16px", marginBottom: 16 }}>{linha}</div>;
  return (
    <details className="painel" style={{ padding: "12px 16px", marginBottom: 16 }} open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary style={{ ...estilo, cursor: "pointer" }}>
        {linha}
        <span style={{ fontSize: 12.5, color: "var(--tinta-2)", marginLeft: "auto" }}>{aberto ? "▴ minimizar" : "▾ ver por unidade"}</span>
      </summary>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: "6px 20px", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {resumo.porSede.map((s) => (
          <li key={s.sede_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5, fontWeight: s.sede_id === sedeId ? 700 : undefined }}>
            <span>{s.nome}</span>
            <span className="num" style={{ whiteSpace: "nowrap" }}>{numero(s)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
