/**
 * Regras de cálculo centrais do sistema.
 *
 * Todas as funções são puras: recebem entidades e parâmetros resolvidos e
 * devolvem números/objetos. Nenhuma depende da fonte de dados — valem
 * igualmente para Google Sheets hoje e Firebase Firestore no futuro.
 */
import type {
  Ausencia,
  ClassificacaoOcupacao,
  Feriado,
  Funcionario,
  Local,
  ParametrosResolvidos,
  PeriodoLetivo,
  Prioridade,
  RotinaPlanejada,
  ServicoEventual,
  StatusRotina,
  Tarefa,
  TipoLocal,
  TipoServico,
} from "@/types";
import { diaDaSemana, hhmmParaMin, parseDiasSemana } from "./dateUtils";
import { sincronizarTrio } from "./intervalos";

/**
 * Situação de uma sede no calendário acadêmico em uma data:
 *  - "sem_calendario" → a sede não tem nenhum período letivo ativo cadastrado;
 *  - "dentro"         → a data cai dentro de um período letivo (dia com aula);
 *  - "fora"           → há calendário, mas a data está em férias/recesso.
 * Tarefas com `depende_calendario` só são exigidas quando "dentro".
 */
export type StatusPeriodoLetivo = "sem_calendario" | "dentro" | "fora";

export function statusPeriodoLetivo(
  periodos: PeriodoLetivo[],
  sedeId: string,
  dataISO: string,
): StatusPeriodoLetivo {
  const daSede = periodos.filter((p) => p.ativo && p.sede_id === sedeId);
  if (daSede.length === 0) return "sem_calendario";
  const dow = diaDaSemana(dataISO);
  const dentro = daSede.some((p) => {
    if (!(p.data_inicio <= dataISO && dataISO <= p.data_fim)) return false;
    const dias = parseDiasSemana(p.dias_semana);
    return dias.length === 0 || dias.includes(dow);
  });
  return dentro ? "dentro" : "fora";
}

/**
 * O dia está fechado por feriado/recesso? Devolve o registro que fecha, ou `null`.
 *
 * Registro com `sede_id` vazio vale para **todas** as sedes — é como se cadastra
 * feriado nacional, estadual e municipal uma única vez (as 18 sedes são em
 * Fortaleza). Com `sede_id` preenchido, fecha só aquela.
 *
 * Não confundir com período letivo: aquele responde "esta tarefa que depende do
 * calendário é exigida hoje?"; este responde "existe operação hoje?".
 */
export function feriadoDoDia(
  feriados: Feriado[],
  sedeId: string | undefined,
  dataISO: string,
): Feriado | null {
  return (
    feriados.find(
      (f) =>
        f.ativo &&
        (!f.sede_id || f.sede_id === sedeId) &&
        f.data_inicio <= dataISO &&
        dataISO <= f.data_fim,
    ) ?? null
  );
}

/**
 * Fator sugerido pelo TIPO DE USO do local — "o local guia o nível de limpeza"
 * (decisão da ata de 17/07/2026). Só vale como padrão: um fator digitado no
 * cadastro sempre vence. Segue a orientação já publicada na tela de Locais
 * (banheiros e copas densos · áreas abertas leves · o resto normal); corredor,
 * escada e demais ficam em 1,0 até a operação calibrar.
 */
export const FATOR_POR_TIPO_LOCAL: Record<TipoLocal, number> = {
  banheiro: 1.5,
  copa: 1.5,
  area_externa: 0.8,
  sala: 1,
  // Consultório entra em 1,0 de propósito: são **41 dos 110 locais** da produção
  // (a CESIU inteira), todos hoje em "outros", que também vale 1,0. Assim
  // classificar não muda nenhum tempo calculado — só passa a nomear o que é.
  // Calibrar para cima é decisão da operação, com o fator por local ou aqui.
  consultorio: 1,
  corredor: 1,
  area_comum: 1,
  escada: 1,
  recepcao: 1,
  auditorio: 1,
  almoxarifado: 1,
  outros: 1,
};

/**
 * Categoria do trabalho que a equipe de serviços gerais faz PARA OUTRO SETOR —
 * plantão com crianças, apoio à cantina, portaria, eventos (reunião de
 * coordenadores, 19/10/2026: "quanto da nossa mão de obra vai para fora da
 * infra"). Id fixo para o sistema reconhecer; nome e cor se editam no catálogo.
 * Café NÃO entra (decisão do dono: "café é sagrado").
 */
export const CATEGORIA_APOIO_OUTRO_SETOR = "apoio_outro_setor";

/**
 * Apoio ao setor pedagógico (acompanhar e receber alunos, auxiliar a professora,
 * apoio no intervalo) — categoria própria desde 23/10/2026, que "segue a mesma
 * linha" do apoio a outro setor sem se fundir com ela (decisão do dono): entra
 * no total de apoio e aparece à parte.
 */
