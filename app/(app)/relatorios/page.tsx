"use client";

/**
 * Relatório mensal por funcionário — consolida os serviços realizados no mês
 * (a partir das execuções) em folhas imprimíveis, uma por funcionário, com
 * totais e linhas de assinatura para o cliente assinar.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, formatarDuracao, hojeISO } from "@/lib/dateUtils";
import type {
  ExecucaoRealizada,
  Funcionario,
  Local,
  RotinaPlanejada,
  Sede,
  Tarefa,
} from "@/types";

const ROTULO_STATUS: Record<string, string> = {
  conforme_planejado: "Conforme",
  com_atraso: "Com atraso",
  parcial: "Parcial",
  nao_realizada: "Não realizada",
  remanejada: "Remanejada",
  cancelada: "Cancelada",
};
const REALIZADAS = ["conforme_planejado", "com_atraso", "parcial"];

/** Primeiro e último dia (YYYY-MM-DD) de um mês "YYYY-MM". */
function intervaloDoMes(mes: string): [string, string] {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, "0")}`];
}

export default function PaginaRelatorios() {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [sedeEscolhida, setSedeEscolhida] = useState("");

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const sedeId = sedeEscolhida || sedes?.find((s) => s.ativo)?.id || "";
  const [de, ate] = intervaloDoMes(mes);

  const { data: funcionarios } = useSWR<Funcionario[]>(
    sedeId ? `/api/funcionarios?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: tarefas } = useSWR<Tarefa[]>(
    sedeId ? `/api/tarefas?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: locais } = useSWR<Local[]>(
    sedeId ? `/api/locais?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: rotinas } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?de=${de}&ate=${ate}&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: execucoes } = useSWR<ExecucaoRealizada[]>(
    `/api/execucoes?de=${de}&ate=${ate}`,
    fetcher,
  );

  const sede = (sedes ?? []).find((s) => s.id === sedeId);
  const tarefaPorId = useMemo(() => new Map((tarefas ?? []).map((t) => [t.id, t])), [tarefas]);
  const localPorId = useMemo(() => new Map((locais ?? []).map((l) => [l.id, l])), [locais]);
  const rotinaPorId = useMemo(() => new Map((rotinas ?? []).map((r) => [r.id, r])), [rotinas]);

  const carregando = !sedes || !funcionarios || !rotinas || !execucoes;

  // Execuções do mês cujas rotinas são desta sede, agrupadas por funcionário.
  const porFuncionario = useMemo(() => {
    const grupos = new Map<
      string,
      { funcionario: Funcionario; linhas: Array<{ exec: ExecucaoRealizada; rotina: RotinaPlanejada }> }
    >();
    for (const e of execucoes ?? []) {
      const rotina = rotinaPorId.get(e.rotina_id);
      if (!rotina) continue; // execução de outra sede/período
      const func = (funcionarios ?? []).find((f) => f.id === rotina.funcionario_id);
      if (!func) continue;
      const g = grupos.get(func.id) ?? { funcionario: func, linhas: [] };
      g.linhas.push({ exec: e, rotina });
      grupos.set(func.id, g);
    }
    for (const g of grupos.values())
      g.linhas.sort((a, b) => a.exec.data_execucao.localeCompare(b.exec.data_execucao));
    return [...grupos.values()].sort((a, b) =>
      a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR"),
    );
  }, [execucoes, rotinaPorId, funcionarios]);

  const mesBR = (() => {
    const [ano, m] = mes.split("-");
    const nomes = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    return `${nomes[Number(m)]} de ${ano}`;
  })();

  return (
    <div>
      {/* barra de ações — some na impressão */}
      <div
        className="nao-imprimir painel"
        style={{ display: "flex", alignItems: "flex-end", gap: 14, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap" }}
      >
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>Relatório mensal</h1>
          <span className="rotulo" style={{ color: "var(--acento)" }}>
            serviços realizados por funcionário · para o cliente assinar
          </span>
        </div>
        <label className="campo">
          <span className="rotulo">Mês</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        <label className="campo">
          <span className="rotulo">Sede</span>
          <select value={sedeId} onChange={(e) => setSedeEscolhida(e.target.value)}>
            {(sedes ?? [])
              .filter((s) => s.ativo)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome_sede}
                </option>
              ))}
          </select>
        </label>
        <button className="btn btn-primario" onClick={() => window.print()} disabled={carregando || porFuncionario.length === 0}>
          🖨 Imprimir
        </button>
      </div>

      {carregando && (
        <div className="painel nao-imprimir">
          <Carregando texto="Montando relatório…" style={{ padding: 56 }} />
        </div>
      )}

      {!carregando && porFuncionario.length === 0 && (
        <div className="painel nao-imprimir" style={{ padding: 32, textAlign: "center", color: "var(--tinta-3)" }}>
          Nenhuma execução registrada em {mesBR} nesta sede. Os relatórios saem do que foi
          marcado como realizado no Acompanhamento.
        </div>
      )}

      {!carregando &&
        porFuncionario.map(({ funcionario: f, linhas }) => {
          const realizadas = linhas.filter((l) => REALIZADAS.includes(l.exec.status_realizado));
          const tempoReal = realizadas.reduce((s, l) => s + (l.exec.tempo_real_min || 0), 0);
          return (
            <section key={f.id} className="ficha-impressao painel" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "12px 16px",
                  borderBottom: "2px solid var(--tinta)",
                  background: "var(--papel-2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-horizontal-fundo-claro.png" alt="Orkestria" style={{ height: 32, width: "auto", display: "block" }} />
                  <div>
                    <div className="rotulo">Relatório mensal de serviços</div>
                    <h2 style={{ fontSize: 20, fontWeight: 700 }}>{f.nome}</h2>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12 }}>
                  <div>
                    <strong>{sede?.nome_sede ?? sedeId}</strong>
                  </div>
                  <div className="num" style={{ color: "var(--tinta-2)" }}>{mesBR}</div>
                  <div className="num" style={{ color: "var(--tinta-2)" }}>
                    {realizadas.length} serviço(s) · {formatarDuracao(tempoReal)}
                  </div>
                </div>
              </div>

              <table className="tabela" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Data</th>
                    <th>Tarefa</th>
                    <th>Local</th>
                    <th style={{ width: 90 }}>Status</th>
                    <th style={{ width: 70 }}>Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ exec, rotina }) => (
                    <tr key={exec.id}>
                      <td className="num">{formatarDataBR(exec.data_execucao)}</td>
                      <td>{tarefaPorId.get(rotina.tarefa_id)?.nome_tarefa ?? "Tarefa"}</td>
                      <td>{localPorId.get(rotina.local_id)?.nome_local ?? ""}</td>
                      <td>{ROTULO_STATUS[exec.status_realizado] ?? exec.status_realizado}</td>
                      <td className="num">
                        {exec.tempo_real_min > 0 ? formatarDuracao(exec.tempo_real_min) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 32, padding: "28px 16px 16px", fontSize: 11, color: "var(--tinta-2)" }}>
                <div style={{ flex: 1, borderTop: "1px solid var(--tinta)", paddingTop: 4, textAlign: "center" }}>
                  Responsável pela sede
                </div>
                <div style={{ flex: 1, borderTop: "1px solid var(--tinta)", paddingTop: 4, textAlign: "center" }}>
                  Cliente / contratante
                </div>
              </div>
            </section>
          );
        })}
    </div>
  );
}
