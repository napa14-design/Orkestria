"use client";

/**
 * Tela principal: paleta de tarefas (esquerda) + agenda drag-and-drop
 * (centro) + resumo de ocupação (direita).
 *
 * Container: cuida do estado de UI (filtros, seleção, modais) e das mutações.
 * Os dados (SWR + derivações) vêm de useRotinaData; toolbar e modais são
 * componentes próprios. Conflitos são validados aqui (resposta imediata) e de
 * novo no servidor antes de gravar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import AgendaGrid from "@/components/agenda/AgendaGrid";
import AjudaAgenda from "@/components/agenda/AjudaAgenda";
import AlertPanel from "@/components/agenda/AlertPanel";
import BarraAcaoRapida, {
  type EstadoSalvamentoAgenda,
} from "@/components/agenda/BarraAcaoRapida";
import BarraPassosDoDia from "@/components/agenda/BarraPassosDoDia";
import CadastroRapidoAgenda from "@/components/agenda/CadastroRapidoAgenda";
import CoberturaPanel from "@/components/agenda/CoberturaPanel";
import FiltersBar from "@/components/agenda/FiltersBar";
import ModaisRotina from "@/components/agenda/ModaisRotina";
import ModalPlanejamento from "@/components/agenda/ModalPlanejamento";
import OccupancySummary from "@/components/agenda/OccupancySummary";
import PendenciasPanel from "@/components/agenda/PendenciasPanel";
import SemanaGrid from "@/components/agenda/SemanaGrid";
import TaskPalette from "@/components/agenda/TaskPalette";
import Carregando from "@/components/Carregando";
import { useSessao } from "@/components/SessaoContext";
import {
  blocosOcupados,
  funcionarioNoDia,
  PARAMETROS_PADRAO,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { apiDelete, apiPost, apiPut, ErroApi } from "@/lib/clientApi";
import { sugerirAlocacao } from "@/lib/agenda";
import {
  CHAVE_CONTEXTO_AGENDA,
  lerContextoAgenda,
  type ContextoAgendaPersistido,
} from "@/lib/contextoAgenda";
import { formatarDataBR, hhmmParaMin, hojeISO, minParaHHMM } from "@/lib/dateUtils";
import { temErro, validarAlocacao } from "@/lib/validations";
import { useRotinaData } from "./useRotinaData";
import type { AlertaValidacao, RotinaPlanejada, Tarefa } from "@/types";

interface RespostaRotina {
  rotina: RotinaPlanejada;
  alertas: AlertaValidacao[];
}

interface AcaoDesfazer {
  rotulo: string;
  executar: () => Promise<void>;
}

export default function PaginaRotinas() {
  const sessao = useSessao();
  const [data, setData] = useState(hojeISO());
  const [sedeEscolhida, setSedeEscolhida] = useState("");
  const [turno, setTurno] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<AlertaValidacao[]>([]);
  const [planejamentoAberto, setPlanejamentoAberto] = useState(false);
  const [cadastroRapidoAberto, setCadastroRapidoAberto] = useState(false);
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
  // "Carimbo" operacional: seleciona uma tarefa e aplica com cliques sucessivos na grade.
  const [tarefaRapidaId, setTarefaRapidaId] = useState<string | null>(null);
  const [estadoSalvamento, setEstadoSalvamento] =
    useState<EstadoSalvamentoAgenda>("pronto");
  const [salvoEm, setSalvoEm] = useState<string>();
  const [acaoDesfazer, setAcaoDesfazer] = useState<AcaoDesfazer | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  const [denso, setDenso] = useState(false); // grade compacta (vê o dia todo com menos rolagem)
  const [modoFoco, setModoFoco] = useState(false);
  const [contextoCarregado, setContextoCarregado] = useState(false);
  const [contextoRetomado, setContextoRetomado] = useState(false);
  const gravacoesPendentes = useRef(0);
  const algumaGravacaoFalhou = useRef(false);
  const [atalhoInicial, setAtalhoInicial] = useState<{
    sede?: string;
    funcionario?: string;
    tarefa?: string;
  } | null>(null);

  // Retoma somente a sessão atual do navegador: evita misturar contexto entre
  // usuários diferentes em computadores compartilhados.
  useEffect(() => {
    let ocultarAviso: ReturnType<typeof setTimeout> | undefined;
    try {
      const contexto = lerContextoAgenda(
        sessionStorage.getItem(CHAVE_CONTEXTO_AGENDA),
      );
      if (!contexto) {
        sessionStorage.removeItem(CHAVE_CONTEXTO_AGENDA);
        return;
      }
      if (typeof contexto.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(contexto.data))
        setData(contexto.data);
      if (typeof contexto.turno === "string") setTurno(contexto.turno);
      if (contexto.modo === "dia" || contexto.modo === "semana") setModo(contexto.modo);
      if (typeof contexto.busca_funcionario === "string")
        setBuscaFuncionario(contexto.busca_funcionario);
      if (typeof contexto.pagina_funcionario === "number")
        setPaginaFunc(Math.max(0, Math.floor(contexto.pagina_funcionario)));
      if (
        typeof contexto.funcionario_selecionado === "string" ||
        contexto.funcionario_selecionado === null
      )
        setSelecionado(contexto.funcionario_selecionado);
      if (typeof contexto.tarefa_rapida_id === "string" || contexto.tarefa_rapida_id === null)
        setTarefaRapidaId(contexto.tarefa_rapida_id);
      if (typeof contexto.grade_densa === "boolean") setDenso(contexto.grade_densa);
      if (typeof contexto.modo_foco === "boolean") setModoFoco(contexto.modo_foco);
      setContextoRetomado(true);
      ocultarAviso = setTimeout(() => setContextoRetomado(false), 6000);
    } catch {
      sessionStorage.removeItem(CHAVE_CONTEXTO_AGENDA);
    } finally {
      setContextoCarregado(true);
    }
    return () => {
      if (ocultarAviso) clearTimeout(ocultarAviso);
    };
  }, []);

  // A busca global pode abrir a agenda já na sede e no contexto procurado.
  // O alvo fica em ref até os dados da sede terminarem de carregar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const funcionario = params.get("funcionario") ?? undefined;
    const tarefa = params.get("tarefa") ?? undefined;
    const sede = params.get("sede");
    if (!funcionario && !tarefa && !sede) return;
    setAtalhoInicial({ sede: sede ?? undefined, funcionario, tarefa });
    if (sede) setSedeEscolhida(sede);
    setModo("dia");
    params.delete("funcionario");
    params.delete("tarefa");
    params.delete("sede");
    const restante = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${restante ? `?${restante}` : ""}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    const abrirContextoDaBusca = (evento: Event) => {
      const detalhe = (evento as CustomEvent<{
        sede?: string;
        funcionario?: string;
        tarefa?: string;
      }>).detail;
      if (!detalhe) return;
      setAtalhoInicial(detalhe);
      if (detalhe.sede) setSedeEscolhida(detalhe.sede);
      setModo("dia");
    };
    window.addEventListener("orkestria:abrir-agenda", abrirContextoDaBusca);
    return () => window.removeEventListener("orkestria:abrir-agenda", abrirContextoDaBusca);
  }, []);

  useEffect(() => {
    if (!contextoCarregado) return;
    const contexto: ContextoAgendaPersistido = {
      salvo_em: Date.now(),
      data,
      turno,
      modo,
      busca_funcionario: buscaFuncionario,
      pagina_funcionario: paginaFunc,
      funcionario_selecionado: selecionado,
      tarefa_rapida_id: tarefaRapidaId,
      grade_densa: denso,
      modo_foco: modoFoco,
    };
    sessionStorage.setItem(CHAVE_CONTEXTO_AGENDA, JSON.stringify(contexto));
  }, [
    contextoCarregado,
    data,
    turno,
    modo,
    buscaFuncionario,
    paginaFunc,
    selecionado,
    tarefaRapidaId,
    denso,
    modoFoco,
  ]);

  useEffect(() => {
    document.body.classList.toggle("modo-foco-agenda", modoFoco);
    return () => document.body.classList.remove("modo-foco-agenda");
  }, [modoFoco]);

  const {
    sedes,
    sedeId,
    funcionarios,
    tarefas,
    mutateTarefas,
    locais,
    mutateLocais,
    categorias,
    periodosLetivos,
    temposPessoais,
    requisitos,
    qualificacoes,
    parametros,
    rotinas,
    mutateRotinas,
    historico,
    mutateModelos,
    temRotaPadrao,
    datasSemana,
    rotinasSemana,
    ausenciasSemana,
    ausentesMap,
    fonteRepetir,
    nFaltas,
    faltamRegistrar,
  } = useRotinaData(sedeEscolhida, data, modo);

  const params = parametros ?? PARAMETROS_PADRAO;
  const blocoMin = params.bloco_agenda_min || 30;

  const tarefaRapida = tarefaRapidaId
    ? (tarefas ?? []).find((t) => t.id === tarefaRapidaId)
    : undefined;

  useEffect(() => {
    if (!tarefaRapidaId && !modoFoco) return;
    const cancelarComEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tarefaRapidaId) setTarefaRapidaId(null);
      else setModoFoco(false);
    };
    window.addEventListener("keydown", cancelarComEsc);
    return () => window.removeEventListener("keydown", cancelarComEsc);
  }, [tarefaRapidaId, modoFoco]);

  function iniciarSalvamento() {
    if (gravacoesPendentes.current === 0) algumaGravacaoFalhou.current = false;
    gravacoesPendentes.current += 1;
    setEstadoSalvamento("salvando");
  }

  function finalizarSalvamento(sucesso: boolean) {
    if (!sucesso) algumaGravacaoFalhou.current = true;
    gravacoesPendentes.current = Math.max(0, gravacoesPendentes.current - 1);
    if (gravacoesPendentes.current > 0) return;
    if (algumaGravacaoFalhou.current) {
      setEstadoSalvamento("erro");
      return;
    }
    setSalvoEm(
      new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    );
    setEstadoSalvamento("salvo");
  }

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

  useEffect(() => {
    const atalho = atalhoInicial;
    if (!atalho) return;
    if (!atalho.funcionario && !atalho.tarefa) {
      setAtalhoInicial(null);
      return;
    }
    const restante = { ...atalho };

    if (atalho.funcionario) {
      const funcionario = (funcionarios ?? []).find((item) => item.id === atalho.funcionario);
      if (funcionario) {
        setTurno("");
        setBuscaFuncionario(funcionario.nome);
        setSelecionado(funcionario.id);
        setTarefaRapidaId(null);
        setPaginaFunc(0);
        delete restante.funcionario;
      }
    }

    if (atalho.tarefa) {
      const tarefa = (tarefas ?? []).find((item) => item.id === atalho.tarefa);
      if (tarefa) {
        setTurno("");
        setBuscaFuncionario("");
        setTarefaRapidaId(tarefa.id);
        delete restante.tarefa;
      }
    }

    if (restante.funcionario === atalho.funcionario && restante.tarefa === atalho.tarefa) return;
    setAtalhoInicial(restante.funcionario || restante.tarefa ? restante : null);
  }, [atalhoInicial, funcionarios, tarefas]);

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

  const sugestaoRapida = useMemo(() => {
    if (!tarefaRapida) return null;
    return sugerirAlocacao({
      tarefa: tarefaRapida,
      local: (locais ?? []).find((l) => l.id === tarefaRapida.local_id),
      funcionarios: efetivosVisiveis,
      rotinas: rotinas ?? [],
      parametros: params,
      blocoMin,
      data,
      temposPersonalizados: temposPessoais ?? [],
      requisitos: requisitos ?? [],
      qualificacoes: qualificacoes ?? [],
      ausentes: ausentesMap,
    });
  }, [
    tarefaRapida,
    locais,
    efetivosVisiveis,
    rotinas,
    params,
    blocoMin,
    data,
    temposPessoais,
    requisitos,
    qualificacoes,
    ausentesMap,
  ]);
  const funcionarioSugerido = sugestaoRapida
    ? efetivosVisiveis.find((f) => f.id === sugestaoRapida.funcionario_id)
    : undefined;

  useEffect(() => {
    if (!sugestaoRapida) return;
    setSelecionado(sugestaoRapida.funcionario_id);
    const idx = funcionariosVisiveis.findIndex(
      (f) => f.id === sugestaoRapida.funcionario_id,
    );
    if (idx >= 0) setPaginaFunc(Math.floor(idx / FUNC_POR_PAGINA));
  }, [sugestaoRapida, funcionariosVisiveis]);

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
    iniciarSalvamento();
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
      const criada = real as RotinaPlanejada | null;
      if (criada) {
        setAcaoDesfazer({
          rotulo: "adição da tarefa",
          executar: async () => {
            await apiDelete(`/api/rotinas/${criada.id}`);
          },
        });
      }
      finalizarSalvamento(true);
    } catch (err) {
      finalizarSalvamento(false);
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
    iniciarSalvamento();
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
      setAcaoDesfazer({
        rotulo: "movimentação da tarefa",
        executar: async () => {
          await apiPut(`/api/rotinas/${rotina.id}`, {
            funcionario_id: rotina.funcionario_id,
            inicio_planejado: rotina.inicio_planejado,
          });
        },
      });
      finalizarSalvamento(true);
    } catch (err) {
      finalizarSalvamento(false);
      mostrarErro(err);
    }
  }

  /** Redimensionamento pela alça do card; conflitos podem ser autorizados. */
  async function redimensionar(rotinaId: string, novoTempoMin: number) {
    const rotinaAnterior = (rotinas ?? []).find((r) => r.id === rotinaId);
    if (!rotinaAnterior || rotinaAnterior.tempo_previsto_min === novoTempoMin) return;
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
    const registrarDesfazer = () =>
      setAcaoDesfazer({
        rotulo: "alteração da duração",
        executar: async () => {
          await apiPut(`/api/rotinas/${rotinaId}`, {
            tempo_previsto_min: rotinaAnterior.tempo_previsto_min,
          });
        },
      });
    iniciarSalvamento();
    try {
      await aplicar(false);
      registrarDesfazer();
      finalizarSalvamento(true);
    } catch (err) {
      if (err instanceof ErroApi && (await pedirAutorizacao(err.alertas))) {
        try {
          await aplicar(true);
          registrarDesfazer();
          finalizarSalvamento(true);
        } catch (err2) {
          finalizarSalvamento(false);
          mostrarErro(err2);
        }
        return;
      }
      finalizarSalvamento(false);
      mostrarErro(err);
    }
  }

  async function remover(rotinaId: string) {
    const rotinaRemovida = (rotinas ?? []).find((r) => r.id === rotinaId);
    if (!rotinaRemovida) return;
    iniciarSalvamento();
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
      setAcaoDesfazer({
        rotulo: "remoção da tarefa",
        executar: async () => {
          await apiPost("/api/rotinas", {
            data: rotinaRemovida.data,
            funcionario_id: rotinaRemovida.funcionario_id,
            tarefa_id: rotinaRemovida.tarefa_id,
            inicio_planejado: rotinaRemovida.inicio_planejado,
            duracao_min: rotinaRemovida.tempo_previsto_min,
          });
        },
      });
      finalizarSalvamento(true);
    } catch (err) {
      finalizarSalvamento(false);
      mostrarErro(err);
    }
  }

  async function desfazerUltimaAcao() {
    const acao = acaoDesfazer;
    if (!acao || desfazendo) return;
    setDesfazendo(true);
    iniciarSalvamento();
    try {
      await acao.executar();
      await mutateRotinas();
      setAcaoDesfazer(null);
      setAlertas([
        {
          nivel: "alerta",
          codigo: "DESFAZER",
          mensagem: `A ${acao.rotulo} foi desfeita.`,
        },
      ]);
      finalizarSalvamento(true);
    } catch (err) {
      finalizarSalvamento(false);
      mostrarErro(err);
    } finally {
      setDesfazendo(false);
    }
  }

  useEffect(() => {
    const executarAtalho = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.defaultPrevented) return;
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName ?? "";
      const campoDeEdicao =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!alvo?.isContentEditable;
      const elementoInterativo = campoDeEdicao || tag === "BUTTON" || tag === "A";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !campoDeEdicao) {
        if (!acaoDesfazer || desfazendo || estadoSalvamento === "salvando") return;
        e.preventDefault();
        void desfazerUltimaAcao();
        return;
      }

      if (
        e.key === "Enter" &&
        !elementoInterativo &&
        sugestaoRapida &&
        tarefaRapida &&
        estadoSalvamento !== "salvando"
      ) {
        e.preventDefault();
        void soltarNova(
          tarefaRapida.id,
          sugestaoRapida.funcionario_id,
          sugestaoRapida.inicio,
        );
      }
    };
    window.addEventListener("keydown", executarAtalho);
    return () => window.removeEventListener("keydown", executarAtalho);
    // As funções operacionais fecham sobre o cache atual; os estados abaixo
    // renovam o listener somente quando a ação disponível realmente muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acaoDesfazer, desfazendo, estadoSalvamento, sugestaoRapida, tarefaRapida]);

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

  const temRotinas = (rotinas?.length ?? 0) > 0;

  return (
    <div>
      <FiltersBar
        data={data}
        sedeId={sedeId}
        turno={turno}
        sedes={sedes ?? []}
        aoMudarData={(novaData) => {
          setData(novaData);
          setTarefaRapidaId(null);
          setAcaoDesfazer(null);
          setEstadoSalvamento("pronto");
        }}
        aoMudarSede={(v) => {
          setSedeEscolhida(v);
          setSelecionado(null);
          setTarefaRapidaId(null);
          setAcaoDesfazer(null);
          setEstadoSalvamento("pronto");
          setBuscaFuncionario("");
          setPaginaFunc(0);
        }}
        modo={modo}
        busca={buscaFuncionario}
        contextoRetomado={contextoRetomado}
        modoFoco={modoFoco}
        aoMudarModo={(novoModo) => {
          setModo(novoModo);
          if (novoModo === "semana") setTarefaRapidaId(null);
        }}
        aoMudarTurno={(v) => {
          setTurno(v);
          setPaginaFunc(0);
        }}
        aoMudarBusca={(v) => {
          setBuscaFuncionario(v);
          setPaginaFunc(0);
        }}
        aoAlternarFoco={() => setModoFoco((atual) => !atual)}
        aoDuplicar={() => setPlanejamentoAberto(true)}
      />

      {modo === "dia" ? (
        <BarraPassosDoDia
          sedeId={sedeId}
          data={data}
          temRotaPadrao={temRotaPadrao}
          temRotinas={temRotinas}
          fonteRepetir={fonteRepetir}
          nFaltas={nFaltas}
          faltamRegistrar={faltamRegistrar}
          denso={denso}
          gerando={gerando}
          salvandoPadrao={salvandoPadrao}
          repetindo={repetindo}
          aoGerarDia={gerarDia}
          aoSalvarRotaPadrao={salvarRotaPadrao}
          aoRepetirDiaAnterior={repetirDiaAnterior}
          aoAlternarDenso={() => setDenso((v) => !v)}
        />
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
          {!temRotinas && temRotaPadrao && (
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

          {!temRotinas && !temRotaPadrao && fonteRepetir && (
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
            aoAlocarTarefa={(tarefaId) => setTarefaRapidaId(tarefaId)}
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

          <BarraAcaoRapida
            tarefaNome={tarefaRapida?.nome_tarefa}
            sugestao={
              sugestaoRapida && funcionarioSugerido
                ? `${funcionarioSugerido.nome} · ${sugestaoRapida.inicio}`
                : undefined
            }
            estado={estadoSalvamento}
            salvoEm={salvoEm}
            podeDesfazer={!!acaoDesfazer}
            desfazendo={desfazendo}
            aoCancelarTarefa={() => setTarefaRapidaId(null)}
            aoAplicarSugestao={
              sugestaoRapida && tarefaRapida
                ? () =>
                    soltarNova(
                      tarefaRapida.id,
                      sugestaoRapida.funcionario_id,
                      sugestaoRapida.inicio,
                    )
                : undefined
            }
            aoDesfazer={desfazerUltimaAcao}
          />

          <div className="linha-rotina">
            <TaskPalette
              tarefas={tarefas ?? []}
              locais={locais ?? []}
              categorias={categorias ?? []}
              blocoMin={blocoMin}
              funcionarios={funcionarios ?? []}
              qualificacoes={qualificacoes ?? []}
              requisitos={requisitos ?? []}
              data={data}
              ausentes={ausentesMap}
              tarefaSelecionadaId={tarefaRapidaId}
              aoSelecionarTarefa={(id) =>
                setTarefaRapidaId((atual) => (atual === id ? null : id))
              }
              podeCriar={sessao.perfil !== "visualizador" && Boolean(sedeId)}
              aoCriarTarefa={() => setCadastroRapidoAberto(true)}
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
              tarefaSelecionadaId={tarefaRapidaId}
              sugestaoAlocacao={sugestaoRapida}
              aoSelecionarFuncionario={selecionarFuncionario}
              aoSoltarNova={soltarNova}
              aoMover={mover}
              aoRemover={remover}
              aoRedimensionar={redimensionar}
              blocosArrasto={blocosArrasto}
              aoIniciarArrasto={setBlocosArrasto}
              aoTerminarArrasto={() => setBlocosArrasto(null)}
              alturaBloco={Math.round(blocoMin * (denso ? 1.4 : 2.4))}
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

      <CadastroRapidoAgenda
        aberto={cadastroRapidoAberto}
        sedeId={sedeId}
        locais={locais ?? []}
        categorias={categorias ?? []}
        aoFechar={() => setCadastroRapidoAberto(false)}
        aoLocalCriado={async () => {
          await mutateLocais();
        }}
        aoTarefaCriada={async (tarefa) => {
          await mutateTarefas();
          setTarefaRapidaId(tarefa.id);
          setModo("dia");
        }}
      />

      <AlertPanel
        alertas={alertas}
        aoLimpar={() => setAlertas([])}
        aoDispensar={(i) => setAlertas((prev) => prev.filter((_, idx) => idx !== i))}
      />

      <ModaisRotina
        confirmacao={confirmacao}
        aoResponderConfirmacao={responderConfirmacao}
        duracaoPrompt={duracaoPrompt}
        duracaoInput={duracaoInput}
        aoMudarDuracaoInput={setDuracaoInput}
        aoResponderDuracao={responderDuracao}
      />

      {(repetindo || gerando || salvandoPadrao) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(34,49,39,0.32)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="painel" style={{ background: "var(--cartao)", padding: 12 }}>
            <Carregando
              texto={
                repetindo
                  ? "Repetindo o dia anterior…"
                  : gerando
                    ? "Gerando o dia da rota padrão…"
                    : "Salvando a rota padrão…"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
