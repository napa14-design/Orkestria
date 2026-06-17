"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, hojeISO, rotularDiasSemana } from "@/lib/dateUtils";
import type { PeriodoLetivo, Sede } from "@/types";

export default function PaginaPeriodosLetivos() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const hoje = hojeISO();

  return (
    <CrudManager<PeriodoLetivo>
      titulo="Calendário acadêmico"
      subtitulo="Períodos letivos por sede. Fora do período (férias/recesso), as tarefas marcadas como “depende do calendário” não são cobradas na cobertura da agenda. Cadastre com alguns dias de antecedência."
      endpoint="/api/periodos-letivos"
      textoNovo="+ Novo período"
      campos={[
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          opcoes: (sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ajuda: "O calendário é por sede",
          dica: "A qual sede este período letivo se aplica. Cada sede tem seu próprio calendário acadêmico (semestres e dias de aula podem diferir).",
        },
        {
          key: "nome",
          rotulo: "Nome do período",
          tipo: "texto",
          obrigatorio: true,
          ajuda: "Ex.: 2026.1, 2026.2",
          dica: "Como o período é identificado, normalmente o semestre. Ex.: \"2026.1\" para o primeiro semestre de 2026.",
        },
        { key: "data_inicio", rotulo: "Início", tipo: "data", obrigatorio: true, padrao: hoje },
        { key: "data_fim", rotulo: "Fim", tipo: "data", obrigatorio: true, padrao: hoje },
        {
          key: "dias_semana",
          rotulo: "Dias com aula",
          tipo: "dias_semana",
          inteira: true,
          ajuda: "Deixe sem marcar para considerar todos os dias dentro do intervalo.",
          dica: "Marque os dias da semana em que há aula (ex.: seg a sex). A cobertura só exige as tarefas letivas nesses dias, dentro do intervalo. Sem marcar nenhum = todos os dias do intervalo contam como letivos.",
        },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
      ]}
      colunas={[
        { key: "sede_id", rotulo: "Sede", render: (p) => nomeSede(p.sede_id) },
        { key: "nome", rotulo: "Período", render: (p) => <strong>{p.nome}</strong> },
        {
          key: "data_inicio",
          rotulo: "Intervalo",
          render: (p) => (
            <span className="num">
              {formatarDataBR(p.data_inicio)} – {formatarDataBR(p.data_fim)}
            </span>
          ),
        },
        {
          key: "dias_semana",
          rotulo: "Dias com aula",
          render: (p) =>
            p.dias_semana ? (
              <span className="selo selo-azul">{rotularDiasSemana(p.dias_semana)}</span>
            ) : (
              <span style={{ color: "var(--tinta-3)", fontSize: 12 }}>todos</span>
            ),
        },
        {
          key: "data_fim",
          rotulo: "Situação",
          render: (p) =>
            !p.ativo ? (
              <span className="selo selo-cinza">Inativo</span>
            ) : p.data_fim < hoje ? (
              <span className="selo selo-cinza">Encerrado</span>
            ) : p.data_inicio > hoje ? (
              <span className="selo selo-azul">Futuro</span>
            ) : (
              <span className="selo selo-verde">Em curso</span>
            ),
        },
      ]}
    />
  );
}
