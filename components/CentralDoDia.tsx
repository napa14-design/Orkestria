"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { formatarDataBR } from "@/lib/dateUtils";
import type { CentralDiaDados, NivelCentralDia } from "@/types";
import Carregando from "./Carregando";

const ROTULO_NIVEL: Record<NivelCentralDia, string> = {
  critico: "Resolver primeiro",
  atencao: "Próxima decisão",
  ok: "Sem exceções",
};

export default function CentralDoDia({ nome }: { nome: string }) {
  const [resolvendo, setResolvendo] = useState(false);
  const [erroAcao, setErroAcao] = useState("");
  const { data, error, isLoading, isValidating, mutate } = useSWR<CentralDiaDados>(
    "/api/central-dia",
    fetcher,
  );

  async function confirmarAlocacao(rotinaId: string, funcionarioId: string) {
    setResolvendo(true);
    setErroAcao("");
    try {
      await apiPost("/api/central-dia/resolver", {
        rotina_id: rotinaId,
        funcionario_id: funcionarioId,
      });
      await mutate();
    } catch (erro) {
      setErroAcao(
        erro instanceof ErroApi
          ? erro.message
          : "Não foi possível confirmar. A Central será atualizada.",
      );
      await mutate();
    } finally {
      setResolvendo(false);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="central-estado painel entra">
        <Carregando texto="Lendo somente o que exige decisão hoje…" style={{ padding: 54 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="central-estado central-erro painel entra" role="alert">
        <span className="rotulo">Central indisponível</span>
        <h1>Não consegui reunir as exceções de hoje.</h1>
        <p>A Agenda e o Acompanhamento continuam disponíveis pelo menu.</p>
        <button className="btn btn-primario" type="button" onClick={() => void mutate()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const primeiroNome = nome.split(" ")[0];
  const horaAtualizacao = new Date(data.atualizado_em).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="central-dia entra">
      <header className="central-topo">
        <div>
          <span className="central-kicker rotulo">
            Hoje · {formatarDataBR(data.data)} · {data.escopo.nome}
          </span>
          <h1>{primeiroNome}, cuide só da próxima exceção.</h1>
          <p>O restante do sistema pode esperar até isto estar resolvido.</p>
        </div>
        <button
          className="central-recarregar"
          type="button"
          onClick={() => void mutate()}
          disabled={isValidating}
          aria-label="Atualizar a Central do dia"
        >
          <span aria-hidden="true">↻</span>
          {isValidating ? "Atualizando" : `Atualizado ${horaAtualizacao}`}
        </button>
      </header>

      <div className="central-pulso" aria-label="Resumo de hoje">
        <span><strong className="num">{data.resumo.funcionarios_disponiveis}</strong> disponíveis</span>
        <span><strong className="num">{data.resumo.rotinas_planejadas}</strong> blocos</span>
        <span><strong className="num">{data.resumo.ausencias}</strong> ausências</span>
        <span><strong className="num">{data.resumo.realizados_registrados}</strong> confirmados</span>
      </div>

      <main className={`central-proxima nivel-${data.proxima.nivel}`}>
        <div className="central-proxima-marca" aria-hidden="true">
          <span>01</span>
          <i />
        </div>
        <div className="central-proxima-conteudo">
          <div className="central-proxima-rotulo">
            <span className="rotulo">{ROTULO_NIVEL[data.proxima.nivel]}</span>
            {data.proxima.quantidade !== undefined && (
              <strong className="num">{data.proxima.quantidade}</strong>
            )}
          </div>
          <h2>{data.proxima.titulo}</h2>
          <p>{data.proxima.descricao}</p>
        </div>
        {data.proxima.resolucao ? (
          <div className="central-proxima-operacao">
            <div className="central-proposta" aria-label="Alocação sugerida">
              <span className="rotulo">Sem conflitos ou alertas</span>
              <strong>{data.proxima.resolucao.funcionario_nome}</strong>
              <small className="num">
                {data.proxima.resolucao.inicio_planejado}–{data.proxima.resolucao.fim_planejado}
              </small>
            </div>
            <button
              className="btn btn-primario central-proxima-acao"
              type="button"
              disabled={resolvendo}
              onClick={() =>
                void confirmarAlocacao(
                  data.proxima.resolucao!.rotina_id,
                  data.proxima.resolucao!.funcionario_id,
                )
              }
            >
              {resolvendo ? "Confirmando..." : data.proxima.acao}
              <span aria-hidden="true">→</span>
            </button>
            <Link className="central-proxima-alternativa" href={data.proxima.href}>
              Escolher outra pessoa na Agenda
            </Link>
            {erroAcao && (
              <small className="central-proxima-erro" role="alert">{erroAcao}</small>
            )}
          </div>
        ) : (
          <Link className="btn btn-primario central-proxima-acao" href={data.proxima.href}>
            {data.proxima.acao}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </main>

      {data.fila.length > 0 && (
        <section className="central-fila" aria-labelledby="central-fila-titulo">
          <div className="central-fila-topo">
            <div>
              <span className="rotulo">Depois</span>
              <h2 id="central-fila-titulo">A fila já está em ordem</h2>
            </div>
            <span className="num">+{data.fila.length}</span>
          </div>
          <ol>
            {data.fila.map((item, indice) => (
              <li key={item.id} className={`nivel-${item.nivel}`}>
                <span className="central-fila-num num">{String(indice + 2).padStart(2, "0")}</span>
                <div>
                  <strong>{item.titulo}</strong>
                  <small>{item.descricao}</small>
                </div>
                <Link href={item.href}>{item.acao} →</Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="central-rodape">
        <span className="rotulo">Regra desta tela</span>
        <p>Problema cadastral só aparece aqui quando bloqueia o dia.</p>
      </footer>
    </div>
  );
}