export const CATEGORIA_APOIO_PEDAGOGICO = "apoio_pedagogico";

/**
 * Quanto do tempo planejado vai para apoio a outro setor, em %. `null` sem nada
 * planejado — porcentagem de nada não é 0%.
 */
export function percentualApoioOutroSetor(
  rotinas: Pick<RotinaPlanejada, "tarefa_id" | "status" | "tempo_previsto_min">[],
  tarefasDeApoio: ReadonlySet<string>,
  /** O serviço eventual na conta: o apoio inteiro, e no total só o que não tinha tarefa. */
  eventuais: { apoioMin: number; foraDasTarefasMin: number } = { apoioMin: 0, foraDasTarefasMin: 0 },
): number | null {
  let total = eventuais.foraDasTarefasMin;
  let apoio = eventuais.apoioMin;
  for (const r of rotinas) {
    if (!ocupaHorario(r)) continue;
    total += r.tempo_previsto_min || 0;
    if (tarefasDeApoio.has(r.tarefa_id)) apoio += r.tempo_previsto_min || 0;
  }
  return total > 0 ? Math.round((Math.min(apoio, total) / total) * 1000) / 10 : null;
}

type EventualNaConta = Pick<ServicoEventual, "funcionario_id" | "data" | "inicio" | "fim" | "tempo_min"> & { sede_id?: string };

/** Hora de relógio. "24:00" e "09:75" não são: `hhmmParaMin` faria a conta assim mesmo. */
export function horaValida(hora: unknown): hora is string {
  return typeof hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/u.test(hora);
}

/** Com início e fim válidos, vale o horário; o tempo digitado é só para quando não há. */
function janelaDoEventual(e: Pick<ServicoEventual, "inicio" | "fim">): [number, number] | null {
  if (!horaValida(e.inicio) || !horaValida(e.fim)) return null;
  const ini = hhmmParaMin(e.inicio);
  const fim = hhmmParaMin(e.fim);
  return fim > ini ? [ini, fim] : null;
}

/**
 * Sem os eventuais de quem estava ausente no dia. Vale nas telas todas: a célula da
 * Semana diz "Falta", e 1 h nesse dia criava um dia na conta do Painel (93% × 52%).
 */
export function semAusentes<E extends Pick<ServicoEventual, "funcionario_id" | "data">>(
  eventuais: E[],
  ausencias: Pick<Ausencia, "funcionario_id" | "data_inicio" | "data_fim">[],
): E[] {
  return eventuais.filter(
    (e) => !ausencias.some((a) => a.funcionario_id === e.funcionario_id && a.data_inicio <= e.data && e.data <= a.data_fim),
  );
}

/**
 * Folga ou feriado: a pessoa não tinha jornada a cumprir no dia. Sem bloco, o eventual
 * mostra só as horas: dizer "Subutilizado, 12%" e "7 h de ociosidade" sobre 1 h feita
 * num sábado é inventar uma cobrança (auditoria, 04/11/2026).
 */
export function diaSemJornada(f: Funcionario, dataISO: string, feriados: Feriado[]): boolean {
  return !jornadaDoDia(f, dataISO).trabalha || !!feriadoDoDia(feriados, f.sede_id, dataISO);
}

/**
 * Teto de um lançamento: um dia inteiro. Sem isto, um erro de digitação (ou quem é
 * medido) levava o resumo do Chromos a 20.845% de ocupação (revisão de segurança).
 */
export const MAX_MINUTOS_EVENTUAL = 1440;

export function minutosDoEventual(e: Pick<ServicoEventual, "inicio" | "fim" | "tempo_min">): number {
  const janela = janelaDoEventual(e);
  return janela ? janela[1] - janela[0] : Math.min(MAX_MINUTOS_EVENTUAL, Math.max(0, Number(e.tempo_min) || 0));
}

/**
 * O serviço eventual como tempo da pessoa (pedido da coordenação, 04/11/2026: ele
 * fica "no limbo", à disposição do pedagógico, e o mostrador não sabe). Devolve, um
 * por eventual, os minutos que ela **não tinha com tarefa**, no formato que
 * `ocupacaoPorPessoa` já lê.
 *
 * ⚠️ Somar o `tempo_min` direto contaria em dobro: em produção, 810 de 2.860 minutos
 * caíam em horário que já tinha bloco. E o horário manda sobre o tempo digitado: o
 * formulário nasce com tempo 0 e não confere um com o outro, então um eventual de
 * 95 min sumia, e outro de 1 h com tempo 120 dava sobrecarga (auditoria, 04/11/2026).
 * Sem início e fim, entra o tempo digitado. Sem pessoa, não é ocupação de ninguém.
 *
 * `so_tempo`: num dia sem bloco, o eventual só cria dia na conta se a escala mandar
 * trabalhar e não for feriado (decisão do dono, 04/11/2026). Em folga, contar somava a
 * jornada inteira: 1 h no sábado de quem é de segunda a sexta derrubava uma semana cheia para 85%. E
 * tirar todo dia sem bloco também erra: 3 dias cheios + 2 só no detector davam 167%.
 */
