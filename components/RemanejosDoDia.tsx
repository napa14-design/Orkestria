"use client";

/**
 * "Remanejos do dia" (24/11/2026): para quem está fora hoje (ausente ou emprestado), o que foi feito
 * de cada tarefa — para quem passou e como, ou se ficou sem ninguém. Só leitura; a conta é do
 * servidor (`/api/remanejos`), que só responde quando o modal abre.
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import Modal from "@/components/Modal";
import { ErroApi, fetcher } from "@/lib/clientApi";
import { formatarDataBR, hojeISO } from "@/lib/dateUtils";
import type { RemanejoDaPessoa } from "@/services/remanejosDoDiaService";

const COMO = { automatico: "automático", a_mao: "trocada à mão" } as const;

export default function RemanejosDoDia({ sedeId, data, classeBotao = "btn" }: { sedeId: string; data: string; classeBotao?: string }) {
  const [aberto, setAberto] = useState(false);
  const { data: pessoas, error } = useSWR<RemanejoDaPessoa[]>(aberto && sedeId ? `/api/remanejos?data=${data}&sede=${sedeId}` : null, fetcher, {
    // O padrão do app mostra a resposta anterior enquanto carrega; aqui seria o dia errado sob o título certo.
    keepPreviousData: false,
  });

  return (
    <>
      <button type="button" className={classeBotao} onClick={() => setAberto(true)} disabled={!sedeId}>
        Remanejos do dia
      </button>
      <Modal titulo={`Remanejos do dia — ${formatarDataBR(data)}`} aberto={aberto} aoFechar={() => setAberto(false)} larguraMax={720}>
        {error ? (
          <div className="alerta alerta-erro">{error instanceof ErroApi ? error.message : "Não foi possível carregar."}</div>
        ) : !pessoas ? (
          <Carregando texto="Carregando…" style={{ padding: 24 }} />
        ) : (
          <ConteudoRemanejos pessoas={pessoas} sedeId={sedeId} ehHoje={data === hojeISO()} />
        )}
      </Modal>
    </>
  );
}

/** Separado do modal para o teste renderizar sem portal nem busca. A Central só resolve o dia de hoje. */
export function ConteudoRemanejos({ pessoas, sedeId, ehHoje }: { pessoas: RemanejoDaPessoa[]; sedeId: string; ehHoje: boolean }) {
  const semNinguem = pessoas.reduce((n, p) => n + p.tarefas.filter((t) => t.situacao === "sem_ninguem").length, 0);
  const passaram = pessoas.reduce((n, p) => n + p.tarefas.filter((t) => t.situacao === "passou").length, 0);
  if (pessoas.length === 0) return <p style={{ margin: 0, fontSize: 14 }}>Ninguém ausente nem emprestado nesta sede neste dia.</p>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14 }}>
        <strong>{passaram}</strong> tarefa(s) passaram para outra pessoa ·{" "}
        <strong style={{ color: semNinguem ? "var(--acento)" : undefined }}>{semNinguem}</strong> sem cobertura registrada
        {ehHoje && semNinguem > 0 && (
          <>
            {" · "}
            <Link href={`/inicio?sede=${encodeURIComponent(sedeId)}`}>resolver na Central</Link>
          </>
        )}
      </p>
      {pessoas.map((p) => (
        <section key={`${p.funcionario_id}|${p.motivo}`} style={{ borderTop: "1px solid var(--linha)", paddingTop: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong>{p.nome}</strong>
            <span className="selo selo-laranja">{p.motivo === "ausente" ? "Ausente" : `Emprestado(a) ${p.janela}`}</span>
          </div>
          {p.tarefas.length === 0 ? (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--tinta-3)" }}>{p.motivo === "ausente" ? "Nenhuma tarefa no nome desta pessoa neste dia." : "Nenhuma tarefa no nome desta pessoa neste horário."}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "grid", gap: 4 }}>
              {p.tarefas.map((t) => (
                <li key={t.rotina_id} style={{ display: "flex", gap: 10, fontSize: 13, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span className="num" style={{ color: "var(--tinta-2)", minWidth: 92 }}>{t.inicio}–{t.fim}</span>
                  <span style={{ flex: 1, minWidth: 160 }}>{t.tarefa}</span>
                  {t.situacao === "passou" ? (
                    <span>
                      → <strong>{t.para}</strong> <span style={{ color: "var(--tinta-3)" }}>({COMO[t.como!]})</span>
                    </span>
                  ) : t.situacao === "sem_ninguem" ? (
                    <strong style={{ color: "var(--acento)" }}>sem cobertura registrada</strong>
                  ) : (
                    <span style={{ color: "var(--tinta-3)" }}>{t.situacao === "cancelada" ? "cancelada ou adiada" : "já registrada"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
