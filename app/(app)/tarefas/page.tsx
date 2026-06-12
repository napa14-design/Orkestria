"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { tempoPrevistoMin } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { formatarDuracao } from "@/lib/dateUtils";
import type { Local, Sede, Tarefa } from "@/types";

const REGRAS = [
  { valor: "fixo", rotulo: "Tempo fixo" },
  { valor: "por_m2", rotulo: "Por m² (× metragem do local)" },
  { valor: "por_unidade", rotulo: "Por unidade (× quantidade)" },
  { valor: "manual", rotulo: "Manual" },
];

const FREQUENCIAS = [
  { valor: "diaria", rotulo: "Diária" },
  { valor: "semanal", rotulo: "Semanal" },
  { valor: "quinzenal", rotulo: "Quinzenal" },
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "sob_demanda", rotulo: "Sob demanda" },
];

const PRIORIDADES = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "media", rotulo: "Média" },
  { valor: "baixa", rotulo: "Baixa" },
];

export default function PaginaTarefas() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: locais } = useSWR<Local[]>("/api/locais", fetcher);

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const localPorId = (id: string) => locais?.find((l) => l.id === id);

  return (
    <CrudManager<Tarefa>
      titulo="Tarefas"
      subtitulo="Serviços atribuíveis. A sede é herdada automaticamente do local selecionado."
      endpoint="/api/tarefas"
      textoNovo="+ Nova tarefa"
      campos={[
        { key: "nome_tarefa", rotulo: "Nome da tarefa", tipo: "texto", obrigatorio: true },
        { key: "tipo_tarefa", rotulo: "Tipo da tarefa", tipo: "texto", ajuda: "Ex.: Limpeza concorrente, Higienização" },
        {
          key: "local_id",
          rotulo: "Local",
          tipo: "select",
          obrigatorio: true,
          opcoes: (locais ?? []).map((l) => ({
            valor: l.id,
            rotulo: `${l.nome_local} (${l.andar}) — ${nomeSede(l.sede_id)}`,
          })),
          ajuda: "Obrigatório — a sede vem do local",
          inteira: true,
        },
        { key: "regra_calculo", rotulo: "Regra de cálculo", tipo: "select", obrigatorio: true, opcoes: REGRAS },
        {
          key: "tempo_base_min",
          rotulo: "Tempo base (min)",
          tipo: "numero",
          passo: "0.1",
          obrigatorio: true,
          ajuda: "Fixo/manual: total · por m²: min/m² · por unidade: min/un.",
        },
        { key: "quantidade", rotulo: "Quantidade", tipo: "numero", padrao: 1, ajuda: "Usada na regra por unidade" },
        { key: "frequencia", rotulo: "Frequência", tipo: "select", opcoes: FREQUENCIAS, padrao: "diaria" },
        { key: "prioridade", rotulo: "Prioridade", tipo: "select", opcoes: PRIORIDADES, padrao: "media" },
        { key: "ativo", rotulo: "Ativa", tipo: "checkbox", padrao: true },
        { key: "observacoes", rotulo: "Observações", tipo: "textarea", inteira: true },
      ]}
      colunas={[
        { key: "nome_tarefa", rotulo: "Tarefa" },
        {
          key: "local_id",
          rotulo: "Local / Sede",
          render: (t) => {
            const l = localPorId(t.local_id);
            return l ? `${l.nome_local} — ${nomeSede(l.sede_id)}` : t.local_id;
          },
        },
        {
          key: "regra_calculo",
          rotulo: "Regra",
          render: (t) => REGRAS.find((r) => r.valor === t.regra_calculo)?.rotulo.split(" (")[0] ?? t.regra_calculo,
        },
        {
          key: "tempo_base_min",
          rotulo: "Tempo previsto",
          render: (t) => (
            <strong className="num">
              {formatarDuracao(tempoPrevistoMin(t, localPorId(t.local_id)))}
            </strong>
          ),
        },
        {
          key: "prioridade",
          rotulo: "Prioridade",
          render: (t) => (
            <span
              className={`selo ${
                t.prioridade === "alta" ? "selo-vermelho" : t.prioridade === "media" ? "selo-amarelo" : "selo-cinza"
              }`}
            >
              {t.prioridade}
            </span>
          ),
        },
        {
          key: "ativo",
          rotulo: "Status",
          render: (t) => (
            <span className={`selo ${t.ativo ? "selo-verde" : "selo-cinza"}`}>
              {t.ativo ? "Ativa" : "Inativa"}
            </span>
          ),
        },
      ]}
    />
  );
}
