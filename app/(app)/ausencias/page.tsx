"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, hojeISO } from "@/lib/dateUtils";
import type { Ausencia, Funcionario, Sede } from "@/types";

const TIPOS = [
  { valor: "falta", rotulo: "Falta" },
  { valor: "atestado", rotulo: "Atestado" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "folga", rotulo: "Folga" },
  { valor: "outro", rotulo: "Outro" },
];

const SELO_TIPO: Record<string, string> = {
  falta: "selo-vermelho",
  atestado: "selo-laranja",
  ferias: "selo-azul",
  folga: "selo-cinza",
  outro: "selo-cinza",
};

export default function PaginaAusencias() {
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);

  const nomeFuncionario = (id: string) =>
    funcionarios?.find((f) => f.id === id)?.nome ?? id;
  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const hoje = hojeISO();

  return (
    <CrudManager<Ausencia>
      titulo="Ausências"
      subtitulo="Faltas, atestados, férias e folgas. Durante a ausência a agenda do funcionário fica bloqueada e as tarefas dele viram candidatas a remanejamento."
      endpoint="/api/ausencias"
      textoNovo="+ Nova ausência"
      campos={[
        {
          key: "funcionario_id",
          rotulo: "Funcionário",
          tipo: "select",
          obrigatorio: true,
          opcoes: (funcionarios ?? [])
            .filter((f) => f.ativo)
            .map((f) => ({ valor: f.id, rotulo: `${f.nome} — ${nomeSede(f.sede_id)}` })),
          inteira: true,
        },
        { key: "tipo", rotulo: "Tipo", tipo: "select", obrigatorio: true, opcoes: TIPOS },
        { key: "data_inicio", rotulo: "Início", tipo: "data", obrigatorio: true, padrao: hoje },
        { key: "data_fim", rotulo: "Fim", tipo: "data", obrigatorio: true, padrao: hoje },
        { key: "observacao", rotulo: "Observação", tipo: "textarea", inteira: true },
      ]}
      colunas={[
        { key: "funcionario_id", rotulo: "Funcionário", render: (a) => nomeFuncionario(a.funcionario_id) },
        { key: "sede_id", rotulo: "Sede", render: (a) => nomeSede(a.sede_id) },
        {
          key: "tipo",
          rotulo: "Tipo",
          render: (a) => (
            <span className={`selo ${SELO_TIPO[a.tipo] ?? "selo-cinza"}`}>
              {TIPOS.find((t) => t.valor === a.tipo)?.rotulo ?? a.tipo}
            </span>
          ),
        },
        {
          key: "data_inicio",
          rotulo: "Período",
          render: (a) => (
            <span className="num">
              {formatarDataBR(a.data_inicio)}
              {a.data_fim !== a.data_inicio ? ` – ${formatarDataBR(a.data_fim)}` : ""}
            </span>
          ),
        },
        {
          key: "data_fim",
          rotulo: "Situação",
          render: (a) =>
            a.data_fim < hoje ? (
              <span className="selo selo-cinza">Encerrada</span>
            ) : a.data_inicio > hoje ? (
              <span className="selo selo-azul">Futura</span>
            ) : (
              <span className="selo selo-laranja">Em curso</span>
            ),
        },
        { key: "observacao", rotulo: "Observação" },
      ]}
    />
  );
}
