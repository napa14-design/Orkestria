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
        { key: "chave", rotulo: "Chave", tipo: "texto", obrigatorio: true, ajuda: "Ex.: ocupacao_baixa, bloco_agenda_min" },
        { key: "valor", rotulo: "Valor", tipo: "texto", obrigatorio: true },
        { key: "tipo", rotulo: "Tipo", tipo: "select", obrigatorio: true, opcoes: TIPOS },
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
        },
        { key: "descricao", rotulo: "Descrição", tipo: "textarea", inteira: true },
        { key: "editavel_por_supervisor", rotulo: "Editável por supervisor", tipo: "checkbox", padrao: true },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
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
