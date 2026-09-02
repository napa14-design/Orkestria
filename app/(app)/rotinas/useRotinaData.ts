"use client";

/**
 * Camada de dados da tela de rotinas: concentra todos os `useSWR` (keyados por
 * sede/data/modo) e as derivações puras a partir do que foi buscado. A página
 * cuida do estado de UI (filtros, seleção, modais) e das mutações.
 */
import { useMemo } from "react";
import useSWR from "swr";
import { rotinaAguardaConfirmacao } from "@/lib/agenda";
import { jornadaDoDia } from "@/lib/calculations";
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
  outro: "Ausente",
};

/** Segunda-feira da semana que contém a data. */
function segundaDaSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return somarDias(iso, -((d.getDay() + 6) % 7));
}

export function useRotinaData(sedeEscolhida: string, data: string, modo: "dia" | "semana") {
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
  // Últimos 31 dias: base do cálculo de "periódica vencida" e do "repetir".
  const { data: historico } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?de=${somarDias(data, -31)}&ate=${somarDias(data, -1)}&sede=${sedeId}` : null,
    fetcher,
  );
  // Modelos da sede — saber se há "rota padrão" (gera o dia em 1 clique).
  const { data: modelos, mutate: mutateModelos } = useSWR<
    { nome_modelo: string; padrao: boolean; evento?: boolean }[]
  >(sedeId ? `/api/modelos?sede=${sedeId}` : null, fetcher);
  // `!m.evento` espelha o filtro de `getRotaPadrao`: sem isso a tela ofereceria
  // "Gerar o dia" e a geração devolveria "sem rota".
  const temRotaPadrao = (modelos ?? []).some((m) => m.padrao && !m.evento);

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

  // Dia anterior com rotina (fonte do "repetir") — o mais recente antes de hoje.
  const fonteRepetir = useMemo(() => {
    const porData = new Map<string, number>();
    for (const r of historico ?? []) {
      if (r.status === "cancelada") continue;
      porData.set(r.data, (porData.get(r.data) ?? 0) + 1);
    }
    let melhor: { data: string; n: number } | null = null;
    for (const [d, n] of porData) if (!melhor || d > melhor.data) melhor = { data: d, n };
    return melhor;
  }, [historico]);

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