export function eventuaisForaDasTarefas(
  rotinas: Pick<RotinaPlanejada, "funcionario_id" | "data" | "status" | "inicio_planejado" | "fim_planejado">[],
  eventuais: EventualNaConta[],
): { funcionario_id: string; sede_id?: string; data: string; status: StatusRotina; tempo_previsto_min: number; so_tempo: true }[] {
  const sobra: { funcionario_id: string; sede_id?: string; data: string; status: StatusRotina; tempo_previsto_min: number; so_tempo: true }[] = [];
  const ocupadoPorDia = new Map<string, [number, number][]>();
  const somadoPorDia = new Map<string, number>();
  for (const r of rotinas) {
    if (!ocupaHorario(r)) continue;
    const chave = `${r.funcionario_id}|${r.data}`;
    if (!ocupadoPorDia.has(chave)) ocupadoPorDia.set(chave, []);
    ocupadoPorDia.get(chave)!.push([hhmmParaMin(r.inicio_planejado), hhmmParaMin(r.fim_planejado)]);
  }
  for (const e of eventuais) {
    if (!e.funcionario_id) continue;
    const chave = `${e.funcionario_id}|${e.data}`;
    const ocupado = ocupadoPorDia.get(chave) ?? [];
    const janela = janelaDoEventual(e);
    let minutos = minutosDoEventual(e);
    if (janela) {
      // Minuto a minuto: blocos e eventuais do dia podem se sobrepor entre si.
      for (let m = janela[0]; m < janela[1]; m++) if (ocupado.some(([a, b]) => a <= m && m < b)) minutos--;
      ocupado.push(janela);
      ocupadoPorDia.set(chave, ocupado);
    }
    // O teto vale por pessoa e dia: sem horário, vários lançamentos somariam sem limite.
    minutos = Math.min(minutos, MAX_MINUTOS_EVENTUAL - (somadoPorDia.get(chave) ?? 0));
    somadoPorDia.set(chave, (somadoPorDia.get(chave) ?? 0) + Math.max(0, minutos));
    if (minutos > 0) sobra.push({ funcionario_id: e.funcionario_id, sede_id: e.sede_id, data: e.data, status: "planejada", tempo_previsto_min: minutos, so_tempo: true });
  }
  return sobra;
}

/** O que os eventuais somam no indicador de apoio do Painel. */
export function eventuaisNoApoio(
  rotinas: Parameters<typeof eventuaisForaDasTarefas>[0],
  eventuais: (EventualNaConta & Pick<ServicoEventual, "categoria_id">)[],
  categorias: readonly string[],
): { apoioMin: number; foraDasTarefasMin: number } {
  const soma = (lista: { tempo_previsto_min: number }[]) => lista.reduce((s, x) => s + x.tempo_previsto_min, 0);
  return {
    // Sem blocos na conta: no apoio entra o tempo inteiro, mesmo sobre tarefa, mas o
    // mesmo horário lançado duas vezes e o teto do dia valem igual.
    apoioMin: soma(eventuaisForaDasTarefas([], eventuais.filter((e) => categorias.includes(e.categoria_id ?? "")))),
    foraDasTarefasMin: soma(eventuaisForaDasTarefas(rotinas, eventuais)),
  };
}

/**
 * A cobertura desta tarefa depende de QUANDO ela foi planejada pela última vez?
 * Só a periódica sem dia fixo (semanal sem dia marcado, quinzenal, mensal): o
 * painel "Ficou de fora hoje" cobra pelo intervalo desde a última vez. Diária e
 * semanal de dia fixo se decidem pelo dia de hoje — não precisam de histórico.
 */
export function coberturaPorHistorico(t: Pick<Tarefa, "frequencia" | "dias_semana">): boolean {
  if (t.frequencia === "semanal") return parseDiasSemana(t.dias_semana).length === 0;
  return t.frequencia === "quinzenal" || t.frequencia === "mensal";
}

/**
 * Bloco que ainda ocupa o horário e a jornada da pessoa. Cancelado e
 * **remanejado** liberam: remanejado é o que ela deixou de fazer para fazer
 * outra coisa — a troca por prioridade da Central cede o bloco assim
 * (19/10/2026). Antes só o cancelado liberava, e a pessoa que cedia aparecia
 * fazendo as duas tarefas no mesmo horário.
 */
export function ocupaHorario(r: { status?: StatusRotina }): boolean {
  return r.status !== "cancelada" && r.status !== "remanejada";
}

