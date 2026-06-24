"use client";

/**
 * Tela principal: paleta de tarefas (esquerda) + agenda drag-and-drop
 * (centro) + resumo de ocupação (direita).
 *
 * Os conflitos são validados duas vezes: aqui no cliente, para resposta
 * imediata, e novamente no servidor antes de gravar.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import AgendaGrid from "@/components/agenda/AgendaGrid";
import AlertPanel from "@/components/agenda/AlertPanel";
import CoberturaPanel from "@/components/agenda/CoberturaPanel";
import FiltersBar from "@/components/agenda/FiltersBar";
import ModalPlanejamento from "@/components/agenda/ModalPlanejamento";
import OccupancySummary from "@/components/agenda/OccupancySummary";
import PendenciasPanel from "@/components/agenda/PendenciasPanel";
import AjudaAgenda from "@/components/agenda/AjudaAgenda";
import SemanaGrid from "@/components/agenda/SemanaGrid";
import TaskPalette from "@/components/agenda/TaskPalette";
import Carregando from "@/components/Carregando";
import Modal from "@/components/Modal";
import {
  blocosOcupados,
  funcionarioNoDia,
  jornadaDoDia,
  PARAMETROS_PADRAO,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { apiDelete, apiPost, apiPut, ErroApi, fetcher } from "@/lib/clientApi";
import { formatarDataBR, formatarDuracao, hhmmParaMin, hojeISO, minParaHHMM, somarDias } from "@/lib/dateUtils";
import { temErro, validarAlocacao } from "@/lib/validations";
import type {
  AlertaValidacao,
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

interface RespostaRotina {
  rotina: RotinaPlanejada;
  alertas: AlertaValidacao[];
}

export default function PaginaRotinas() {
  const [data, setData] = useState(hojeISO());
  const [sedeEscolhida, setSedeEscolhida] = useState("");
  const [turno, setTurno] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<AlertaValidacao[]>([]);
  const [planejamentoAberto, setPlanejamentoAberto] = useState(false);
  const [modo, setModo] = useState<"dia" | "semana">("dia");
  // Blocos do item em arrasto — dimensiona o fantasma de drop na agenda.
  const [blocosArrasto, setBlocosArrasto] = useState<number | null>(null);
  // Sedes grandes (50+ ASGs): busca por nome + paginação de colunas.
  const [buscaFuncionario, setBuscaFuncionario] = useState("");
  const [paginaFunc, setPaginaFunc] = useState(0);
  // Modal de "autorizar conflito manualmente" (substitui o confirm() nativo).
  const [confirmacao, setConfirmacao] = useState<{
    mensagens: string[];
    resolver: (ok: boolean) => void;
  } | null>(null);
  // Modal "quanto tempo hoje?" para tarefas de presença/plantão e regra manual,
  // cuja duração varia a cada dia (definida na alocação, não na tarefa).
  const [duracaoPrompt, setDuracaoPrompt] = useState<{
    nome: string;
    resolver: (min: number | null) => void;
  } | null>(null);
  const [duracaoInput, setDuracaoInput] = useState("");

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const sedeId = sedeEscolhida || sedes?.find((s) => s.ativo)?.id || "";

  const { data: funcionarios } = useSWR<Funcionario[]>(
    sedeId ? `/api/funcionarios?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: tarefas } = useSWR<Tarefa[]>(
    sedeId ? `/api/tarefas?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: locais } = useSWR<Local[]>(
    sedeId ? `/api/locais?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: categorias } = useSWR<Categoria[]>("/api/categorias", fetcher);
  const { data: periodosLetivos } = useSWR<PeriodoLetivo[]>(
    sedeId ? `/api/periodos-letivos?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: temposPessoais } = useSWR<TempoPersonalizado[]>(
    sedeId ? `/api/tempos-personalizados?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: requisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);
  const { data: qualificacoes } = useSWR<QualificacaoFuncionario[]>(
    sedeId ? `/api/qualificacoes?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: parametros } = useSWR<ParametrosResolvidos>(
    sedeId ? `/api/parametros?resolvidos=1&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: rotinas, mutate: mutateRotinas } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?data=${data}&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: ausencias } = useSWR<Ausencia[]>(
    sedeId ? `/api/ausencias?data=${data}&sede=${sedeId}` : null,
    fetcher,
  );
  // Execuções já lançadas no dia — para destacar o passo "Registrar o realizado".
  const { data: execucoesDia } = useSWR<{ rotina_id: string }[]>(
    sedeId ? `/api/execucoes?de=${data}&ate=${data}` : null,
    fetcher,
  );
  // Últimos 31 dias: base do cálculo de "periódica vencida".
  const { data: historico } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?de=${somarDias(data, -31)}&ate=${somarDias(data, -1)}&sede=${sedeId}` : null,
    fetcher,
  );
  // Modelos da sede — saber se há "rota padrão" (gera o dia em 1 clique).
  const { data: modelos, mutate: mutateModelos } = useSWR<
    { nome_modelo: string; padrao: boolean }[]
  >(sedeId ? `/api/modelos?sede=${sedeId}` : null, fetcher);
  const temRotaPadrao = (modelos ?? []).some((m) => m.padrao);

  // Visão semanal: rotinas e ausências da semana inteira (seg–dom).
  const segunda = segundaDaSemana(data);
  const datasSemana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i)),
    [segunda],
  );
  const { data: rotinasSemana } = useSWR<RotinaPlanejada[]>(
    modo === "semana" && sedeId
      ? `/api/rotinas?de=${segunda}&ate=${somarDias(segunda, 6)}&sede=${sedeId}`
      : null,
    fetcher,
  );
  const { data: ausenciasSemana } = useSWR<Ausencia[]>(
    modo === "semana" && sedeId
      ? `/api/ausencias?de=${segunda}&ate=${somarDias(segunda, 6)}&sede=${sedeId}`
      : null,
    fetcher,
  );

  // ausências do dia + folgas da escala (ambas bloqueiam a coluna na agenda)
  const ausentesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of ausencias ?? [])
      m.set(a.funcionario_id, ROTULO_AUSENCIA[a.tipo] ?? "Ausente");
    for (const f of funcionarios ?? []) {
      if (!m.has(f.id) && !jornadaDoDia(f, data).trabalha) m.set(f.id, "Folga");
    }
    return m;
  }, [ausencias, funcionarios, data]);

  const params = parametros ?? PARAMETROS_PADRAO;
  const blocoMin = params.bloco_agenda_min || 30;

  const FUNC_POR_PAGINA = 8;

  /** Todos os funcionários da sede/turno/busca — alimenta equipe e cobertura. */
  const funcionariosVisiveis = useMemo(() => {
    const q = buscaFuncionario.trim().toLowerCase();
    return (funcionarios ?? [])
      .filter(
        (f) =>
          f.ativo &&
          (!turno || f.turno === turno) &&
          (!q || f.nome.toLowerCase().includes(q)),
      )
      .toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [funcionarios, turno, buscaFuncionario]);

  /** Página de colunas exibida na agenda (8 por vez). */
  const totalPaginasFunc = Math.max(
    1,
    Math.ceil(funcionariosVisiveis.length / FUNC_POR_PAGINA),
  );
  const paginaAtual = Math.min(paginaFunc, totalPaginasFunc - 1);
  const funcionariosPagina = useMemo(
    () =>
      funcionariosVisiveis.slice(
        paginaAtual * FUNC_POR_PAGINA,
        (paginaAtual + 1) * FUNC_POR_PAGINA,
      ),
    [funcionariosVisiveis, paginaAtual],
  );

  // Funcionários com o horário daquela data aplicado (sábado de 4h, etc.).
  const efetivosPagina = useMemo(
    () => funcionariosPagina.map((f) => funcionarioNoDia(f, data)),
    [funcionariosPagina, data],
  );
  const efetivosVisiveis = useMemo(
    () => funcionariosVisiveis.map((f) => funcionarioNoDia(f, data)),
    [funcionariosVisiveis, data],
  );

  /** Seleciona e garante que a coluna do funcionário esteja na página visível. */
  function selecionarFuncionario(id: string) {
    setSelecionado(id);
    const idx = funcionariosVisiveis.findIndex((f) => f.id === id);
    if (idx >= 0) setPaginaFunc(Math.floor(idx / FUNC_POR_PAGINA));
  }

  function mostrarErro(err: unknown) {
    if (err instanceof ErroApi && err.alertas.length > 0) setAlertas(err.alertas);
    else
      setAlertas([
        {
          nivel: "erro",
          codigo: "API",
          mensagem: err instanceof Error ? err.message : "Erro inesperado.",
        },
      ]);
  }

  /** Bloqueio imediato para funcionário ausente (o servidor também valida). */
  function bloquearSeAusente(funcionarioId: string): boolean {
    const motivo = ausentesMap.get(funcionarioId);
    if (!motivo) return false;
    const nome = funcionariosVisiveis.find((f) => f.id === funcionarioId)?.nome ?? "Funcionário";
    setAlertas([
      {
        nivel: "erro",
        codigo: "FUNCIONARIO_AUSENTE",
        mensagem: `${nome} está ausente hoje (${motivo}) — use o painel de cobertura para remanejar.`,
      },
    ]);
    return true;
  }

  /**
   * Conflitos que o supervisor pode autorizar manualmente (regras 6 e 7).
   * Abre um modal estilizado e devolve a escolha (sem o confirm() do navegador).
   */
  function pedirAutorizacao(validacao: AlertaValidacao[]): Promise<boolean> {
    const erros = validacao.filter((a) => a.nivel === "erro");
    const autorizaveis =
      erros.length > 0 &&
      erros.every((a) => a.codigo === "INTERVALO" || a.codigo === "SOBREPOSICAO");
    if (!autorizaveis) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      setConfirmacao({ mensagens: erros.map((e) => e.mensagem), resolver: resolve });
    });
  }

  function responderConfirmacao(ok: boolean) {
    confirmacao?.resolver(ok);
    setConfirmacao(null);
  }

  /** Pergunta a duração (min) ao soltar tarefa de presença/manual. */
  function pedirDuracao(nome: string, sugestaoMin: number): Promise<number | null> {
    setDuracaoInput(String(Math.max(5, Math.round(sugestaoMin))));
    return new Promise<number | null>((resolve) => {
      setDuracaoPrompt({ nome, resolver: resolve });
    });
  }

  function responderDuracao(min: number | null) {
    duracaoPrompt?.resolver(min);
    setDuracaoPrompt(null);
  }

  /** Validação local imediata; o servidor revalida antes de gravar. */
  function validarLocalmente(
    funcionarioId: string,
    inicio: string,
    tempoPrevisto: number,
    tarefa?: Tarefa,
    ignorarRotinaId?: string,
  ): AlertaValidacao[] {
    const funcionario = efetivosVisiveis.find((f) => f.id === funcionarioId);
    if (!funcionario)
      return [{ nivel: "erro", codigo: "SEM_FUNCIONARIO", mensagem: "Funcionário não encontrado." }];
    const local = tarefa ? (locais ?? []).find((l) => l.id === tarefa.local_id) : undefined;
    const visual = tempoVisualMin(tempoPrevisto, blocoMin);
    const iniMin = hhmmParaMin(inicio);
    return validarAlocacao({
      funcionario,
      rotinasExistentes: (rotinas ?? []).filter(
        (r) => r.funcionario_id === funcionarioId && r.id !== ignorarRotinaId,
      ),
      inicioMin: iniMin,
      fimMin: iniMin + visual,
      tarefa,
      local,
      parametros: params,
      tempoPrevistoNovo: tempoPrevisto,
      requisitosCatalogo: requisitos ?? [],
      qualificacoesFuncionario: (qualificacoes ?? []).filter((q) => q.funcionario_id === funcionarioId),
      data,
    });
  }

  async function soltarNova(tarefaId: string, funcionarioId: string, inicio: string) {
    if (bloquearSeAusente(funcionarioId)) return;
    const tarefa = (tarefas ?? []).find((t) => t.id === tarefaId);
    if (!tarefa) return;
    const local = (locais ?? []).find((l) => l.id === tarefa.local_id);
    const pessoal = (temposPessoais ?? []).find(
      (tp) => tp.funcionario_id === funcionarioId && tp.tarefa_id === tarefaId,
    );
    const base = pessoal ? pessoal.tempo_min : tempoPrevistoMin(tarefa, local);

    // Presença/plantão e regra manual têm duração variável por dia: pergunta
    // "quanto tempo hoje?" em vez de assumir o tempo base.
    const duracaoVariavel = tarefa.presenca || tarefa.regra_calculo === "manual";
    let previsto = base;
    if (duracaoVariavel) {
      const escolhido = await pedirDuracao(tarefa.nome_tarefa, base > 0 ? base : blocoMin * 2);
      if (escolhido == null) return; // supervisor cancelou
      previsto = escolhido;
    }

    const validacao = validarLocalmente(funcionarioId, inicio, previsto, tarefa);
    let forcar = false;
    if (temErro(validacao)) {
      if (!(await pedirAutorizacao(validacao))) {
        setAlertas(validacao);
        return;
      }
      forcar = true;
    }
    // Card aparece na hora (otimista); o servidor valida em 2º plano e a
    // resposta substitui o provisório. Se o servidor recusar, reverte sozinho.
    const visual = tempoVisualMin(previsto, blocoMin);
    const iniMin = hhmmParaMin(inicio);
    const otimista: RotinaPlanejada = {
      id: crypto.randomUUID(),
      data,
      funcionario_id: funcionarioId,
      sede_id: tarefa.sede_id,
      tarefa_id: tarefaId,
      local_id: tarefa.local_id,
      inicio_planejado: inicio,
      fim_planejado: minParaHHMM(iniMin + visual),
      tempo_previsto_min: previsto,
      tempo_visual_min: visual,
      blocos_ocupados: blocosOcupados(previsto, blocoMin),
      status: "planejada",
      observacao: forcar ? "[Autorizado manualmente]" : "",
      supervisor_id: "",
      criado_em: "",
      atualizado_em: "",
    };
    setSelecionado(funcionarioId);
    try {
      let real: RotinaPlanejada | null = null;
      await mutateRotinas(
        async (cur) => {
          const res = await apiPost<RespostaRotina>("/api/rotinas", {
            data,
            funcionario_id: funcionarioId,
            tarefa_id: tarefaId,
            inicio_planejado: inicio,
            forcar,
            duracao_min: duracaoVariavel ? previsto : undefined,
          });
          setAlertas(res.alertas ?? []);
          real = res.rotina;
          return [...(cur ?? []).filter((r) => r.id !== otimista.id), res.rotina];
        },
        {
          optimisticData: (cur) => [...(cur ?? []), otimista],
          // Mescla no cache MAIS RECENTE: troca o card provisório pelo real sem
          // descartar outros adicionados ao mesmo tempo ("somem ao colocar rápido").
          populateCache: (_res, atual) => {
            const rr = real;
            const base = (atual ?? []).filter((r) => r.id !== otimista.id && (!rr || r.id !== rr.id));
            return rr ? [...base, rr] : base;
          },
          rollbackOnError: true,
          // Reconcilia com o servidor após a operação (deduplicado pela SWR).
          // populateCache dá o feedback imediato; esta revalidação corrige
          // qualquer divergência de cache em adições/edições concorrentes —
          // sem flicker, pois keepPreviousData está ligado globalmente.
          revalidate: true,
        },
      );
    } catch (err) {
      mostrarErro(err);
    }
  }

  async function mover(rotinaId: string, funcionarioId: string, inicio: string) {
    if (bloquearSeAusente(funcionarioId)) return;
    const rotina = (rotinas ?? []).find((r) => r.id === rotinaId);
    if (!rotina) return;
    if (rotina.funcionario_id === funcionarioId && rotina.inicio_planejado === inicio) return;

    const tarefa = (tarefas ?? []).find((t) => t.id === rotina.tarefa_id);
    const validacao = validarLocalmente(
      funcionarioId,
      inicio,
      rotina.tempo_previsto_min,
      tarefa,
      rotinaId,
    );
    let forcar = false;
    if (temErro(validacao)) {
      if (!(await pedirAutorizacao(validacao))) {
        setAlertas(validacao);
        return;
      }
      forcar = true;
    }
    const fim = minParaHHMM(hhmmParaMin(inicio) + rotina.tempo_visual_min);
    const otimista = { ...rotina, funcionario_id: funcionarioId, inicio_planejado: inicio, fim_planejado: fim };
    setSelecionado(funcionarioId);
    try {
      let real: RotinaPlanejada | null = null;
      await mutateRotinas(
        async (cur) => {
          const res = await apiPut<RespostaRotina>(`/api/rotinas/${rotinaId}`, {
            funcionario_id: funcionarioId,
            inicio_planejado: inicio,
            forcar,
          });
          setAlertas(res.alertas ?? []);
          real = res.rotina;
          return (cur ?? []).map((r) => (r.id === rotinaId ? res.rotina : r));
        },
        {
          optimisticData: (cur) => (cur ?? []).map((r) => (r.id === rotinaId ? otimista : r)),
          // Aplica sobre o cache MAIS RECENTE — não desfaz outros movimentos simultâneos.
          populateCache: (_res, atual) => {
            const rr = real;
            return (atual ?? []).map((r) => (r.id === rotinaId && rr ? rr : r));
          },
          rollbackOnError: true,
          // Reconcilia com o servidor após a operação (deduplicado pela SWR).
          // populateCache dá o feedback imediato; esta revalidação corrige
          // qualquer divergência de cache em adições/edições concorrentes —
          // sem flicker, pois keepPreviousData está ligado globalmente.
          revalidate: true,
        },
      );
    } catch (err) {
      mostrarErro(err);
    }
  }

  /** Redimensionamento pela alça do card; conflitos podem ser autorizados. */
  async function redimensionar(rotinaId: string, novoTempoMin: number) {
    const visual = tempoVisualMin(novoTempoMin, blocoMin);
    const aplicar = (forcar: boolean) => {
      let real: RotinaPlanejada | null = null;
      return mutateRotinas(
        async (cur) => {
          const res = await apiPut<RespostaRotina>(`/api/rotinas/${rotinaId}`, {
            tempo_previsto_min: novoTempoMin,
            forcar,
          });
          setAlertas(res.alertas ?? []);
          real = res.rotina;
          return (cur ?? []).map((r) => (r.id === rotinaId ? res.rotina : r));
        },
        {
          optimisticData: (cur) =>
            (cur ?? []).map((r) =>
              r.id === rotinaId
                ? {
                    ...r,
                    tempo_previsto_min: novoTempoMin,
                    tempo_visual_min: visual,
                    blocos_ocupados: blocosOcupados(novoTempoMin, blocoMin),
                    fim_planejado: minParaHHMM(hhmmParaMin(r.inicio_planejado) + visual),
                  }
                : r,
            ),
          // Aplica sobre o cache MAIS RECENTE — preserva outras edições simultâneas.
          populateCache: (_res, atual) => {
            const rr = real;
            return (atual ?? []).map((r) => (r.id === rotinaId && rr ? rr : r));
          },
          rollbackOnError: true,
          // Reconcilia com o servidor após a operação (deduplicado pela SWR).
          // populateCache dá o feedback imediato; esta revalidação corrige
          // qualquer divergência de cache em adições/edições concorrentes —
          // sem flicker, pois keepPreviousData está ligado globalmente.
          revalidate: true,
        },
      );
    };
    try {
      await aplicar(false);
    } catch (err) {
      if (err instanceof ErroApi && (await pedirAutorizacao(err.alertas))) {
        try {
          await aplicar(true);
        } catch (err2) {
          mostrarErro(err2);
        }
        return;
      }
      mostrarErro(err);
    }
  }

  async function remover(rotinaId: string) {
    try {
      await mutateRotinas(
        async (cur) => {
          await apiDelete(`/api/rotinas/${rotinaId}`);
          return (cur ?? []).filter((r) => r.id !== rotinaId);
        },
        {
          optimisticData: (cur) => (cur ?? []).filter((r) => r.id !== rotinaId),
          // Filtra sobre o cache MAIS RECENTE (currentData) — evita que exclusões
          // rápidas concorrentes reintroduzam um card já removido ("some e volta").
          populateCache: (_res, atual) => (atual ?? []).filter((r) => r.id !== rotinaId),
          rollbackOnError: true,
          // Reconcilia com o servidor após a operação (deduplicado pela SWR).
          // populateCache dá o feedback imediato; esta revalidação corrige
          // qualquer divergência de cache em adições/edições concorrentes —
          // sem flicker, pois keepPreviousData está ligado globalmente.
          revalidate: true,
        },
      );
    } catch (err) {
      mostrarErro(err);
    }
  }

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
    return (rotinas ?? []).filter((r) => r.status !== "cancelada" && !reg.has(r.id)).length;
  }, [execucoesDia, rotinas]);

  const [repetindo, setRepetindo] = useState(false);
  async function repetirDiaAnterior() {
    if (!fonteRepetir || !sedeId) return;
    setRepetindo(true);
    try {
      const r = await apiPost<{ copiadas: number; puladas: number }>("/api/rotinas/duplicar", {
        data_origem: fonteRepetir.data,
        datas_destino: [data],
        sede_id: sedeId,
      });
      await mutateRotinas();
      setAlertas([
        {
          nivel: "alerta",
          codigo: "REPETIR",
          mensagem: `${r.copiadas} tarefa(s) copiadas de ${formatarDataBR(fonteRepetir.data)}${
            r.puladas > 0 ? ` · ${r.puladas} puladas por conflito` : ""
          }.`,
        },
      ]);
    } catch (err) {
      mostrarErro(err);
    } finally {
      setRepetindo(false);
    }
  }

  const [denso, setDenso] = useState(false); // grade compacta (vê o dia todo com menos rolagem)
  const [gerando, setGerando] = useState(false);
  async function gerarDia() {
    if (!sedeId) return;
    setGerando(true);
    try {
      const r = await apiPost<{
        semRota?: boolean;
        geradas: number;
        puladas: number;
        detalhes: string[];
      }>("/api/rotinas/gerar", { sede: sedeId, data });
      await mutateRotinas();
      if (r.semRota) {
        setAlertas([
          {
            nivel: "alerta",
            codigo: "GERAR",
            mensagem: "Esta sede ainda não tem rota padrão. Monte um dia e salve como rota padrão.",
          },
        ]);
      } else {
        setAlertas([
          {
            nivel: "alerta",
            codigo: "GERAR",
            mensagem: `${r.geradas} tarefa(s) geradas da rota padrão${
              r.puladas > 0 ? ` · ${r.puladas} puladas (já existiam, ausência ou conflito)` : ""
            }. Revise as exceções abaixo.`,
          },
        ]);
      }
    } catch (err) {
      mostrarErro(err);
    } finally {
      setGerando(false);
    }
  }

  const [salvandoPadrao, setSalvandoPadrao] = useState(false);
  async function salvarRotaPadrao() {
    if (!sedeId) return;
    setSalvandoPadrao(true);
    try {
      const r = await apiPost<{ itens: number }>("/api/modelos", {
        nome: "Rota padrão",
        data_origem: data,
        sede_id: sedeId,
        padrao: true,
        com_duracao: true,
      });
      await mutateModelos();
      setAlertas([
        {
          nivel: "alerta",
          codigo: "ROTA_PADRAO",
          mensagem: `Rota padrão salva com ${r.itens} tarefa(s). A partir de agora, dias vazios podem ser gerados em 1 clique.`,
        },
      ]);
    } catch (err) {
      mostrarErro(err);
    } finally {
      setSalvandoPadrao(false);
    }
  }

  function concluirPlanejamento(mensagem: string) {
    setAlertas([{ nivel: "alerta", codigo: "PLANEJAMENTO", mensagem }]);
    void mutateRotinas();
    void mutateModelos();
  }

  return (
    <div>
      <FiltersBar
        data={data}
        sedeId={sedeId}
        turno={turno}
        sedes={sedes ?? []}
        aoMudarData={setData}
        aoMudarSede={(v) => {
          setSedeEscolhida(v);
          setSelecionado(null);
          setBuscaFuncionario("");
          setPaginaFunc(0);
        }}
        modo={modo}
        busca={buscaFuncionario}
        aoMudarModo={setModo}
        aoMudarTurno={(v) => {
          setTurno(v);
          setPaginaFunc(0);
        }}
        aoMudarBusca={(v) => {
          setBuscaFuncionario(v);
          setPaginaFunc(0);
        }}
        aoDuplicar={() => setPlanejamentoAberto(true)}
      />

      {modo === "dia" ? (
        <div
          className="painel"
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", marginBottom: 10 }}
        >
          <span className="rotulo" style={{ color: "var(--acento)" }}>Passos do dia</span>
          {temRotaPadrao && (
            <button
              className="btn btn-mini btn-primario"
              onClick={gerarDia}
              disabled={gerando}
              title="Gera o dia a partir da rota padrão da sede (não duplica o que já existe)"
            >
              {gerando ? "Gerando…" : "⚡ Gerar o dia da rota padrão"}
            </button>
          )}
          {!temRotaPadrao && (rotinas?.length ?? 0) > 0 && (
            <button
              className="btn btn-mini"
              onClick={salvarRotaPadrao}
              disabled={salvandoPadrao}
              title="Salva o dia atual como a rota padrão da sede — depois, dias vazios são gerados em 1 clique"
            >
              {salvandoPadrao ? "Salvando…" : "★ Salvar como rota padrão"}
            </button>
          )}
          {fonteRepetir && (
            <button
              className="btn btn-mini"
              onClick={repetirDiaAnterior}
              disabled={repetindo}
              title={`Copia as tarefas de ${formatarDataBR(fonteRepetir.data)} para o dia aberto (conflitos são pulados)`}
            >
              {repetindo ? "Repetindo…" : `↺ Repetir o dia anterior (${formatarDataBR(fonteRepetir.data)})`}
            </button>
          )}
          <Link
            href="/ausencias"
            className="btn btn-mini btn-fantasma"
            style={nFaltas > 0 ? { borderColor: "var(--amarelo)", color: "var(--tinta)" } : undefined}
            title={nFaltas > 0 ? `${nFaltas} ausência(s) hoje — redistribua as tarefas` : "Faltas e ausências do dia"}
          >
            {nFaltas > 0 ? `⚠ Faltas (${nFaltas})` : "Faltas"}
          </Link>
          {sedeId && (
            <a
              href={`/api/fichas/pdf?data=${data}&sede=${sedeId}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-mini btn-fantasma"
              style={{ textDecoration: "none" }}
            >
              🖨 Imprimir fichas
            </a>
          )}
          {faltamRegistrar > 0 ? (
            <Link
              href="/acompanhamento"
              className="btn btn-mini btn-primario"
              style={{ textDecoration: "none" }}
              title={`${faltamRegistrar} tarefa(s) sem o realizado lançado`}
            >
              ✅ Registrar o realizado ({faltamRegistrar})
            </Link>
          ) : (rotinas?.length ?? 0) > 0 ? (
            <Link href="/acompanhamento" className="btn btn-mini btn-fantasma" style={{ textDecoration: "none" }}>
              ✓ Realizado lançado
            </Link>
          ) : (
            <Link href="/acompanhamento" className="btn btn-mini btn-fantasma">
              ✅ Registrar o realizado
            </Link>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-mini btn-fantasma"
              onClick={() => setDenso((v) => !v)}
              title="Alterna a altura das linhas — compacto mostra o dia inteiro com menos rolagem"
            >
              {denso ? "⊕ Expandir" : "⊖ Compactar"}
            </button>
            <AjudaAgenda />
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <AjudaAgenda />
        </div>
      )}

      {modo === "semana" ? (
        <SemanaGrid
          funcionarios={funcionariosVisiveis}
          rotinas={rotinasSemana ?? []}
          ausencias={ausenciasSemana ?? []}
          parametros={params}
          datas={datasSemana}
          dataSelecionada={data}
          aoAbrirDia={(dia) => {
            setData(dia);
            setModo("dia");
          }}
        />
      ) : !funcionarios || !tarefas || !locais ? (
        <div className="painel">
          <Carregando texto="Carregando agenda…" style={{ padding: 64 }} />
        </div>
      ) : (
        <>
      {(rotinas?.length ?? 0) === 0 && temRotaPadrao && (
        <div
          className="painel entra"
          style={{ marginBottom: 14, padding: "12px 16px", borderLeft: "6px solid var(--acento)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <span style={{ flex: 1, minWidth: 220 }}>
            <strong>Dia ainda vazio.</strong> Esta sede tem uma <strong>rota padrão</strong> — gere o dia
            em 1 clique e depois ajuste só o que mudou (faltas, eventos…).
          </span>
          <button className="btn btn-primario" onClick={gerarDia} disabled={gerando}>
            {gerando ? "Gerando…" : "⚡ Gerar o dia da rota padrão"}
          </button>
        </div>
      )}

      {(rotinas?.length ?? 0) === 0 && !temRotaPadrao && fonteRepetir && (
        <div
          className="painel entra"
          style={{ marginBottom: 14, padding: "12px 16px", borderLeft: "6px solid var(--acento)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <span style={{ flex: 1, minWidth: 220 }}>
            <strong>Dia ainda vazio.</strong> A rotina costuma repetir — comece copiando o dia anterior
            ({formatarDataBR(fonteRepetir.data)} · {fonteRepetir.n} tarefa{fonteRepetir.n === 1 ? "" : "s"}) e ajuste o que mudou.
          </span>
          <button className="btn btn-primario" onClick={repetirDiaAnterior} disabled={repetindo}>
            {repetindo ? "Repetindo…" : "↺ Repetir o dia anterior"}
          </button>
        </div>
      )}

      <CoberturaPanel
        funcionarios={efetivosVisiveis}
        ausencias={ausentesMap}
        rotinas={rotinas ?? []}
        tarefas={tarefas ?? []}
        parametros={params}
        aoMover={mover}
      />

      <PendenciasPanel
        tarefas={tarefas ?? []}
        locais={locais ?? []}
        rotinasDoDia={rotinas ?? []}
        historico={historico ?? []}
        data={data}
        periodos={periodosLetivos ?? []}
      />

      {/* paginação de colunas — só aparece em sedes grandes */}
      {funcionariosVisiveis.length > FUNC_POR_PAGINA && (
        <div
          className="painel entra"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "6px 12px", marginBottom: 14 }}
        >
          <button
            className="btn btn-mini"
            disabled={paginaAtual === 0}
            onClick={() => setPaginaFunc(paginaAtual - 1)}
          >
            ‹ Anteriores
          </button>
          <span className="rotulo">
            Funcionários{" "}
            <span className="num">
              {paginaAtual * FUNC_POR_PAGINA + 1}–
              {Math.min((paginaAtual + 1) * FUNC_POR_PAGINA, funcionariosVisiveis.length)}
            </span>{" "}
            de <span className="num">{funcionariosVisiveis.length}</span>
          </span>
          <button
            className="btn btn-mini"
            disabled={paginaAtual >= totalPaginasFunc - 1}
            onClick={() => setPaginaFunc(paginaAtual + 1)}
          >
            Próximos ›
          </button>
        </div>
      )}

      <div className="linha-rotina">
        <TaskPalette
          tarefas={tarefas ?? []}
          locais={locais ?? []}
          categorias={categorias ?? []}
          blocoMin={blocoMin}
          aoIniciarArrasto={setBlocosArrasto}
          aoTerminarArrasto={() => setBlocosArrasto(null)}
        />

        <AgendaGrid
          funcionarios={efetivosPagina}
          rotinas={rotinas ?? []}
          tarefas={tarefas ?? []}
          locais={locais ?? []}
          categorias={categorias ?? []}
          blocoMin={blocoMin}
          funcionarioSelecionado={selecionado}
          ausencias={ausentesMap}
          aoSelecionarFuncionario={selecionarFuncionario}
          aoSoltarNova={soltarNova}
          aoMover={mover}
          aoRemover={remover}
          aoRedimensionar={redimensionar}
          blocosArrasto={blocosArrasto}
          aoIniciarArrasto={setBlocosArrasto}
          aoTerminarArrasto={() => setBlocosArrasto(null)}
          alturaBloco={denso ? 30 : 48}
        />

        <OccupancySummary
          funcionarios={efetivosVisiveis}
          rotinas={rotinas ?? []}
          tarefas={tarefas ?? []}
          parametros={params}
          selecionadoId={selecionado}
          aoSelecionar={selecionarFuncionario}
        />
      </div>
        </>
      )}

      <ModalPlanejamento
        aberto={planejamentoAberto}
        aoFechar={() => setPlanejamentoAberto(false)}
        dataAtual={data}
        sedeId={sedeId}
        aoConcluir={concluirPlanejamento}
      />

      <AlertPanel
        alertas={alertas}
        aoLimpar={() => setAlertas([])}
        aoDispensar={(i) => setAlertas((prev) => prev.filter((_, idx) => idx !== i))}
      />

      <Modal
        titulo="Autorizar conflito manualmente?"
        aberto={!!confirmacao}
        aoFechar={() => responderConfirmacao(false)}
        larguraMax={460}
      >
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 10 }}>
          Esta alocação tem um conflito que você pode autorizar:
        </p>
        <div
          style={{
            background: "var(--papel-2)",
            borderLeft: "4px solid var(--amarelo)",
            borderRadius: 3,
            padding: "8px 12px",
            display: "grid",
            gap: 4,
            marginBottom: 12,
          }}
        >
          {confirmacao?.mensagens.map((m, i) => (
            <div key={i} style={{ fontSize: 13, color: "var(--tinta)" }}>
              ⚠ {m}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--tinta-3)", marginBottom: 16 }}>
          Se autorizar, a rotina fica marcada como <strong>autorizada manualmente</strong> (e o
          histórico registra isso).
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" onClick={() => responderConfirmacao(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primario" onClick={() => responderConfirmacao(true)}>
            Autorizar mesmo assim
          </button>
        </div>
      </Modal>

      <Modal
        titulo="Quanto tempo hoje?"
        aberto={!!duracaoPrompt}
        aoFechar={() => responderDuracao(null)}
        larguraMax={420}
      >
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 12 }}>
          <strong>{duracaoPrompt?.nome}</strong> é uma atividade de duração variável (presença/
          plantão ou tempo manual). Informe a duração <strong>deste dia</strong> — não muda a tarefa.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[15, 30, 60, 90, 120].map((m) => (
            <button
              key={m}
              type="button"
              className="btn btn-mini"
              onClick={() => setDuracaoInput(String(m))}
              style={{ fontWeight: 700, outline: Number(duracaoInput) === m ? "2px solid var(--acento)" : "none" }}
            >
              {formatarDuracao(m)}
            </button>
          ))}
        </div>
        <label className="campo" style={{ marginBottom: 16 }}>
          <span className="rotulo">Duração (minutos)</span>
          <input
            type="number"
            min="5"
            step="5"
            value={duracaoInput}
            autoFocus
            onChange={(e) => setDuracaoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && Number(duracaoInput) > 0) responderDuracao(Number(duracaoInput));
            }}
          />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" onClick={() => responderDuracao(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primario"
            disabled={!(Number(duracaoInput) > 0)}
            onClick={() => responderDuracao(Number(duracaoInput))}
          >
            Colocar na agenda
          </button>
        </div>
      </Modal>
    </div>
  );
}
