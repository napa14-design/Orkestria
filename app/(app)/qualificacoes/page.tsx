"use client";

/**
 * Qualificações dos funcionários (Fase E): quais aptidões/treinamentos cada um
 * possui, com validade. A agenda bloqueia alocar uma tarefa a quem não tem (ou
 * está vencido) um requisito que ela exige. EPIs não entram aqui.
 */
import { useRef, useState } from "react";
import useSWR from "swr";
import CadastroVinculadoRapido, {
  type RegistroVinculado,
  type TipoVinculoRapido,
} from "@/components/CadastroVinculadoRapido";
import CrudManager from "@/components/CrudManager";
import { useSessao } from "@/components/SessaoContext";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, hojeISO, somarDias } from "@/lib/dateUtils";
import { NIVEIS_QUALIFICACAO, NIVEL_ORDEM } from "@/types";
import type { Funcionario, QualificacaoFuncionario, Requisito, Sede } from "@/types";

export default function PaginaQualificacoes() {
  const sessao = useSessao();
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios, mutate: mutateFuncionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: requisitos, mutate: mutateRequisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);
  const [vinculoRapido, setVinculoRapido] = useState<TipoVinculoRapido | null>(null);
  const preencherVinculoRef = useRef<((valor: string) => void) | null>(null);

  function abrirVinculo(tipo: TipoVinculoRapido, definirValor: (valor: string) => void) {
    preencherVinculoRef.current = definirValor;
    setVinculoRapido(tipo);
  }

  async function vinculoCriado(registro: RegistroVinculado, tipo: TipoVinculoRapido) {
    if (tipo === "funcionario") await mutateFuncionarios();
    if (tipo === "requisito") await mutateRequisitos();
    preencherVinculoRef.current?.(registro.id);
    preencherVinculoRef.current = null;
  }

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const nomeFunc = (id: string) => funcionarios?.find((f) => f.id === id)?.nome ?? id;
  const reqPorId = (id: string) => requisitos?.find((r) => r.id === id);
  const hoje = hojeISO();
  const limiteVencimento = somarDias(hoje, 30);

  return (
    <>
    <CrudManager<QualificacaoFuncionario>
      titulo="Qualificações"
      subtitulo="Aptidões e treinamentos que cada funcionário possui. A agenda bloqueia tarefas cujo requisito a pessoa não tem ou está vencido. EPIs são exigidos pela tarefa, não cadastrados aqui."
      endpoint="/api/qualificacoes"
      chaveRascunho="qualificacoes"
      textoNovo="+ Nova qualificação"
      rotuloRegistro={(q) => `${nomeFunc(q.funcionario_id)} — ${reqPorId(q.requisito_id)?.nome ?? q.requisito_id}`}
      textoBusca={(q) => `${nomeFunc(q.funcionario_id)} ${reqPorId(q.requisito_id)?.nome ?? ""} ${nomeSede(q.sede_id)}`}
      filtrosRapidos={[
        { valor: "vencidas", rotulo: "Vencidas", testar: (q) => Boolean(q.validade && q.validade < hoje) },
        {
          valor: "vencendo",
          rotulo: "Vencendo em 30 dias",
          testar: (q) => Boolean(q.validade && q.validade >= hoje && q.validade <= limiteVencimento),
        },
        { valor: "a_vencer", rotulo: "Com validade", testar: (q) => Boolean(q.validade && q.validade >= hoje) },
        { valor: "nao_expiram", rotulo: "Não expiram", testar: (q) => !q.validade },
        { valor: "referencias", rotulo: "Referências", testar: (q) => q.nivel === "referencia" },
      ]}
      campos={[
        {
          key: "funcionario_id",
          rotulo: "Funcionário",
          tipo: "select",
          obrigatorio: true,
          opcoes: (funcionarios ?? []).filter((f) => f.ativo).map((f) => ({
            valor: f.id,
            rotulo: `${f.nome} — ${nomeSede(f.sede_id)}`,
          })),
          dica: "Quem possui a aptidão/treinamento. A sede vem do funcionário.",
          acaoAuxiliar: sessao.perfil !== "visualizador"
            ? { rotulo: "Criar funcionário essencial", executar: (definir) => abrirVinculo("funcionario", definir) }
            : undefined,
          secao: "Pessoa e habilitação",
          descricaoSecao: "Vincule uma pessoa a uma aptidão ou treinamento do catálogo.",
        },
        {
          key: "requisito_id",
          rotulo: "Requisito",
          tipo: "select",
          obrigatorio: true,
          // só aptidão e treinamento são "possuídos" — EPI fica de fora
          opcoes: (requisitos ?? [])
            .filter((r) => r.ativo && r.tipo !== "epi")
            .map((r) => ({ valor: r.id, rotulo: `${r.nome} (${r.tipo})` })),
          dica: "A aptidão ou treinamento que esta pessoa tem. Gerencie o catálogo em Requisitos.",
          acaoAuxiliar: sessao.perfil === "administrador"
            ? { rotulo: "Criar requisito sem sair", executar: (definir) => abrirVinculo("requisito", definir) }
            : undefined,
        },
        {
          key: "validade",
          rotulo: "Validade",
          tipo: "data",
          ajuda: "Deixe vazio se não expira",
          dica: "Data até a qual o treinamento/aptidão é válido. Vazio = não expira. A partir do dia seguinte ao vencimento, a agenda volta a bloquear as tarefas que o exigem.",
          secao: "Validade e nível",
          descricaoSecao: "Controle vencimentos e quem deve ser sugerido primeiro.",
        },
        {
          key: "nivel",
          rotulo: "Nível de habilitação",
          tipo: "select",
          padrao: "apto",
          opcoes: NIVEIS_QUALIFICACAO.map((n) => ({ valor: n.valor, rotulo: n.rotulo })),
          ajuda: "Só ordena sugestões — não libera nem bloqueia nada",
          dica: "Serve para o sistema SUGERIR quem chamar primeiro numa tarefa que exige este requisito (ex.: montagem de palco num evento). Não é avaliação de desempenho e não muda o bloqueio: quem tem a qualificação válida pode executar, seja apto, experiente ou referência.",
        },
        {
          key: "observacao",
          rotulo: "Observações",
          tipo: "textarea",
          inteira: true,
          secao: "Comprovação e contexto",
          descricaoSecao: "Registre detalhes úteis sem transformar o campo em avaliação de desempenho.",
        },
      ]}
      colunas={[
        { key: "funcionario_id", rotulo: "Funcionário", render: (q) => <strong>{nomeFunc(q.funcionario_id)}</strong> },
        {
          key: "requisito_id",
          rotulo: "Requisito",
          render: (q) => {
            const r = reqPorId(q.requisito_id);
            return r ? (
              <span className={`selo ${r.tipo === "aptidao" ? "selo-azul" : "selo-amarelo"}`}>
                {r.tipo === "aptidao" ? "🩺" : "🎓"} {r.nome}
              </span>
            ) : (
              q.requisito_id
            );
          },
        },
        { key: "sede_id", rotulo: "Sede", render: (q) => nomeSede(q.sede_id) },
        {
          key: "nivel",
          rotulo: "Nível",
          render: (q) => {
            const n = q.nivel && Object.hasOwn(NIVEL_ORDEM, q.nivel) ? q.nivel : "apto";
            const rotulo = NIVEIS_QUALIFICACAO.find((x) => x.valor === n)?.rotulo ?? n;
            const cor = n === "referencia" ? "selo-verde" : n === "experiente" ? "selo-azul" : "selo-cinza";
            return <span className={`selo ${cor}`}>{rotulo}</span>;
          },
        },
        {
          key: "validade",
          rotulo: "Validade",
          render: (q) => {
            if (!q.validade) return <span style={{ color: "var(--tinta-3)" }}>não expira</span>;
            const vencido = q.validade < hoje;
            return (
              <span className={`selo num ${vencido ? "selo-vermelho" : "selo-verde"}`}>
                {vencido ? "vencido " : "até "}
                {formatarDataBR(q.validade)}
              </span>
            );
          },
        },
      ]}
    />
    <CadastroVinculadoRapido
      tipo={vinculoRapido}
      sedes={sedes ?? []}
      aoFechar={() => {
        setVinculoRapido(null);
        preencherVinculoRef.current = null;
      }}
      aoCriado={vinculoCriado}
    />
    </>
  );
}