/**
 * O dia sem as exceções do "Feita por" — quem copia o dia ("Repetir o dia",
 * salvar como modelo ou rota padrão) copia a ROTINA, não a cobertura. A coberta
 * volta ao titular, sem o `titular_id` nem a nota da ausência; a tarefa que o
 * colega cedeu para cobrir (remanejada, inteira dentro da coberta dele) volta a
 * ser planejada. Uma função só para todo caminho de cópia: consertado um por
 * vez, cada volta de auditoria achava o próximo (21–22/10/2026).
 */
export function semCoberturas<
  R extends {
    funcionario_id: string;
    titular_id?: string;
    observacao?: string;
    status?: StatusRotina;
    inicio_planejado: string;
    fim_planejado: string;
  },
>(doDia: R[]): R[] {
  const cobertas = doDia.filter((r) => r.titular_id && ocupaHorario(r));
  const cedidaNumaCobertura = (r: R) =>
    r.status === "remanejada" &&
    cobertas.some(
      (c) =>
        c.funcionario_id === r.funcionario_id &&
        c.inicio_planejado <= r.inicio_planejado &&
        r.fim_planejado <= c.fim_planejado,
    );
  return doDia.map((r) => {
    if (r.titular_id)
      return {
        ...r,
        funcionario_id: r.titular_id,
        titular_id: "",
        observacao: (r.observacao ?? "")
          .split(" · ")
          .filter((p) => !p.startsWith("Coberta por "))
          .join(" · "),
      };
    if (cedidaNumaCobertura(r)) return { ...r, status: "planejada" as StatusRotina };
    return r;
  });
}

/**
 * "Feita por": das tarefas do colega que encostam na faixa coberta, as que ele
 * deixou de fazer — e viram remanejadas. Só a que cabe INTEIRA na faixa e não é
 * crítica: a que só encosta (o bloco de 3h das 06:05) ele fez quase toda, e
 * remanejá-la escondia trabalho da medição (revisão de segurança e decisão do
 * dono, 21/10/2026). A que só encosta fica com ele, sobreposta. Espera não disputa.
 */
export function cedidasNaCobertura<
  R extends { inicio_planejado: string; fim_planejado: string; tarefa_id: string; status?: StatusRotina },
>(coberta: { inicio_planejado: string; fim_planejado: string }, doColega: R[], tarefa: (id: string) => { espera?: boolean; critica?: boolean } | undefined): R[] {
  const ini = hhmmParaMin(coberta.inicio_planejado);
  const fim = hhmmParaMin(coberta.fim_planejado);
  return doColega.filter((r) => {
    const t = tarefa(r.tarefa_id);
    return (
      ocupaHorario(r) &&
      !t?.espera &&
      !t?.critica &&
      hhmmParaMin(r.inicio_planejado) >= ini &&
      hhmmParaMin(r.fim_planejado) <= fim
    );
  });
}

/**
 * Prioridade sugerida pelo TIPO do local, quando a tarefa não diz outra —
 * "derivado por padrão, configurável por exceção", como o fator acima.
 * Banheiro, copa e consultório não esperam; escada, área externa, almoxarifado
 * e auditório podem ficar para amanhã; o resto é média. Sala fica em média de
 * propósito: a mesma palavra cobre a sala de aula e a de judô sem aula hoje —
 * quem distingue é a tarefa (prioridade alta ou baixa no cadastro).
 */
export const PRIORIDADE_POR_TIPO_LOCAL: Record<TipoLocal, Prioridade> = {
  banheiro: "alta",
  copa: "alta",
  consultorio: "alta",
  sala: "media",
  corredor: "media",
  area_comum: "media",
  recepcao: "media",
  outros: "media",
  escada: "baixa",
  area_externa: "baixa",
  almoxarifado: "baixa",
  auditorio: "baixa",
};

const NIVEL_PRIORIDADE: Record<Prioridade, number> = { baixa: 1, media: 2, alta: 3 };
/** Nível da tarefa crítica ("circuito essencial"): acima de alta, e nunca cedida. */
export const NIVEL_CRITICA = 4;

/**
 * Nível efetivo de prioridade (1 baixa · 2 média · 3 alta · 4 crítica).
 *
 * "alta"/"baixa" na tarefa são escolha de alguém e vencem. "media" é o valor
 * que a importação grava em tudo — então vale como "não informado" e cede ao
 * tipo do local. Consequência aceita: uma tarefa de banheiro não fica em média
 * (para rebaixar, marque "baixa").
 */
export function nivelPrioridade(
  tarefa: Pick<Tarefa, "prioridade" | "critica"> | undefined,
  local: Pick<Local, "tipo_local"> | undefined,
): number {
  if (!tarefa) return NIVEL_PRIORIDADE.media;
  if (tarefa.critica) return NIVEL_CRITICA;
  if (tarefa.prioridade === "alta" || tarefa.prioridade === "baixa") return NIVEL_PRIORIDADE[tarefa.prioridade];
  const doTipo = local ? (PRIORIDADE_POR_TIPO_LOCAL as Record<string, Prioridade>)[local.tipo_local] : undefined;
  return NIVEL_PRIORIDADE[doTipo ?? "media"];
}

