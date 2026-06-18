"use client";

/**
 * Fichas de rotina imprimíveis — uma "ordem de serviço" por funcionário,
 * para entregar em papel aos ASGs (que não usam o sistema).
 * Acessada via /rotinas/imprimir?data=YYYY-MM-DD&sede=ID
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import useSWR from "swr";
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

/**
 * Caixa de marcação (OMR): borda firme preta, fundo branco, posição/tamanho
 * fixos. O ASG marca um "X"; o leitor mede o preenchimento. Sempre #000/#fff
 * (independe do tema) para sair limpa na impressão e no scan.
 */
function Caixa({ tamanho = 16 }: { tamanho?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: tamanho,
        height: tamanho,
        border: "2px solid #000",
        background: "#fff",
        verticalAlign: "middle",
        borderRadius: 0,
      }}
    />
  );
}

/** Quadrado fiducial de canto — referência para alinhar/endireitar o scan. */
function Fiducial({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const lado = pos[0] === "t" ? { top: 6 } : { bottom: 6 };
  const horiz = pos[1] === "l" ? { left: 6 } : { right: 6 };
  return (
    <div
      aria-hidden
      style={{ position: "absolute", width: 14, height: 14, background: "#000", ...lado, ...horiz }}
    />
  );
}

/**
 * Conteúdo do QR de cada ficha: versão + sede + data + funcionário. O leitor
 * decodifica e busca as rotinas planejadas dessa data/sede/funcionário na MESMA
 * ordem de impressão (por horário) para casar cada linha com sua rotina — sem
 * precisar ler texto.
 */
function payloadQR(sedeId: string, data: string, funcionarioId: string) {
  return `ORK1|${sedeId}|${data}|${funcionarioId}`;
}

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
          style={{ marginBottom: 24, padding: 0, overflow: "hidden", position: "relative" }}
        >
          {/* marcadores fiduciais de canto — alinhamento do scan (OMR) */}
          <Fiducial pos="tl" />
          <Fiducial pos="tr" />
          <Fiducial pos="bl" />
          <Fiducial pos="br" />

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
                style={{ height: 34, width: "auto", display: "block" }}
              />
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{f.nome}</h2>
                <div className="rotulo" style={{ color: "var(--tinta-2)" }}>
                  {sede?.nome_sede ?? sedeId} · {formatarDataBR(data)}
                </div>
              </div>
            </div>
            {/* QR identifica a ficha (sede·data·funcionário) para a leitura.
                Afastado do canto p/ não encostar no marcador fiducial. */}
            <div style={{ textAlign: "center", flexShrink: 0, marginTop: 18, marginRight: 14 }}>
              <QRCodeSVG value={payloadQR(sedeId, data, f.id)} size={56} level="M" marginSize={0} />
              <div className="num" style={{ fontSize: 7, color: "#000", marginTop: 1, letterSpacing: 0.5 }}>
                LEITURA
              </div>
            </div>
          </div>

          {/* tarefas */}
          <table className="tabela" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Horário</th>
                <th>Tarefa</th>
                <th>Local</th>
                <th style={{ width: 70 }}>Tempo</th>
                <th style={{ width: 64, textAlign: "center" }}>Feito</th>
                <th style={{ width: 150 }}>Anotações</th>
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
                    <td style={{ textAlign: "center" }}>
                      <Caixa />
                    </td>
                    <td style={{ borderBottom: "1px solid var(--linha)" }}></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* instrução de marcação para a leitura automática */}
          <div style={{ padding: "6px 16px 0", fontSize: 10, color: "var(--tinta-3)" }}>
            Marque um <strong>X</strong> dentro da caixa do que foi feito. Não escreva sobre os
            quadrados pretos dos cantos (servem para a leitura).
          </div>

          {/* EPIs utilizados — no rodapé (usa o espaço e dá posição fixa p/ leitura) */}
          {epis.length > 0 && (
            <div style={{ padding: "14px 16px 0" }}>
              <div className="rotulo" style={{ color: "var(--acento)", marginBottom: 6 }}>
                EPIs utilizados (marque o que usou)
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {epis.map((nome) => (
                  <span key={nome} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <Caixa /> {nome}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* rodapé com assinaturas */}
          <div
            style={{
              display: "flex",
              gap: 32,
              padding: "16px 16px 16px",
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
