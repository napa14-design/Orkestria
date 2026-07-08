"use client";

/** Log de alterações: quem mudou o quê e quando, em todo o sistema. */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/clientApi";
import type { RegistroHistorico } from "@/types";

const ROTULO_TABELA: Record<string, string> = {
  usuarios: "Usuários",
  funcionarios: "Funcionários",
  sedes: "Sedes",
  locais: "Locais",
  tarefas: "Tarefas",
  rotinas_planejadas: "Rotinas",
  execucoes_realizadas: "Execuções",
  parametros: "Parâmetros",
  modelos_rotina: "Modelos",
  ausencias: "Ausências",
};

const SELO_ACAO: Record<string, { classe: string; rotulo: string }> = {
  criar: { classe: "selo-verde", rotulo: "Criou" },
  atualizar: { classe: "selo-azul", rotulo: "Alterou" },
  excluir: { classe: "selo-vermelho", rotulo: "Excluiu" },
};

function formatarQuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PaginaHistorico() {
  const [tabela, setTabela] = useState("");
  const [busca, setBusca] = useState("");
  const [dias, setDias] = useState(30); // janela de tempo (0 = tudo, pesado)

  const { data, isLoading } = useSWR<RegistroHistorico[]>(
    `/api/historico?dias=${dias}${tabela ? `&tabela=${tabela}` : ""}`,
    fetcher,
  );

  const itens = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((h) =>
      `${h.usuario} ${h.resumo} ${h.tabela}`.toLowerCase().includes(q),
    );
  }, [data, busca]);

  return (
    <div className="entra">
      <div
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Histórico de alterações</h1>
          <p style={{ color: "var(--tinta-2)", marginTop: 2 }}>
            Toda criação, alteração e exclusão fica registrada automaticamente, com autor e horário.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {!tabela && (
            <select
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              title="Janela de tempo (evita ler todo o histórico)"
              style={{ padding: "8px 10px", border: "1.5px solid var(--tinta)", borderRadius: 4, background: "var(--cartao)" }}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={0}>Tudo (pesado)</option>
            </select>
          )}
          <select value={tabela} onChange={(e) => setTabela(e.target.value)} style={{ padding: "8px 10px", border: "1.5px solid var(--tinta)", borderRadius: 4, background: "var(--cartao)" }}>
            <option value="">Tudo</option>
            {Object.entries(ROTULO_TABELA).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
          <input
            placeholder="Buscar por usuário/resumo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ padding: "8px 12px", border: "1.5px solid var(--tinta)", borderRadius: 4, background: "var(--cartao)", width: 220 }}
          />
        </div>
      </div>

      <div className="painel" style={{ overflow: "auto" }}>
        <table className="tabela">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Quando</th>
              <th>Usuário</th>
              <th style={{ width: 90 }}>Ação</th>
              <th style={{ width: 120 }}>Onde</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--tinta-3)" }}>Carregando…</td></tr>
            )}
            {!isLoading && itens.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--tinta-3)" }}>Nenhuma alteração registrada ainda.</td></tr>
            )}
            {itens.map((h) => {
              const selo = SELO_ACAO[h.acao] ?? SELO_ACAO.atualizar;
              return (
                <tr key={h.id}>
                  <td className="num" style={{ fontSize: 12 }}>{formatarQuando(h.criado_em)}</td>
                  <td style={{ fontSize: 13 }}>{h.usuario}</td>
                  <td><span className={`selo ${selo.classe}`}>{selo.rotulo}</span></td>
                  <td>{ROTULO_TABELA[h.tabela] ?? h.tabela}</td>
                  <td style={{ fontSize: 12, color: "var(--tinta-2)" }}>
                    {h.acao === "atualizar" && h.resumo ? `campos: ${h.resumo}` : h.resumo}
                    <span style={{ color: "var(--tinta-3)" }}> · id {h.registro_id.slice(0, 8)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