/** Rótulo do nível, para a tela. */
export function rotuloPrioridade(nivel: number): string {
  return nivel >= NIVEL_CRITICA ? "crítica" : nivel === 3 ? "alta" : nivel === 1 ? "baixa" : "média";
}

/**
 * Fator de intensidade do AMBIENTE (local): o quanto o espaço suja e pesa na
 * limpeza. Presets: leve 0,8 · normal 1,0 · densa 1,5. Migrou da categoria para
 * o local (ata de 16/06/2026).
 *
 * Sem fator informado (ausente/≤0), cai no padrão do TIPO do local — antes caía
 * sempre em 1. Locais que já têm fator gravado não mudam de comportamento.
 */
/**
 * A intensidade efetiva do local, em ordem de prioridade:
 *
 *  1. o fator **digitado no próprio local** — a exceção sempre vence;
 *  2. o fator do **tipo**, vindo do catálogo `tipos_local` (desde 24/08/2026 o
 *     tipo é cadastrável, e quem cria informa o fator);
 *  3. a tabela `FATOR_POR_TIPO_LOCAL`, rede de segurança para os 12 tipos que
 *     eram fixos no código — assim quem calcula sem carregar o catálogo
 *     continua acertando o caso conhecido em vez de cair em 1,0 calado;
 *  4. 1,0.
 */
export function fatorIntensidadeLocal(
  local: Local | undefined,
  fatorDoTipo?: Map<string, number> | ReadonlyMap<string, number>,
): number {
  const f = local?.fator_intensidade;
  if (typeof f === "number" && f > 0) return f;
  if (!local) return 1;
  const doCatalogo = fatorDoTipo?.get(local.tipo_local);
  if (typeof doCatalogo === "number" && doCatalogo > 0) return doCatalogo;
  return (FATOR_POR_TIPO_LOCAL as Record<string, number>)[local.tipo_local] || 1;
}

/**
 * Multiplicadores por natureza do serviço de limpeza. Constantes calibráveis:
 * a 1ª fase usa estes valores; podem virar parâmetro no futuro.
 */
export const FATOR_TIPO_SERVICO: Record<TipoServico, number> = {
  rotina: 1,
  pesada: 1.5,
  desincrustante: 2,
};

/** Fator do tipo de serviço da tarefa (ausente = "rotina" → 1). */
export function fatorServico(tarefa: Pick<Tarefa, "tipo_servico"> | undefined): number {
  return FATOR_TIPO_SERVICO[tarefa?.tipo_servico ?? "rotina"] ?? 1;
}

/**
 * A tarefa cobra desvio previsto × realizado? Tarefas de tempo-referência e de
 * presença/plantão NÃO cobram (a variação é esperada / é tempo de permanência).
 */
export function cobraDesvio(
  tarefa: Pick<Tarefa, "tempo_referencia" | "presenca"> | undefined | null,
): boolean {
  return !(tarefa?.tempo_referencia || tarefa?.presenca);
}

export const PARAMETROS_PADRAO: ParametrosResolvidos = {
  bloco_agenda_min: 15,
  ocupacao_baixa: 60,
  ocupacao_adequada: 85,
  ocupacao_alta: 100,
  desvio_justificativa_percentual: 30,
  min_execucoes_ajuste: 3,
  desvio_ajuste_percentual: 15,
};

/** Mediana de uma lista de números (robusta a execuções atípicas). */
export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

/** jornada_liquida = saida - entrada - intervalo (em minutos). */
/**
 * Intervalos do funcionário (lanches + almoço). Usa o campo `intervalos` (CSV
 * de pares "HH:mm-HH:mm") quando presente; senão cai no intervalo único.
 */
export function intervalosDoFuncionario(
  f: Pick<Funcionario, "intervalos" | "intervalo_inicio" | "intervalo_fim">,
): Array<{ inicio: string; fim: string }> {
  if (f.intervalos && f.intervalos.trim()) {
    return f.intervalos
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((par) => {
        const [inicio, fim] = par.split("-");
        return { inicio: (inicio ?? "").trim(), fim: (fim ?? "").trim() };
      })
      .filter((iv) => iv.inicio && iv.fim);
  }
  if (f.intervalo_inicio && f.intervalo_fim)
    return [{ inicio: f.intervalo_inicio, fim: f.intervalo_fim }];
  return [];
}

/** Total de minutos de intervalo no dia (soma de todos os intervalos). */
export function minutosIntervalo(
  f: Pick<Funcionario, "intervalos" | "intervalo_inicio" | "intervalo_fim" | "intervalo_min">,
): number {
  if (f.intervalos && f.intervalos.trim()) {
    return intervalosDoFuncionario(f).reduce((s, iv) => {
      const a = hhmmParaMin(iv.inicio);
      const b = hhmmParaMin(iv.fim);
      return s + (Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, b - a));
    }, 0);
  }
  return f.intervalo_min || 0;
}

