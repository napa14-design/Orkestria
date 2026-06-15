"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import type { Parametro, Sede } from "@/types";

const TIPOS = [
  { valor: "numero", rotulo: "Número" },
  { valor: "percentual", rotulo: "Percentual" },
  { valor: "min_por_m2", rotulo: "Min por m²" },
  { valor: "texto", rotulo: "Texto" },
];

export default function PaginaParametros() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const nomeSede = (id: string) =>
    id === "geral" ? "Geral (todas)" : (sedes?.find((s) => s.id === id)?.nome_sede ?? id);

  return (
    <CrudManager<Parametro>
      titulo="Parâmetros gerais"
      subtitulo="Limites de ocupação, tamanho do bloco da agenda e tempos padrão — globais ou por sede. Toda alteração registra autor e data."
      endpoint="/api/parametros"
      textoNovo="+ Novo parâmetro"
      campos={[
        {
          key: "chave",
          rotulo: "Chave",
          tipo: "texto",
          obrigatorio: true,
          ajuda: "Ex.: ocupacao_baixa, bloco_agenda_min",
          dica: "O identificador interno do parâmetro (sem espaços, sem acento). É por ele que o sistema reconhece a configuração. Os principais já vêm prontos — em geral você só edita o VALOR, não cria chaves novas. Ex.: ocupacao_adequada, desvio_justificativa_percentual.",
        },
        {
          key: "valor",
          rotulo: "Valor",
          tipo: "texto",
          obrigatorio: true,
          dica: "O número/valor da configuração. É o que normalmente se ajusta. Ex.: na chave \"ocupacao_adequada\" o valor 85 significa que até 85% de ocupação a equipe é considerada \"adequada\".",
        },
        {
          key: "tipo",
          rotulo: "Tipo",
          tipo: "select",
          obrigatorio: true,
          opcoes: TIPOS,
          dica: "Só indica como o valor deve ser lido: número, percentual (%), minutos por m², ou texto. Serve para exibição — não muda o cálculo.",
        },
        {
          key: "sede_id",
          rotulo: "Escopo",
          tipo: "select",
          obrigatorio: true,
          padrao: "geral",
          opcoes: [
            { valor: "geral", rotulo: "Geral (todas as sedes)" },
            ...(sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ],
          dica: "Onde este parâmetro vale. \"Geral\" aplica a todas as sedes; escolher uma sede cria uma exceção só para ela (que tem prioridade sobre o geral). Ex.: tempo padrão de limpeza diferente numa sede específica.",
        },
        {
          key: "descricao",
          rotulo: "Descrição",
          tipo: "textarea",
          inteira: true,
          dica: "Texto livre explicando para que serve o parâmetro — aparece na lista para qualquer pessoa entender sem precisar decorar a chave.",
        },
        {
          key: "editavel_por_supervisor",
          rotulo: "Editável por supervisor",
          tipo: "checkbox",
          padrao: true,
          dica: "Se marcado, supervisores podem alterar este parâmetro. Desmarcado, só administradores. Útil para travar configurações sensíveis.",
        },
        {
          key: "ativo",
          rotulo: "Ativo",
          tipo: "checkbox",
          padrao: true,
          dica: "Liga/desliga o parâmetro sem precisar apagá-lo. Inativo, o sistema usa o valor padrão de fábrica.",
        },
      ]}
      colunas={[
        { key: "chave", rotulo: "Chave", render: (p) => <code className="num">{p.chave}</code> },
        { key: "valor", rotulo: "Valor", render: (p) => <strong className="num">{p.valor}</strong> },
        { key: "tipo", rotulo: "Tipo" },
        { key: "sede_id", rotulo: "Escopo", render: (p) => nomeSede(p.sede_id) },
        { key: "descricao", rotulo: "Descrição" },
        {
          key: "editavel_por_supervisor",
          rotulo: "Supervisor edita?",
          render: (p) => (
            <span className={`selo ${p.editavel_por_supervisor ? "selo-verde" : "selo-cinza"}`}>
              {p.editavel_por_supervisor ? "Sim" : "Não"}
            </span>
          ),
        },
        {
          key: "atualizado_por",
          rotulo: "Última alteração",
          render: (p) => (
            <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>
              {p.atualizado_por} · {p.atualizado_em?.slice(0, 10)}
            </span>
          ),
        },
      ]}
    />
  );
}
