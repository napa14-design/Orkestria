"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR } from "@/lib/dateUtils";
import type { CentralDiaDados, Perfil } from "@/types";
import Carregando from "./Carregando";

const ROTULO_NIVEL = {
  critico: "Resolver primeiro",
  atencao: "Pede atenção",
  informativo: "Acompanhar",
  ok: "Em ordem",
} as const;

const ATALHOS_POR_PERFIL: Record<Perfil, Array<{ href: string; titulo: string; detalhe: string }>> = {
  supervisor: [
    { href: "/rotinas", titulo: "Agenda", detalhe: "Planejar e redistribuir" },
    { href: "/ausencias?novo=1", titulo: "Ausência", detalhe: "Registrar sem procurar" },
    { href: "/eventuais?novo=1", titulo: "Imprevisto", detalhe: "Capturar o que surgiu" },
    { href: "/acompanhamento", titulo: "Realizado", detalhe: "Conferir a execução" },
  ],
  administrador: [
    { href: "/rotinas", titulo: "Agenda", detalhe: "Planejar qualquer sede" },
    { href: "/sedes", titulo: "Estrutura", detalhe: "Revisar os cadastros" },
    { href: "/dashboard", titulo: "Indicadores", detalhe: "Capacidade e desvios" },
    { href: "/importar", titulo: "Importar", detalhe: "Atualizar dados em lote" },
  ],
  visualizador: [
    { href: "/acompanhamento", titulo: "Acompanhamento", detalhe: "Previsto × realizado" },
    { href: "/dashboard", titulo: "Dashboard", detalhe: "Capacidade e desvios" },
    { href: "/panorama", titulo: "Panorama", detalhe: "Comparar as sedes" },
    { href: "/relatorios", titulo: "Relatórios", detalhe: "Consolidar resultados" },
  ],
};