export function jornadaLiquidaMin(
  f: Pick<
    Funcionario,
    "entrada" | "saida" | "intervalo_min" | "intervalos" | "intervalo_inicio" | "intervalo_fim"
  >,
): number {
  const entrada = hhmmParaMin(f.entrada);
  const saida = hhmmParaMin(f.saida);
  if (Number.isNaN(entrada) || Number.isNaN(saida)) return 0;
  return Math.max(0, saida - entrada - minutosIntervalo(f));
}

/** Horário efetivo de um funcionário numa data (trata sábado e folgas). */
export interface JornadaEfetiva {
  entrada: string;
  saida: string;
  intervalo_min: number;
  intervalo_inicio: string;
  intervalo_fim: string;
  intervalos: string;
  trabalha: boolean;
}

export function jornadaDoDia(f: Funcionario, dataISO: string): JornadaEfetiva {
  const dia = new Date(`${dataISO}T12:00:00`).getDay(); // 0=dom … 6=sáb
  const escala = f.escala || "seg_sex";
  const trabalha =
    dia === 0 ? escala === "todos" : dia === 6 ? escala !== "seg_sex" : true;

  // Sábado com horário próprio (ex.: turno de 4h) tem os intervalos PRÓPRIOS,
  // `intervalos_sabado`. Era sempre zero, e o lanche de 15 min do sábado não
  // tinha onde ser registrado (pedido da coordenação, 23/10/2026).
  if (dia === 6 && f.entrada_sabado && f.saida_sabado) {
    const intervalos = (f.intervalos_sabado ?? "").trim();
    const trio = sincronizarTrio({ intervalos });
    return {
      entrada: f.entrada_sabado,
      saida: f.saida_sabado,
      intervalo_min: trio.intervalo_min ?? 0,
      intervalo_inicio: trio.intervalo_inicio ?? "",
      intervalo_fim: trio.intervalo_fim ?? "",
      intervalos,
      trabalha,
    };
  }
  return {
    entrada: f.entrada,
    saida: f.saida,
    intervalo_min: f.intervalo_min,
    intervalo_inicio: f.intervalo_inicio,
    intervalo_fim: f.intervalo_fim,
    intervalos: f.intervalos ?? "",
    trabalha,
  };
}

/** Funcionário com o horário daquela data aplicado (para agenda/validação). */
export function funcionarioNoDia(f: Funcionario, dataISO: string): Funcionario {
  return { ...f, ...jornadaDoDia(f, dataISO) };
}

/** Carga horária semanal líquida (soma dos dias trabalhados). */
export function cargaSemanalMin(f: Funcionario): number {
  // 2026-06-15 é segunda; varremos uma semana inteira.
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const ef = jornadaDoDia(f, `2026-06-${15 + i}`);
    if (ef.trabalha) total += jornadaLiquidaMin(ef);
  }
  return total;
}

/**
 * Multiplicador aplicado ao tempo base da tarefa:
 *  - intensidade do AMBIENTE (local) — leve 0,8 · normal 1,0 · densa 1,5 — só
 *    incide em regras dimensionadas pela área/quantidade (`por_m2`,
 *    `por_unidade`), onde o quanto o ambiente "suja" escala o esforço. Em
 *    tarefas de tempo fixo/manual (café, recolhimento, reposição) o tempo já é
 *    explícito e a intensidade NÃO se aplica (evita inflar atividades que não
 *    dependem da metragem);
 *  - natureza do SERVIÇO (rotina 1,0 · pesada 1,5 · desincrustante 2,0) incide
 *    em todas as regras (a forma de limpar pesa mesmo num tempo fixo, ex.: vidros
 *    desincrustantes).
 */
export function multiplicadorTempo(
  tarefa: Tarefa,
  local: Local | undefined,
  fatorDoTipo?: ReadonlyMap<string, number>,
): number {
  const escalaPelaArea =
    tarefa.regra_calculo === "por_m2" || tarefa.regra_calculo === "por_unidade";
  const intensidade = escalaPelaArea ? fatorIntensidadeLocal(local, fatorDoTipo) : 1;
  return intensidade * fatorServico(tarefa);
}

/**
 * Tempo previsto da tarefa segundo sua regra de cálculo:
 *  - fixo/manual → tempo_base_min
 *  - por_m2      → tempo_base_min × metragem do local (base 1 m² ≈ 1 min)
 *  - por_unidade → tempo_base_min × quantidade
 *
 * O resultado é multiplicado por `multiplicadorTempo` (intensidade do ambiente,
 * só em por_m2/por_unidade, × natureza do serviço, sempre).
 * Fórmula da 1ª fase: m² × tipo de ambiente × tipo de serviço.
 */
