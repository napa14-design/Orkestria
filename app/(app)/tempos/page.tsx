"use client";

/**
 * Tempos por pessoa (Fase D): tempo padrão de uma tarefa para um funcionário
 * específico. Reconhece o ritmo de cada um — usado SOMENTE para planejar uma
 * rotina realista, nunca para avaliar/premiar (planejar ≠ avaliar).
 */
import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import { formatarDuracao } from "@/lib/dateUtils";
import type { Funcionario, Sede, Tarefa, TempoPersonalizado } from "@/types";

export default function PaginaTempos() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: tarefas } = useSWR<Tarefa[]>("/api/tarefas", fetcher);

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const nomeFunc = (id: string) => funcionarios?.find((f) => f.id === id)?.nome ?? id;
  const nomeTarefa = (id: string) => tarefas?.find((t) => t.id === id)?.nome_tarefa ?? id;

  return (
    <CrudManager<TempoPersonalizado>
      titulo="Tempos por pessoa"
      subtitulo="Tempo realista de uma tarefa para cada funcionário. Serve só para planejar uma rotina realista — não é usado para avaliar nem premiar."
      endpoint="/api/tempos-personalizados"
      textoNovo="+ Novo tempo por pessoa"
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
          dica: "De quem é o ritmo. A sede vem do funcionário (supervisores só definem nas sedes que operam).",
        },
        {
          key: "tarefa_id",
          rotulo: "Tarefa",
          tipo: "select",
          obrigatorio: true,
          opcoes: (tarefas ?? []).filter((t) => t.ativo).map((t) => ({
            valor: t.id,
            rotulo: `${t.nome_tarefa} — ${nomeSede(t.sede_id)}`,
          })),
          dica: "A atividade cujo tempo varia para esta pessoa.",
        },
        {
          key: "tempo_min",
          rotulo: "Tempo (min)",
          tipo: "numero",
          padrao: 0,
          obrigatorio: true,
          ajuda: "Tempo realista desta pessoa, em minutos",
          dica: "Quanto esta pessoa leva nesta tarefa. Ao arrastá-la para a agenda deste funcionário, o sistema usa este tempo no lugar do padrão calculado. Só afeta o planejamento.",
        },
        { key: "observacao", rotulo: "Observações", tipo: "textarea", inteira: true },
      ]}
      colunas={[
        { key: "funcionario_id", rotulo: "Funcionário", render: (t) => <strong>{nomeFunc(t.funcionario_id)}</strong> },
        { key: "tarefa_id", rotulo: "Tarefa", render: (t) => nomeTarefa(t.tarefa_id) },
        { key: "sede_id", rotulo: "Sede", render: (t) => nomeSede(t.sede_id) },
        {
          key: "tempo_min",
          rotulo: "Tempo pessoal",
          render: (t) => <strong className="num">{formatarDuracao(t.tempo_min)}</strong>,
        },
      ]}
    />
  );
}
