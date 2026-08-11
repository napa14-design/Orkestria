"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, hojeISO } from "@/lib/dateUtils";
import type { Feriado, Sede } from "@/types";

export default function PaginaFeriados() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const hoje = hojeISO();

  return (
    <CrudManager<Feriado>
      titulo="Feriados e recessos"
      subtitulo="Dias em que a sede não opera. O “Gerar o dia” recusa montar a agenda nessas datas e diz o motivo — sem isto, gerar um 7 de setembro por engano produz um dia cheio que ninguém vai trabalhar. Um registro cobre um intervalo: recesso inteiro é uma linha."
      endpoint="/api/feriados"
      textoNovo="+ Novo feriado"
      campos={[
        {
          key: "nome",
          rotulo: "O que é",
          tipo: "texto",
          obrigatorio: true,
          ajuda: "Ex.: Independência, Recesso de julho",
          dica: "Este texto aparece quando alguém tentar gerar o dia — escreva o que faça sentido para quem vai ler.",
        },
        { key: "data_inicio", rotulo: "Início", tipo: "data", obrigatorio: true, padrao: hoje },
        {
          key: "data_fim",
          rotulo: "Fim",
          tipo: "data",
          obrigatorio: true,
          padrao: hoje,
          ajuda: "Igual ao início quando é um dia só",
          dica: "Para um feriado de um dia, repita a mesma data. Para um recesso, ponha o último dia sem operação.",
        },
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          // Vazio primeiro e de propósito: feriado nacional/estadual/municipal é o
          // caso comum, e as sedes são todas em Fortaleza.
          opcoes: [
            { valor: "", rotulo: "Todas as sedes (nacional, estadual, municipal)" },
            ...(sedes ?? []).map((s) => ({ valor: s.id, rotulo: `Só ${s.nome_sede}` })),
          ],
          ajuda: "Deixe em “todas” salvo se o fechamento for de uma sede só",
          dica: "Escolha uma sede específica apenas quando o dia parar só nela — obra, dedetização, evento interno. Feriado de calendário vale para todas.",
        },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
      ]}
      colunas={[
        { key: "nome", rotulo: "O que é", render: (f) => <strong>{f.nome}</strong> },
        {
          key: "data_inicio",
          rotulo: "Quando",
          render: (f) => (
            <span className="num">
              {f.data_inicio === f.data_fim
                ? formatarDataBR(f.data_inicio)
                : `${formatarDataBR(f.data_inicio)} – ${formatarDataBR(f.data_fim)}`}
            </span>
          ),
        },
        {
          key: "sede_id",
          rotulo: "Onde",
          render: (f) =>
            f.sede_id ? (
              <span className="selo selo-azul">
                {sedes?.find((s) => s.id === f.sede_id)?.nome_sede ?? f.sede_id}
              </span>
            ) : (
              <span style={{ color: "var(--tinta-3)", fontSize: 12 }}>todas as sedes</span>
            ),
        },
        {
          key: "data_fim",
          rotulo: "Situação",
          render: (f) =>
            !f.ativo ? (
              <span className="selo selo-cinza">Inativo</span>
            ) : f.data_fim < hoje ? (
              <span className="selo selo-cinza">Passou</span>
            ) : f.data_inicio > hoje ? (
              <span className="selo selo-azul">Futuro</span>
            ) : (
              <span className="selo selo-vinho">Hoje não opera</span>
            ),
        },
      ]}
    />
  );
}