export function tempoPrevistoMin(
  tarefa: Tarefa,
  local: Local | undefined,
  fatorDoTipo?: ReadonlyMap<string, number>,
): number {
  let base: number;
  switch (tarefa.regra_calculo) {
    case "por_m2":
      base = tarefa.tempo_base_min * (local?.metragem ?? 0);
      break;
    case "por_unidade":
      base = tarefa.tempo_base_min * (tarefa.quantidade || 1);
      break;
    case "fixo":
    case "manual":
    default:
      base = tarefa.tempo_base_min;
  }
  return Math.round(base * multiplicadorTempo(tarefa, local, fatorDoTipo));
}

/** blocos = teto(tempo_previsto / bloco). 80min em blocos de 30 → 3 blocos. */
export function blocosOcupados(tempoPrevistoMin: number, blocoMin: number): number {
  if (blocoMin <= 0) return 0;
  return Math.max(1, Math.ceil(tempoPrevistoMin / blocoMin));
}

/** Tempo visual da agenda = blocos × tamanho do bloco (80min → 90min). */
export function tempoVisualMin(tempoPrevistoMin: number, blocoMin: number): number {
  return blocosOcupados(tempoPrevistoMin, blocoMin) * blocoMin;
}

/**
 * Fim planejado de um bloco: início + tempo previsto **real**.
 *
 * Nunca `tempoVisualMin`. Se o fim vier do visual, uma tarefa de 10 min numa
 * grade de 30 **reserva os 30** — e aí duas tarefas curtas no mesmo bloco viram
 * "sobreposição". Foi o bug que o dono do produto pegou olhando a CESIU: *"o
 * sistema tinha que aceitar mais de 1 tarefa por bloco"*.
 *
 * Existe como função, e não como soma solta, porque **cliente e servidor
 * precisam responder igual**. Da primeira vez consertei só o servidor: a gravação
 * ficou certa e a validação imediata do cliente continuou recusando o arrasto
 * antes mesmo de chamar a API. `tempo_visual_min` e `blocos_ocupados` seguem
 * existindo — só para desenhar.
 */
export function fimPlanejadoMin(inicioMin: number, tempoPrevistoMin: number): number {
  return inicioMin + Math.max(0, Math.round(tempoPrevistoMin));
}

/** Soma dos tempos previstos reais das rotinas (não o tempo visual). */
export function tempoPlanejadoMin(rotinas: RotinaPlanejada[]): number {
  return rotinas
    .filter(ocupaHorario)
    .reduce((soma, r) => soma + (r.tempo_previsto_min || 0), 0);
}

export function ociosidadePrevistaMin(
  jornadaLiquida: number,
  tempoPlanejado: number,
): number {
  return jornadaLiquida - tempoPlanejado;
}

/** Ocupação em % (0–100+). Jornada zerada → 0. */
export function ocupacaoPercentual(
  tempoPlanejado: number,
  jornadaLiquida: number,
): number {
  if (jornadaLiquida <= 0) return 0;
  return (tempoPlanejado / jornadaLiquida) * 100;
}

export function classificarOcupacao(
  ocupacao: number,
  p: ParametrosResolvidos,
): ClassificacaoOcupacao {
  if (ocupacao > p.ocupacao_alta) return "sobrecarga";
  if (ocupacao > p.ocupacao_adequada) return "alta_ocupacao";
  if (ocupacao > p.ocupacao_baixa) return "adequado";
  return "subutilizado";
}

/** Ocupação de uma pessoa num período, nos dias em que ela teve planejamento. */
export interface OcupacaoDaPessoa<F> {
  funcionario: F;
  /** Dias distintos com bloco não cancelado. */
  dias: number;
  planejado: number;
  jornada: number;
  /** planejado ÷ (jornada × dias), em %. 0 sem dia planejado ou sem jornada. */
  ocupacao: number;
}

/**
 * A régua de ocupação do período — **uma só** para o Dashboard, o Panorama e o
 * resumo executivo do Chromos. Ela vivia copiada nas duas telas; com um terceiro
 * consumidor, cópia vira número diferente para a mesma pergunta.
 *
 * O dia sem planejamento não entra no denominador: medir 30 dias de jornada contra
 * 5 dias montados diria "17% ocupado" sobre quem está em 100%.
 */
