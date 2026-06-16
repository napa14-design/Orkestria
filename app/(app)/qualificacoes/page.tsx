"use client";

/**
 * Qualificações dos funcionários (Fase E): quais aptidões/treinamentos cada um
 * possui, com validade. A agenda bloqueia alocar uma tarefa a quem não tem (ou
 * está vencido) um requisito que ela exige. EPIs não entram aqui.
 */
import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, hojeISO } from "@/lib/dateUtils";
import type { Funcionario, QualificacaoFuncionario, Requisito, Sede } from "@/types";

export default function PaginaQualificacoes() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: requisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const nomeFunc = (id: string) => funcionarios?.find((f) => f.id === id)?.nome ?? id;
  const reqPorId = (id: string) => requisitos?.find((r) => r.id === id);
  const hoje = hojeISO();

  return (
    <CrudManager<QualificacaoFuncionario>
      titulo="Qualificações"
      subtitulo="Aptidões e treinamentos que cada funcionário possui. A agenda bloqueia tarefas cujo requisito a pessoa não tem ou está vencido. EPIs são exigidos pela tarefa, não cadastrados aqui."
      endpoint="/api/qualificacoes"
      textoNovo="+ Nova qualificação"
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
        },
        {
          key: "validade",
          rotulo: "Validade",
          tipo: "data",
          ajuda: "Deixe vazio se não expira",
          dica: "Data até a qual o treinamento/aptidão é válido. Vazio = não expira. A partir do dia seguinte ao vencimento, a agenda volta a bloquear as tarefas que o exigem.",
        },
        { key: "observacao", rotulo: "Observações", tipo: "textarea", inteira: true },
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
  );
}
