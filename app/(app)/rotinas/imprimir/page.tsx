"use client";

/**
 * Fichas de rotina imprimíveis — uma "ordem de serviço" por funcionário,
 * para entregar em papel aos ASGs (que não usam o sistema).
 * Acessada via /rotinas/imprimir?data=YYYY-MM-DD&sede=ID
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import useSWR from "swr";
import { jornadaLiquidaMin, tempoPlanejadoMin } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, formatarDuracao, hojeISO } from "@/lib/dateUtils";
import type {
  Ausencia,
  Funcionario,
  Local,
  Requisito,
  RotinaPlanejada,
  Sede,
  Tarefa,
} from "@/types";

const ROTULO_SERVICO: Record<string, string> = {
  pesada: "pesada",
  desincrustante: "desincrustante",
};

function Fichas() {
  const params = useSearchParams();
  const data = params.get("data") ?? hojeISO();
  const sedeId = params.get("sede") ?? "";

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useSWR<Funcionario[]>(
    sedeId ? `/api/funcionarios?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: rotinas } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?data=${data}&sede=${sedeId}` : null,
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
  const { data: ausencias } = useSWR<Ausencia[]>(
    sedeId ? `/api/ausencias?data=${data}&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: requisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);

  const sede = (sedes ?? []).find((s) => s.id === sedeId);
  const tarefaPorId = useMemo(() => new Map((tarefas ?? []).map((t) => [t.id, t])), [tarefas]);
  const localPorId = useMemo(() => new Map((locais ?? []).map((l) => [l.id, l])), [locais]);
  const reqPorId = useMemo(() => new Map((requisitos ?? []).map((r) => [r.id, r])), [requisitos]);

  // EPIs exigidos pelas tarefas da ficha (derivados dos requisitos tipo "epi").
  const episDe = (rs: RotinaPlanejada[]) => {
    const nomes = new Set<string>();
    for (const r of rs) {
      const t = tarefaPorId.get(r.tarefa_id);
      for (const id of (t?.requisitos ?? "").split(",").filter(Boolean)) {
        const req = reqPorId.get(id);
        if (req && req.tipo === "epi") nomes.add(req.nome);
      }
    }
    return [...nomes];
  };
  const ausentes = useMemo(
    () => new Set((ausencias ?? []).map((a) => a.funcionario_id)),
    [ausencias],
  );

  const fichas = useMemo(
    () =>
      (funcionarios ?? [])
        .filter((f) => f.ativo && !ausentes.has(f.id))
        .map((f) => ({
          funcionario: f,
          rotinas: (rotinas ?? [])
            .filter((r) => r.funcionario_id === f.id && r.status !== "cancelada")
            .sort((a, b) => a.inicio_planejado.localeCompare(b.inicio_planejado)),
        }))
        .filter((x) => x.rotinas.length > 0),
    [funcionarios, rotinas, ausentes],
  );

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* barra de ações — some na impressão */}
      <div
        className="nao-imprimir"
        style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>
          Fichas de rotina — {formatarDataBR(data)}
        </h1>
        <button className="btn btn-primario" onClick={() => window.print()}>
          🖨 Imprimir
        </button>
        <button className="btn" onClick={() => window.close()}>
          Fechar
        </button>
      </div>

      {fichas.length === 0 && (
        <div className="painel nao-imprimir" style={{ padding: 32, textAlign: "center", color: "var(--tinta-3)" }}>
          Nenhuma rotina planejada para esta data/sede (funcionários ausentes não geram ficha).
        </div>
      )}

      {fichas.map(({ funcionario: f, rotinas: rs }) => {
        const epis = episDe(rs);
        return (
        <section
          key={f.id}
          className="ficha-impressao painel"
          style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}
        >
          {/* cabeçalho da ficha */}
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
              <img
                src="/logo-horizontal-fundo-claro.png"
                alt="Orkestria"
                style={{ height: 48, width: "auto", margin: "-6px 0" }}
              />
              <div>
                <div className="rotulo">Ficha de rotina diária</div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>{f.nome}</h2>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              <div>
                <strong>{sede?.nome_sede ?? sedeId}</strong> · {formatarDataBR(data)}
              </div>
              <div className="num" style={{ color: "var(--tinta-2)" }}>
                Expediente {f.entrada}–{f.saida} · Intervalo {f.intervalo_inicio}–{f.intervalo_fim}
              </div>
              <div className="num" style={{ color: "var(--tinta-2)" }}>
                Planejado: {formatarDuracao(tempoPlanejadoMin(rs))} de{" "}
                {formatarDuracao(jornadaLiquidaMin(f))}
              </div>
            </div>
          </div>

          {/* EPIs exigidos pelas tarefas do dia — o ASG confirma o uso */}
          {epis.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
                padding: "8px 16px",
                borderBottom: "1px solid var(--linha)",
                fontSize: 11,
              }}
            >
              <span className="rotulo" style={{ color: "var(--acento)" }}>
                🧤 EPIs obrigatórios:
              </span>
              {epis.map((nome) => (
                <span key={nome} className="num" style={{ whiteSpace: "nowrap" }}>
                  ( ) {nome}
                </span>
              ))}
            </div>
          )}

          {/* tarefas */}
          <table className="tabela" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Horário</th>
                <th>Tarefa</th>
                <th>Local</th>
                <th style={{ width: 70 }}>Tempo</th>
                <th style={{ width: 110 }}>Feito?</th>
                <th style={{ width: 140 }}>Anotações</th>
              </tr>
            </thead>
            <tbody>
              {rs.map((r) => {
                const t = tarefaPorId.get(r.tarefa_id);
                const l = localPorId.get(r.local_id);
                return (
                  <tr key={r.id}>
                    <td className="num">
                      {r.inicio_planejado}–{r.fim_planejado}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {t?.nome_tarefa ?? "Tarefa"}
                      {t?.tipo_servico && ROTULO_SERVICO[t.tipo_servico] && (
                        <span style={{ fontWeight: 400, color: "var(--tinta-3)" }}>
                          {" "}· {ROTULO_SERVICO[t.tipo_servico]}
                        </span>
                      )}
                    </td>
                    <td>{l ? `${l.nome_local} (${l.andar})` : ""}</td>
                    <td className="num">{formatarDuracao(r.tempo_previsto_min)}</td>
                    <td>( ) Sim&nbsp;&nbsp;( ) Não</td>
                    <td style={{ borderBottom: "1px solid var(--linha)" }}></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* rodapé com assinaturas */}
          <div
            style={{
              display: "flex",
              gap: 32,
              padding: "24px 16px 16px",
              fontSize: 11,
              color: "var(--tinta-2)",
            }}
          >
            <div style={{ flex: 1, borderTop: "1px solid var(--tinta)", paddingTop: 4, textAlign: "center" }}>
              Assinatura do funcionário
            </div>
            <div style={{ flex: 1, borderTop: "1px solid var(--tinta)", paddingTop: 4, textAlign: "center" }}>
              Assinatura do supervisor
            </div>
          </div>
        </section>
        );
      })}
    </div>
  );
}

export default function PaginaImprimir() {
  return (
    <Suspense fallback={<p style={{ padding: 32 }}>Carregando fichas…</p>}>
      <Fichas />
    </Suspense>
  );
}
