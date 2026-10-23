"use client";

/**
 * Camada de dados da tela de rotinas: concentra todos os `useSWR` (keyados por
 * sede/data/modo) e as derivações puras a partir do que foi buscado. A página
 * cuida do estado de UI (filtros, seleção, modais) e das mutações.
 */
import { useMemo } from "react";
import useSWR from "swr";
import { rotinaAguardaConfirmacao } from "@/lib/agenda";
import { coberturaPorHistorico, jornadaDoDia } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import type {
  TipoLocalCatalogo,
  Ausencia,
  Categoria,
  Funcionario,
  Local,
  ParametrosResolvidos,
  PeriodoLetivo,
  QualificacaoFuncionario,
  Requisito,
  RotinaPlanejada,
  Sede,
  Tarefa,
  TempoPersonalizado,
} from "@/types";

const ROTULO_AUSENCIA: Record<string, string> = {
  falta: "Falta",
  atestado: "Atestado",
  ferias: "Férias",
  folga: "Folga",
  banco_horas: "Banco de horas",
  outro: "Ausente",
};

/** Segunda-feira da semana que contém a data. */
function segundaDaSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return somarDias(iso, -((d.getDay() + 6) % 7));
}

export function useRotinaData(
  sedeEscolhida: string,
  data: string,
  modo: "dia" | "semana",
  /** Supervisor: vê a agenda, nunca repete dia — não busca a fonte do "repetir". */
  somenteLeitura = false,
) {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const sedeId = sedeEscolhida || sedes?.find((s) => s.ativo)?.id || "";

  const { data: funcionarios } = useSWR<Funcionario[]>(sedeId ? `/api/funcionarios?sede=${sedeId}` : null, fetcher);
  const { data: tarefas } = useSWR<Tarefa[]>(sedeId ? `/api/tarefas?sede=${sedeId}` : null, fetcher);
  const { data: locais } = useSWR<Local[]>(sedeId ? `/api/locais?sede=${sedeId}` : null, fetcher);
  // Catálogo de tipos de local: o cliente precisa dele para prever o mesmo
  // tempo que o servidor vai gravar. Coleção pequena e global — uma busca só.
  const { data: tiposLocal } = useSWR<TipoLocalCatalogo[]>("/api/tipos-local", fetcher);
  const fatorDoTipo = useMemo(
    () =>
      new Map(
        (tiposLocal ?? [])
          .filter((t) => Number(t.fator_intensidade) > 0)
          .map((t) => [t.id, Number(t.fator_intensidade)] as const),
      ),
    [tiposLocal],
  );
  const { data: categorias } = useSWR<Categoria[]>("/api/categorias", fetcher);
  const { data: periodosLetivos } = useSWR<PeriodoLetivo[]>(sedeId ? `/api/periodos-letivos?sede=${sedeId}` : null, fetcher);
  const { data: temposPessoais } = useSWR<TempoPersonalizado[]>(sedeId ? `/api/tempos-personalizados?sede=${sedeId}` : null, fetcher);
  const { data: requisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);
  const { data: qualificacoes } = useSWR<QualificacaoFuncionario[]>(sedeId ? `/api/qualificacoes?sede=${sedeId}` : null, fetcher);
  const { data: parametros } = useSWR<ParametrosResolvidos>(sedeId ? `/api/parametros?resolvidos=1&sede=${sedeId}` : null, fetcher);
  const { data: rotinas, mutate: mutateRotinas } = useSWR<RotinaPlanejada[]>(sedeId ? `/api/rotinas?data=${data}&sede=${sedeId}` : null, fetcher);
  const { data: ausencias } = useSWR<Ausencia[]>(sedeId ? `/api/ausencias?data=${data}&sede=${sedeId}` : null, fetcher);
  // Execuções já lançadas no dia — para destacar o passo "Registrar o realizado".
  const { data: execucoesDia } = useSWR<{ rotina_id: string }[]>(sedeId ? `/api/execucoes?de=${data}&ate=${data}&sede=${sedeId}` : null, fetcher);
  // Modelos da sede — saber se há "rota padrão" (gera o dia em 1 clique).
  const { data: modelos, mutate: mutateModelos } = useSWR<
    { nome_modelo: string; padrao: boolean; evento?: boolean }[]
  >(sedeId ? `/api/modelos?sede=${sedeId}` : null, fetcher);
  // `!m.evento` espelha o filtro de `getRotaPadrao`: sem isso a tela ofereceria
  // "Gerar o dia" e a geração devolveria "sem rota".
  const temRotaPadrao = (modelos ?? []).some((m) => m.padrao && !m.evento);
  // Últimos 31 dias: só servem a dois casos — a "periódica vencida" (tarefa
  // periódica sem dia fixo) e o "repetir o dia anterior" (dia vazio e sem rota
  // padrão). Fora deles não busca. Era a maior leitura da tela: ~10 mil por
  // abertura numa sede grande rodando todo dia, e cada troca de data buscava os
  // 31 dias de novo — e em 20/10/2026 TODAS as tarefas da produção eram diárias,
  // ou seja, a leitura não servia a nada (levantamento de leituras).
  const precisaHistorico = (tarefas ?? []).some((t) => t.ativo && coberturaPorHistorico(t));
  const { data: historico } = useSWR<RotinaPlanejada[]>(
    sedeId && precisaHistorico ? `/api/rotinas?de=${somarDias(data, -31)}&ate=${somarDias(data, -1)}&sede=${sedeId}` : null,
    fetcher,
  );
  // O "repetir o dia anterior" só precisa da data mais recente e de quantos
  // blocos ela tem — contados no servidor. E só para quem pode repetir: o
  // supervisor nunca vê o botão (auditoria de leituras, 20/10/2026).
  const diaVazioSemRota = rotinas !== undefined && rotinas.length === 0 && modelos !== undefined && !temRotaPadrao;
  const { data: fonteRepetir } = useSWR<{ data: string; n: number } | null>(
    sedeId && diaVazioSemRota && !somenteLeitura ? `/api/rotinas/ultimo-dia?sede=${sedeId}&antes=${data}` : null,
    fetcher,
  );

  // Visão semanal: rotinas e ausências da semana inteira (seg–dom).
  const segunda = segundaDaSemana(data);
  const datasSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i)), [segunda]);
  const { data: rotinasSemana, mutate: mutateSemana } = useSWR<RotinaPlanejada[]>(
    modo === "semana" && sedeId ? `/api/rotinas?de=${segunda}&ate=${somarDias(segunda, 6)}&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: ausenciasSemana } = useSWR<Ausencia[]>(
    modo === "semana" && sedeId ? `/api/ausencias?de=${segunda}&ate=${somarDias(segunda, 6)}&sede=${sedeId}` : null,
    fetcher,
  );

  // ausências do dia + folgas da escala (ambas bloqueiam a coluna na agenda)
  const ausentesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of ausencias ?? []) m.set(a.funcionario_id, ROTULO_AUSENCIA[a.tipo] ?? "Ausente");
    for (const f of funcionarios ?? []) {
      if (!m.has(f.id) && !jornadaDoDia(f, data).trabalha) m.set(f.id, "Folga");
    }
    return m;
  }, [ausencias, funcionarios, data]);

  const nFaltas = (ausencias ?? []).length;
  const faltamRegistrar = useMemo(() => {
    const reg = new Set((execucoesDia ?? []).map((e) => e.rotina_id));
    const hoje = hojeISO();
    const agora = new Date();
    const agoraMin = agora.getHours() * 60 + agora.getMinutes();
    return (rotinas ?? []).filter((r) => {
      return !reg.has(r.id) && rotinaAguardaConfirmacao(r, hoje, agoraMin);
    }).length;
  }, [data, execucoesDia, rotinas]);

  return {
    sedes,
    sedeId,
    funcionarios,
    tarefas,
    locais,
    fatorDoTipo,
    categorias,
    periodosLetivos,
    temposPessoais,
    requisitos,
    qualificacoes,
    parametros,
    rotinas,
    mutateRotinas,
    ausencias,
    historico,
    modelos,
    mutateModelos,
    temRotaPadrao,
    datasSemana,
    rotinasSemana,
    mutateSemana,
    ausenciasSemana,
    ausentesMap,
    fonteRepetir,
    nFaltas,
    faltamRegistrar,
  };
}