export default function CentralDoDia({ nome, perfil }: { nome: string; perfil: Perfil }) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<CentralDiaDados>(
    "/api/central-dia",
    fetcher,
  );

  if (isLoading && !data) {
    return (
      <div className="central-carregando painel entra">
        <Carregando texto="Preparando sua central do dia…" style={{ padding: 56 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="central-erro painel entra" role="alert">
        <span className="rotulo">Central indisponível</span>
        <h1>Não foi possível reunir as prioridades de hoje.</h1>
        <p>As demais áreas continuam disponíveis. Tente carregar novamente.</p>
        <button className="btn btn-primario" type="button" onClick={() => void mutate()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const primeiroNome = nome.split(" ")[0];
  const proxima = data.prioridades[0];
  const restantes = data.prioridades.slice(1);
  const atalhos = ATALHOS_POR_PERFIL[perfil];
  const horaAtualizacao = new Date(data.atualizado_em).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="central-dia entra">
      <header className="central-topo">
        <div>
          <span className="central-kicker rotulo">Central do dia · {formatarDataBR(data.data)}</span>
          <h1>{primeiroNome}, esta é a situação agora.</h1>
          <p>
            <strong>{data.escopo.nome}</strong> · comece pela primeira exceção e siga a fila.
          </p>
        </div>
        <button
          className="btn btn-mini btn-fantasma central-atualizar"
          type="button"
          onClick={() => void mutate()}
          disabled={isValidating}
          aria-label="Atualizar a Central do dia"
        >
          {isValidating ? "Atualizando…" : `Atualizado ${horaAtualizacao} · Recarregar`}
        </button>
      </header>

      <section className="central-principal" aria-label="Prioridades operacionais">
        <article className={`central-proxima nivel-${proxima.nivel}`}>
          <div className="central-proxima-cabecalho">
            <span className="rotulo">{ROTULO_NIVEL[proxima.nivel]}</span>
            {proxima.quantidade !== undefined && (
              <strong className="central-proxima-numero num">{proxima.quantidade}</strong>
            )}
          </div>
          <div className="central-proxima-corpo">
            <div>
              <h2>{proxima.titulo}</h2>
              <p>{proxima.descricao}</p>
            </div>
            <Link className="btn btn-primario central-proxima-acao" href={proxima.href}>
              {proxima.acao} →
            </Link>
          </div>
        </article>

        <aside className="central-resumo" aria-label="Resumo do dia">
          <div className="central-resumo-titulo">
            <span className="rotulo">Pulso da operação</span>
            <span>{data.resumo.funcionarios_disponiveis} disponíveis</span>
          </div>
          <div className="central-metricas">
            <div>
              <strong className="num">{data.resumo.rotinas_planejadas}</strong>
              <span>blocos planejados</span>
            </div>
            <div className={data.resumo.ausencias > 0 ? "tem-alerta" : ""}>
              <strong className="num">{data.resumo.ausencias}</strong>
              <span>ausências</span>
            </div>
            <div
              className={data.resumo.cobertura_calculada && data.resumo.cobertura_pendente > 0 ? "tem-alerta" : ""}
              title={data.resumo.cobertura_calculada ? undefined : "Abra a Agenda e escolha uma sede para analisar a cobertura operacional."}
            >
              <strong className="num">
                {data.resumo.cobertura_calculada ? data.resumo.cobertura_pendente : "—"}
              </strong>
              <span>{data.resumo.cobertura_calculada ? "fora da cobertura" : "cobertura por sede"}</span>
            </div>
            <div>
              <strong className="num">{data.resumo.realizados_registrados}</strong>
              <span>realizados lançados</span>
            </div>
          </div>
        </aside>
      </section>

      {restantes.length > 0 && (
        <section className="central-fila" aria-labelledby="titulo-fila">
          <div className="central-secao-titulo">
            <div>
              <span className="rotulo">Depois disso</span>
              <h2 id="titulo-fila">Fila curta</h2>
            </div>
            <span>{restantes.length} {restantes.length === 1 ? "item" : "itens"}</span>
          </div>
          <div className="central-fila-lista">
            {restantes.map((item, indice) => (
              <Link key={item.id} href={item.href} className={`central-fila-item nivel-${item.nivel}`}>
                <span className="central-fila-ordem num">{String(indice + 2).padStart(2, "0")}</span>
                <span className="central-fila-texto">
                  <span className="rotulo">{ROTULO_NIVEL[item.nivel]}</span>
                  <strong>{item.titulo}</strong>
                  <small>{item.descricao}</small>
                </span>
                <span className="central-fila-acao">{item.acao} →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="central-saude" aria-labelledby="titulo-saude">
        <div className="central-saude-medidor">
          <span className="rotulo">Base confiável</span>
          <strong className="num">{data.saude.indice}%</strong>
          <div className="central-saude-trilho" aria-hidden="true">
            <span style={{ width: `${data.saude.indice}%` }} />
          </div>
          <p>
            {data.saude.pendencias === 0
              ? "Cadastros essenciais sem pendências detectadas."
              : `${data.saude.pendencias} ponto(s) podem reduzir a precisão do planejamento.`}
          </p>
        </div>

        <div className="central-saude-conteudo">
          <div className="central-secao-titulo">
            <div>
              <span className="rotulo">Saúde dos cadastros</span>
              <h2 id="titulo-saude">Corrigir antes que vire urgência</h2>
            </div>
          </div>
          {data.saude.itens.length === 0 ? (
            <div className="central-saude-ok">
              <strong>Estrutura pronta para planejar.</strong>
              <span>Nenhuma inconsistência essencial foi encontrada neste escopo.</span>
            </div>
          ) : (
            <div className="central-saude-grade">
              {data.saude.itens.map((item) => (
                <Link href={item.href} key={item.id} className="central-saude-item">
                  <strong className="num">{item.quantidade}</strong>
                  <span>
                    <b>{item.titulo}</b>
                    <small>{item.descricao}</small>
                  </span>
                  <i aria-hidden="true">→</i>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {perfil !== "visualizador" && (
        <section className="central-prontidao" aria-labelledby="titulo-prontidao">
          <div className="central-prontidao-topo">
            <div>
              <span className="rotulo">Preparação da estrutura</span>
              <h2 id="titulo-prontidao">
                {data.prontidao.pronta_para_planejar
                  ? "Base pronta para operar"
                  : "Deixe a sede pronta sem adivinhar o próximo passo"}
              </h2>
              <p>
                {data.prontidao.pronta_para_planejar
                  ? "Os quatro vínculos mínimos existem. Use as revisões apenas quando a operação mudar."
                  : `${data.prontidao.concluidas} de ${data.prontidao.total} etapas concluídas.`}
              </p>
            </div>
            <div className="central-prontidao-indice" aria-label={`${data.prontidao.indice}% da estrutura preparada`}>
              <strong className="num">{data.prontidao.indice}%</strong>
              <span>pronta</span>
            </div>
          </div>
          <div className="central-prontidao-trilho" aria-hidden="true">
            <span style={{ width: `${data.prontidao.indice}%` }} />
          </div>
          <div className="central-prontidao-etapas">
            {data.prontidao.itens.map((item, indice) => (
              <Link
                key={item.id}
                href={item.href}
                className={item.concluida ? "concluida" : "pendente"}
              >
                <span className="central-prontidao-num num">
                  {item.concluida ? "✓" : String(indice + 1).padStart(2, "0")}
                </span>
                <span>
                  <b>{item.titulo}</b>
                  <small>{item.descricao}</small>
                </span>
                <i>{item.acao} →</i>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="central-atalhos" aria-label="Atalhos do perfil">
        {atalhos.map((atalho) => (
          <Link href={atalho.href} key={atalho.href}>
            <strong>{atalho.titulo}</strong>
            <span>{atalho.detalhe}</span>
            <i aria-hidden="true">↗</i>
          </Link>
        ))}
      </section>
    </div>
  );
}
