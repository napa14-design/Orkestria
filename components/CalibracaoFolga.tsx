"use client";

/**
 * Calibração da folga (buffer) por sede a partir de dados reais (Fase C).
 * Deriva uma sugestão de folga mínima = tempo médio de imprevistos por dia ÷
 * capacidade diária da sede (soma das jornadas líquidas). É uma sugestão
 * transparente para o admin calibrar o parâmetro — não aplica nada sozinha.
 */
import { useMemo } from "react";
import { jornadaLiquidaMin } from "@/lib/calculations";
import { formatarDuracao } from "@/lib/dateUtils";
import type { Funcionario, Sede, ServicoEventual } from "@/types";

function diasNoPeriodo(de: string, ate: string): number {
  const a = new Date(`${de}T12:00:00`).getTime();
  const b = new Date(`${ate}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 1;
  return Math.floor((b - a) / 86_400_000) + 1;
}

export default function CalibracaoFolga({
  servicosEventuais,
  funcionarios,
  sedes,
  de,
  ate,
  sedeFiltro,
}: {
  servicosEventuais: ServicoEventual[];
  funcionarios: Funcionario[];
  sedes: Sede[];
  de: string;
  ate: string;
  sedeFiltro: string;
}) {
  const linhas = useMemo(() => {
    const dias = diasNoPeriodo(de, ate);
    const alvo = sedes.filter((s) => s.ativo && (!sedeFiltro || s.id === sedeFiltro));
    return alvo.map((sede) => {
      const funcs = funcionarios.filter((f) => f.ativo && f.sede_id === sede.id);
      const capacidadeDia = funcs.reduce((soma, f) => soma + jornadaLiquidaMin(f), 0);
      const imprevistoMin = servicosEventuais
        .filter((e) => e.sede_id === sede.id && e.tipo === "imprevisto" && e.data >= de && e.data <= ate)
        .reduce((soma, e) => soma + (e.tempo_min || 0), 0);
      const medioDia = imprevistoMin / dias;
      const folgaSugerida = capacidadeDia > 0 ? Math.round((medioDia / capacidadeDia) * 100) : 0;
      return { sede, capacidadeDia, imprevistoMin, medioDia, folgaSugerida };
    });
  }, [servicosEventuais, funcionarios, sedes, de, ate, sedeFiltro]);

  const temImprevisto = linhas.some((l) => l.imprevistoMin > 0);

  return (
    <div className="painel" style={{ marginBottom: 16 }}>
      <div className="painel-cabecalho" style={{ padding: "10px 14px" }}>
        <span className="rotulo">Calibração da folga por sede (imprevistos do período)</span>
      </div>
      <div style={{ padding: 12, overflowX: "auto" }}>
        {!temImprevisto ? (
          <p style={{ fontSize: 13, color: "var(--tinta-3)", margin: 0 }}>
            Nenhum imprevisto registrado no período. Registre imprevistos em
            <strong> Eventuais</strong> para o sistema sugerir a folga de cada sede com base em
            dados reais.
          </p>
        ) : (
          <table className="tabela" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Sede</th>
                <th style={{ textAlign: "right" }}>Imprevistos no período</th>
                <th style={{ textAlign: "right" }}>Média/dia</th>
                <th style={{ textAlign: "right" }}>Capacidade/dia</th>
                <th style={{ textAlign: "right" }}>Folga sugerida</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.sede.id}>
                  <td>{l.sede.nome_sede}</td>
                  <td className="num" style={{ textAlign: "right" }}>{formatarDuracao(l.imprevistoMin)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{formatarDuracao(Math.round(l.medioDia))}</td>
                  <td className="num" style={{ textAlign: "right" }}>{formatarDuracao(l.capacidadeDia)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`selo num ${l.folgaSugerida >= 10 ? "selo-amarelo" : "selo-verde"}`}>
                      ≈ {l.folgaSugerida}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: "var(--tinta-3)", marginTop: 8 }}>
          Sugestão = tempo médio de imprevistos por dia ÷ capacidade diária da sede (soma das
          jornadas líquidas). Ajuste a folga real em <strong>Parâmetros</strong> (folga_minima_percentual).
        </p>
      </div>
    </div>
  );
}
