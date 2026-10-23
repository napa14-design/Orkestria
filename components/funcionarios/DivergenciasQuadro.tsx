"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSessao } from "@/components/SessaoContexto";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { QUADRO_NAO_CONFIGURADO, totalDeDivergencias, type Divergencias } from "@/lib/quadroInfra";

const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

/**
 * O cadastro desta sede contra o Quadro da Infra (Chromos), 23/10/2026.
 *
 * Só aparece com divergência: com zero, some (doutrina, pergunta 4 — o gatilho
 * é o próprio cruzamento). Integração não configurada também não aparece; fora
 * do ar, uma linha só. Nada aqui desliga ou cadastra sozinho: o "Desligar" abre
 * o fluxo de sempre com a data de lá preenchida.
 */
export default function DivergenciasQuadro({
  sedeId,
  aoDesligar,
  aoMudar,
}: {
  sedeId: string;
  aoDesligar: (funcionarioId: string, data: string) => void;
  aoMudar: () => void;
}) {
  const sessao = useSessao();
  const pode = sessao?.perfil === "administrador" || sessao?.perfil === "coordenador";
  const chave = pode && sedeId ? `/api/quadro-infra/divergencias?sede=${encodeURIComponent(sedeId)}` : null;
  const { data, error, mutate } = useSWR<Divergencias & { sedeNoChromos: string | null }>(chave, fetcher, {
    revalidateOnFocus: false,
  });
  const [vinculando, setVinculando] = useState("");
  const [erro, setErro] = useState("");

  if (error) {
    if (!(error instanceof ErroApi) || error.status !== 503 || error.message === QUADRO_NAO_CONFIGURADO) return null;
    return (
      <p style={{ fontSize: 12.5, color: "var(--tinta-3)", margin: "0 0 12px" }}>{error.message}</p>
    );
  }
  if (!data || totalDeDivergencias(data) === 0) return null;

  const vincular = async (funcionario_id: string, quadro_id: string) => {
    setVinculando(quadro_id);
    setErro("");
    try {
      await apiPost("/api/quadro-infra/vincular", { funcionario_id, quadro_id });
      await mutate();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível vincular.");
    } finally {
      setVinculando("");
    }
  };

  const resumo = [
    data.desligados.length && `${data.desligados.length} desligado(s) no Quadro`,
    data.semVinculo.length && `${data.semVinculo.length} sem vínculo`,
    data.outraSede.length && `${data.outraSede.length} em outra sede`,
    data.naoConfere.length && `${data.naoConfere.length} matrícula(s) que não conferem`,
    data.foraDoOrkestria?.length && `${data.foraDoOrkestria.length} no Quadro sem cadastro aqui`,
  ].filter(Boolean);

  const linha = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "6px 0", borderTop: "1px solid var(--linha)", fontSize: 13.5 } as const;
  const titulo = { margin: "14px 0 4px" } as const;

  return (
    <details className="painel" style={{ padding: "12px 16px", marginBottom: 16 }} open={data.desligados.length > 0}>
      <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span className="rotulo">Quadro da Infra</span>
        <span style={{ fontSize: 13.5 }}>{resumo.join(" · ")}</span>
      </summary>

      {erro && <div className="alerta alerta-erro" style={{ marginTop: 10 }}>{erro}</div>}

      {data.desligados.length > 0 && (
        <section>
          <p className="rotulo" style={titulo}>Desligados no Quadro, ativos aqui</p>
          {data.desligados.map((d) => (
            <div key={d.funcionario_id} style={linha}>
              <span>
                {d.nome} <span style={{ color: "var(--tinta-3)" }}>· desligado(a) em {dataBR(d.data)}</span>
              </span>
              <button
                type="button"
                className="btn btn-mini btn-fantasma"
                style={{ color: "var(--vermelho)" }}
                onClick={() => aoDesligar(d.funcionario_id, d.data)}
              >
                Desligar
              </button>
            </div>
          ))}
        </section>
      )}

      {data.semVinculo.length > 0 && (
        <section>
          <p className="rotulo" style={titulo}>Sem vínculo com o Quadro</p>
          {data.semVinculo.map((s) => (
            <div key={s.funcionario_id} style={linha}>
              <span>{s.nome}</span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {s.sugestoes.length === 0 ? (
                  <span style={{ color: "var(--tinta-3)", fontSize: 12.5 }}>
                    Ninguém com esse nome no Quadro desta sede. Confira o nome completo no cadastro.
                  </span>
                ) : (
                  s.sugestoes.map((q) => (
                    <button
                      key={q.quadro_id}
                      type="button"
                      className="btn btn-mini"
                      disabled={Boolean(vinculando)}
                      title="Grava a matrícula e a empresa do Quadro neste cadastro."
                      onClick={() => void vincular(s.funcionario_id, q.quadro_id)}
                    >
                      {vinculando === q.quadro_id ? "Vinculando…" : `É ${q.nome}`}
                      {q.admissao && <span style={{ color: "var(--tinta-3)" }}> · adm. {dataBR(q.admissao)}</span>}
                      {q.situacao === "INATIVO" && <span className="selo selo-cinza" style={{ marginLeft: 6 }}>desligada lá</span>}
                    </button>
                  ))
                )}
              </span>
            </div>
          ))}
        </section>
      )}

      {data.outraSede.length > 0 && (
        <section>
          <p className="rotulo" style={titulo}>Em outra sede no Quadro</p>
          {data.outraSede.map((o) => (
            <div key={o.funcionario_id} style={linha}>
              <span>{o.nome}</span>
              <span style={{ color: "var(--tinta-3)" }}>no Quadro: {o.sede}</span>
            </div>
          ))}
        </section>
      )}

      {data.naoConfere.length > 0 && (
        <section>
          <p className="rotulo" style={titulo}>Matrícula que não confere</p>
          {data.naoConfere.map((n) => (
            <div key={n.funcionario_id} style={linha}>
              <span>{n.nome}</span>
              <span style={{ color: "var(--tinta-3)", fontSize: 12.5 }}>
                A matrícula não acha ninguém com este nome no Quadro. Confira a matrícula e o nome no cadastro.
              </span>
            </div>
          ))}
        </section>
      )}

      {data.foraDoOrkestria && data.foraDoOrkestria.length > 0 && (
        <section>
          <p className="rotulo" style={titulo}>No Quadro desta sede, sem cadastro aqui</p>
          {data.foraDoOrkestria.map((p, i) => (
            <div key={`${p.nome}-${i}`} style={linha}>
              <span>{p.nome}</span>
              <span style={{ color: "var(--tinta-3)" }}>{p.admissao && `adm. ${dataBR(p.admissao)}`}</span>
            </div>
          ))}
        </section>
      )}
    </details>
  );
}