export function ocupacaoPorPessoa<F extends Parameters<typeof jornadaLiquidaMin>[0] & { id: string }>(
  funcionarios: F[],
  rotinas: (Pick<RotinaPlanejada, "funcionario_id" | "data" | "status" | "tempo_previsto_min"> & { so_tempo?: boolean })[],
  /** Em feriado não há jornada a cobrar: o eventual soma tempo, sem criar dia. */
  feriados: Feriado[] = [],
): OcupacaoDaPessoa<F>[] {
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const naEscala = (r: { funcionario_id: string; data: string }) => {
    const f = porId.get(r.funcionario_id) as unknown as Funcionario | undefined;
    return !!f && !diaSemJornada(f, r.data, feriados);
  };
  const porPessoa = new Map<string, { dias: Set<string>; planejado: number }>();
  for (const r of rotinas) {
    if (!ocupaHorario(r)) continue;
    const acc = porPessoa.get(r.funcionario_id) ?? { dias: new Set<string>(), planejado: 0 };
    if (!r.so_tempo || naEscala(r)) acc.dias.add(r.data);
    acc.planejado += r.tempo_previsto_min;
    porPessoa.set(r.funcionario_id, acc);
  }
  return funcionarios.map((funcionario) => {
    const acc = porPessoa.get(funcionario.id);
    const dias = acc?.dias.size ?? 0;
    const planejado = acc?.planejado ?? 0;
    const jornada = jornadaLiquidaMin(funcionario);
    const ocupacao = dias > 0 && jornada > 0 ? (planejado / (jornada * dias)) * 100 : 0;
    return { funcionario, dias, planejado, jornada, ocupacao };
  });
}

/**
 * Os agregados das pessoas COM planejamento. A ocupação média é a média das
 * ocupações individuais (não horas ÷ horas) — é o número que as telas sempre
 * mostraram. `null` quando ninguém teve planejamento: média de nada não é 0%.
 */
export function resumoDeOcupacao<F>(pessoas: OcupacaoDaPessoa<F>[], p: ParametrosResolvidos) {
  const com = pessoas.filter((x) => x.dias > 0);
  return {
    pessoasPlanejadas: com.length,
    ocupacaoMedia: com.length ? com.reduce((s, x) => s + x.ocupacao, 0) / com.length : null,
    ociosidadeMin: com.reduce((s, x) => s + Math.max(0, x.jornada * x.dias - x.planejado), 0),
    emSobrecarga: com.filter((x) => classificarOcupacao(x.ocupacao, p) === "sobrecarga").length,
    subutilizados: com.filter((x) => classificarOcupacao(x.ocupacao, p) === "subutilizado").length,
  };
}

export const ROTULO_CLASSIFICACAO: Record<ClassificacaoOcupacao, string> = {
  subutilizado: "Subutilizado",
  adequado: "Adequado",
  alta_ocupacao: "Alta ocupação",
  sobrecarga: "Sobrecarga",
};

export function desvioMin(tempoRealMin: number, tempoPrevistoMin: number): number {
  return tempoRealMin - tempoPrevistoMin;
}

export function desvioPercentual(
  tempoRealMin: number,
  tempoPrevistoMin: number,
): number {
  if (tempoPrevistoMin <= 0) return 0;
  return (desvioMin(tempoRealMin, tempoPrevistoMin) / tempoPrevistoMin) * 100;
}

/** Desvio acima do limite configurado exige justificativa. */
export function exigeJustificativa(
  tempoRealMin: number,
  tempoPrevistoMin: number,
  p: ParametrosResolvidos,
): boolean {
  return (
    Math.abs(desvioPercentual(tempoRealMin, tempoPrevistoMin)) >
    p.desvio_justificativa_percentual
  );
}

/** Produtividade: m² atendidos por hora trabalhada. */
export function produtividadeM2PorHora(totalM2: number, totalMin: number): number {
  if (totalMin <= 0) return 0;
  return totalM2 / (totalMin / 60);
}

/** Resumo completo de um funcionário em uma data (painel lateral e dashboard). */
export interface ResumoFuncionario {
  jornada_liquida_min: number;
  tempo_planejado_min: number;
  /** Deslocamento estimado do dia (nº de tarefas × parâmetro da sede). */
  ociosidade_prevista_min: number;
  ocupacao_percentual: number;
  classificacao: ClassificacaoOcupacao;
  total_tarefas: number;
}

export function resumoFuncionario(
  funcionario: Funcionario,
  rotinasDoDia: RotinaPlanejada[],
  p: ParametrosResolvidos,
  /** Minutos de serviço eventual fora das tarefas (`eventuaisForaDasTarefas`). */
  eventualMin = 0,
): ResumoFuncionario {
  const jornada = jornadaLiquidaMin(funcionario);
  const planejado = tempoPlanejadoMin(rotinasDoDia) + eventualMin;
  const totalTarefas = rotinasDoDia.filter(ocupaHorario).length;
  const ocupacao = ocupacaoPercentual(planejado, jornada);
  return {
    jornada_liquida_min: jornada,
    tempo_planejado_min: planejado,
    ociosidade_prevista_min: ociosidadePrevistaMin(jornada, planejado),
    ocupacao_percentual: ocupacao,
    classificacao: classificarOcupacao(ocupacao, p),
    total_tarefas: totalTarefas,
  };
}
