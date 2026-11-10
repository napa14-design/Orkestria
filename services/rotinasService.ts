/**
 * Serviço de rotinas planejadas — o coração do sistema.
 *
 * O servidor SEMPRE recalcula tempo previsto, blocos e horário de fim a
 * partir da tarefa/local/parâmetros (nunca confia nos números do cliente)
 * e revalida conflitos antes de gravar.
 */
import {
  fimPlanejadoMin,
  blocosOcupados,
  funcionarioNoDia,
  jornadaDoDia,
  ocupaHorario,
  semCoberturas,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { formatarDataBR, hhmmParaMin, minParaHHMM, rotularDiasSemana, somarDias } from "@/lib/dateUtils";
import { CODIGOS_AUTORIZAVEIS, temErro, validarAlocacao, validarRotina } from "@/lib/validations";
import { resumirProblemas, validarDia, type ProblemaDoDia } from "@/lib/validacaoDoDia";
import type { AlertaValidacao, Funcionario, RotinaPlanejada, StatusRotina } from "@/types";
import { ausenteEm } from "./ausenciasService";
import { ErroConflito, ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { mapaFatorDoTipo } from "./tiposLocalService";
import { getQualificacoesDoFuncionario } from "./qualificacoesService";
import { getTempoPessoal } from "./temposPersonalizadosService";

const ROTULO_AUSENCIA: Record<string, string> = {
  falta: "falta",
  atestado: "atestado",
  ferias: "férias",
  folga: "folga",
  banco_horas: "banco de horas",
  outro: "ausência",
};

async function exigirPresenca(funcionarioId: string, nome: string, data: string) {
  const ausencia = await ausenteEm(funcionarioId, data);
  if (ausencia) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "FUNCIONARIO_AUSENTE",
        mensagem: `${nome} está ausente em ${data} (${ROTULO_AUSENCIA[ausencia.tipo] ?? ausencia.tipo}).`,
      },
    ]);
  }
}

/** Bloqueia alocação em dia de folga (não previsto na escala do funcionário). */
function exigirEscala(funcionario: Funcionario, data: string) {
  if (!jornadaDoDia(funcionario, data).trabalha) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "FOLGA",
        mensagem: `${funcionario.nome} não trabalha em ${data} (folga pela escala).`,
      },
    ]);
  }
}

/**
 * Id determinístico para rotinas MATERIALIZADAS (gerar/repetir/aplicar rota
 * padrão). Como é derivado de data+funcionário+tarefa+início, dois cliques
 * simultâneos gravam o MESMO doc (last-write-wins) em vez de duplicar — fecha a
 * corrida que a checagem "lê-então-grava" não pega. Alocação manual mantém id
 * aleatório (pode haver a mesma tarefa/hora só por materialização).
 */
export function idMaterializacao(
  data: string,
  funcionarioId: string,
  tarefaId: string,
  inicio: string,
): string {
  return `m_${data}_${funcionarioId}_${tarefaId}_${inicio.replace(/:/g, "")}`;
}

/**
 * Id determinístico do bloco gerado pela **rota padrão**, derivado de
 * data + item da rota.
 *
 * Diferença que importa em relação a `idMaterializacao`: o id do item **não muda
 * quando o horário dele muda**. Então mover uma tarefa de 08:00 para 09:00 na rota
 * continua apontando para o mesmo documento, e a geração atualiza o bloco em vez
 * de criar outro ao lado. A proteção contra dois cliques simultâneos (mesmo id →
 * last-write-wins) continua valendo.
 */
export function idDeItemDaRota(data: string, itemId: string): string {
  return `ri_${data}_${itemId}`;
}

/**
 * Id **estável** de um item de rota, derivado de camada + pessoa + tarefa +
 * número da ocorrência (1ª, 2ª… vez que aquela pessoa faz aquela tarefa na
 * camada).
 *
 * Por que estável e por que sem o horário: a única forma de mudar a rota hoje é
 * **re-salvá-la** a partir de um dia montado. Com id aleatório a cada salvamento,
 * todo vínculo `origem_item_id` dos blocos já gerados se perdia, e a geração
 * criava blocos duplicados ao lado — exatamente o defeito que a proveniência veio
 * consertar. Tirando o horário da identidade, mover uma tarefa de 08:00 para 09:00
 * mantém o mesmo item, e o bloco é **atualizado**.
 *
 * Limite conhecido: se a pessoa faz a mesma tarefa duas vezes na camada e uma
 * delas é removida, a numeração da outra desloca e o vínculo se perde (o bloco
 * antigo fica e um novo nasce). Vale o caso comum.
 */
export function idItemDeRota(
  nomeModelo: string,
  funcionarioId: string,
  tarefaId: string,
  ocorrencia: number,
): string {
  const nome = nomeModelo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 24);
  return `mi_${nome}_${funcionarioId}_${tarefaId}_${ocorrencia}`;
}

export interface NovaRotina {
  data: string;
  funcionario_id: string;
  tarefa_id: string;
  inicio_planejado: string;
  observacao?: string;
  /** Autorização manual: rebaixa INTERVALO/SOBREPOSICAO de erro para alerta. */
  forcar?: boolean;
  /**
   * Duração (min) informada na alocação — só é respeitada para tarefas de
   * presença/plantão ou regra "manual", cuja duração varia por dia. Para as
   * demais o servidor sempre calcula (m² × ambiente × serviço).
   */
  duracao_min?: number;
}

/** Com `forcar`, conflitos autorizáveis viram alertas em vez de bloqueio. */
function aplicarAutorizacaoManual(
  alertas: AlertaValidacao[],
  forcar: boolean | undefined,
): { alertas: AlertaValidacao[]; autorizou: boolean } {
  if (!forcar) return { alertas, autorizou: false };
  let autorizou = false;
  const rebaixados = alertas.map((a) => {
    if (a.nivel === "erro" && CODIGOS_AUTORIZAVEIS.has(a.codigo)) {
      autorizou = true;
      return { ...a, nivel: "alerta" as const, mensagem: `${a.mensagem} (autorizado manualmente)` };
    }
    return a;
  });
  return { alertas: rebaixados, autorizou };
}

export interface ResultadoRotina {
  rotina: RotinaPlanejada;
  alertas: AlertaValidacao[]; // alertas não bloqueantes (ex.: sobrecarga)
}

export async function getRotinasByData(
  data: string,
  sedeId?: string,
): Promise<RotinaPlanejada[]> {
  const ds = await getDataSource();
  // Com sede: consulta composta (sede_id + data) → o Firestore lê SÓ as rotinas
  // daquela sede naquele dia (índice composto em firestore.indexes.json), em vez
  // de ler o dia de todas as 17 sedes e filtrar em memória (17× mais leituras).
  const cond: Parameters<typeof ds.consultar>[1] = [{ campo: "data", op: "==", valor: data }];
  if (sedeId) cond.unshift({ campo: "sede_id", op: "==", valor: sedeId });
  return ds.consultar("rotinas_planejadas", cond);
}

export async function getRotinasPeriodo(
  de: string,
  ate: string,
  sedeId?: string,
): Promise<RotinaPlanejada[]> {
  const ds = await getDataSource();
  // Com sede: composta (sede_id + intervalo em data) — mesmo índice composto
  // (sede_id, data) cobre a igualdade e o range. Sem sede: range só em `data`.
  const cond: Parameters<typeof ds.consultar>[1] = [
    { campo: "data", op: ">=", valor: de },
    { campo: "data", op: "<=", valor: ate },
  ];
  if (sedeId) cond.unshift({ campo: "sede_id", op: "==", valor: sedeId });
  return ds.consultar("rotinas_planejadas", cond);
}

/**
 * Dias da última semana (antes de `hoje`) com blocos ainda sem registro — o
 * aviso do Acompanhamento. Conta em vez de ler: 2 contagens por dia (planejada
 * e pendente), ~14 leituras, no lugar de carregar 7 dias de rotinas (~2.800
 * numa sede grande; levantamento de leituras, 20/10/2026).
 */
export async function diasComPendencia(sedeId: string, hoje: string): Promise<Array<[string, number]>> {
  const ds = await getDataSource();
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(hoje, i - 7));
  const contagens = await Promise.all(
    dias.map(async (data) => {
      const base = [
        { campo: "sede_id", op: "==" as const, valor: sedeId },
        { campo: "data", op: "==" as const, valor: data },
      ];
      const [planejada, pendente] = await Promise.all([
        ds.contar("rotinas_planejadas", [...base, { campo: "status", op: "==", valor: "planejada" }]),
        ds.contar("rotinas_planejadas", [...base, { campo: "status", op: "==", valor: "pendente" }]),
      ]);
      return [data, planejada + pendente] as [string, number];
    }),
  );
  return contagens.filter(([, n]) => n > 0);
}

/**
 * O dia mais recente antes de `antes` (até 31 dias) com rotina na sede, e quantos
 * blocos ele tem — a fonte do "repetir o dia anterior" na Agenda.
 *
 * Conta dia a dia para trás, de 7 em 7, e para no primeiro com blocos: em geral
 * poucas leituras, no máximo ~31. A alternativa — ordenar por data decrescente
 * com limite 1 — exige um índice composto novo (sede ASC, data DESC) publicado
 * no Firestore; a Agenda lia os 31 dias inteiros (~10 mil leituras numa sede
 * grande) só para achar esse dia (auditoria de leituras, 20/10/2026).
 */
export async function ultimoDiaComRotina(
  sedeId: string,
  antes: string,
): Promise<{ data: string; n: number } | null> {
  const ds = await getDataSource();
  const doDia = (data: string) => [
    { campo: "sede_id", op: "==" as const, valor: sedeId },
    { campo: "data", op: "==" as const, valor: data },
  ];
  for (let inicio = 1; inicio <= 31; inicio += 7) {
    const dias = Array.from({ length: Math.min(7, 32 - inicio) }, (_, i) => somarDias(antes, -(inicio + i)));
    const totais = await Promise.all(dias.map((d) => ds.contar("rotinas_planejadas", doDia(d))));
    for (let i = 0; i < dias.length; i++) {
      if (totais[i] === 0) continue;
      // O "repetir" copia o que ocupa o horário: cancelada e remanejada não vão.
      const [canceladas, remanejadas] = await Promise.all(
        (["cancelada", "remanejada"] as const).map((status) =>
          ds.contar("rotinas_planejadas", [...doDia(dias[i]), { campo: "status", op: "==", valor: status }]),
        ),
      );
      const n = totais[i] - canceladas - remanejadas;
      if (n > 0) return { data: dias[i], n };
    }
  }
  return null;
}

/**
 * Ids de tarefas **de espera** entre as rotinas que colidem com a janela.
 *
 * Lê apenas as tarefas das rotinas que de fato se sobrepõem — normalmente
 * nenhuma, às vezes uma. Carregar as tarefas da sede inteira custaria dezenas
 * de leituras a cada arrasto, e essa informação só importa quando há choque.
 */
async function esperaEntreOsChoques(
  rotinas: RotinaPlanejada[],
  inicioMin: number,
  fimMin: number,
): Promise<Set<string>> {
  const ids = new Set(
    rotinas
      .filter(ocupaHorario)
      .filter((r) => {
        const ini = hhmmParaMin(r.inicio_planejado);
        const fim = hhmmParaMin(r.fim_planejado);
        return inicioMin < fim && ini < fimMin;
      })
      .map((r) => r.tarefa_id),
  );
  if (ids.size === 0) return new Set();
  const ds = await getDataSource();
  const tarefas = await Promise.all([...ids].map((id) => ds.obter("tarefas", id)));
  return new Set(tarefas.filter((t) => t?.espera).map((t) => t!.id));
}

export async function createRotina(
  entrada: NovaRotina,
  supervisorId: string,
  /**
   * Id fixo (determinístico) — só a materialização passa. É parâmetro, e não campo
   * de `NovaRotina`, de propósito: a rota repassa o corpo do POST inteiro, e um
   * `idFixo` vindo dali sobrescrevia um bloco de outra sede (revisão, 14/10/2026).
   */
  idFixo?: string,
): Promise<ResultadoRotina> {
  const ds = await getDataSource();
  const [tarefa, funcionario] = await Promise.all([
    ds.obter("tarefas", entrada.tarefa_id),
    ds.obter("funcionarios", entrada.funcionario_id),
  ]);
  if (!tarefa) throw new Error("Tarefa não encontrada.");
  if (!funcionario) throw new Error("Funcionário não encontrado.");
  await exigirPresenca(funcionario.id, funcionario.nome, entrada.data);
  exigirEscala(funcionario, entrada.data);
  // valida contra o horário daquela data (ex.: sábado de 4h)
  const funcEfetivo = funcionarioNoDia(funcionario, entrada.data);

  const exigeRequisitos = !!(tarefa.requisitos ?? "").split(",").filter(Boolean).length;
  const [local, parametros, rotinasDoDia, requisitosCatalogo, qualificacoesFuncionario] =
    await Promise.all([
      ds.obter("locais", tarefa.local_id),
      resolverParametros(tarefa.sede_id),
      getRotinasByData(entrada.data),
      exigeRequisitos ? ds.listar("requisitos") : Promise.resolve([]),
      exigeRequisitos
        ? getQualificacoesDoFuncionario(entrada.funcionario_id)
        : Promise.resolve([]),
    ]);

  // tempo pessoal (planejamento realista) substitui o padrão quando existe.
  // Intensidade vem do local e a natureza do esforço da própria tarefa.
  // Presença/plantão e regra manual: duração variável por dia — o servidor
  // respeita a duração informada na alocação (e ignora para tarefas calculadas).
  const duracaoVariavel = tarefa.presenca || tarefa.regra_calculo === "manual";
  const tempoPessoal = await getTempoPessoal(entrada.funcionario_id, tarefa.id);
  const previsto =
    duracaoVariavel && typeof entrada.duracao_min === "number" && entrada.duracao_min > 0
      ? Math.round(entrada.duracao_min)
      : tempoPessoal ?? tempoPrevistoMin(tarefa, local ?? undefined, await mapaFatorDoTipo());
  const visual = tempoVisualMin(previsto, parametros.bloco_agenda_min);
  const inicioMin = hhmmParaMin(entrada.inicio_planejado);
  // O fim é o REAL (início + previsto), não o do bloco arredondado. `visual` e
  // `blocos_ocupados` seguem valendo para a grade (altura mínima clicável e o
  // arrasto), mas quem decide sobreposição é o relógio: uma tarefa de 5 min NÃO
  // reserva os 15 do bloco. Sem isso, rotas com muita tarefa curta — a CESIU tem
  // 92 de 5 e 10 min — perdem quase tudo por SOBREPOSICAO ao gerar o dia.
  const fimMin = fimPlanejadoMin(inicioMin, previsto);

  const candidata: Partial<RotinaPlanejada> = {
    data: entrada.data,
    funcionario_id: entrada.funcionario_id,
    tarefa_id: entrada.tarefa_id,
    local_id: tarefa.local_id,
    sede_id: tarefa.sede_id,
    inicio_planejado: entrada.inicio_planejado,
  };
  const estruturais = validarRotina(candidata);
  if (temErro(estruturais)) throw new ErroValidacao(estruturais);

  const brutos = validarAlocacao({
    funcionario: funcEfetivo,
    rotinasExistentes: rotinasDoDia.filter(
      (r) => r.funcionario_id === entrada.funcionario_id,
    ),
    inicioMin,
    fimMin,
    tarefa,
    local: local ?? undefined,
    parametros,
    tempoPrevistoNovo: previsto,
    requisitosCatalogo,
    qualificacoesFuncionario,
    data: entrada.data,
    tarefasEspera: await esperaEntreOsChoques(
      rotinasDoDia.filter((r) => r.funcionario_id === entrada.funcionario_id),
      inicioMin,
      fimMin,
    ),
  });
  const { alertas, autorizou } = aplicarAutorizacaoManual(brutos, entrada.forcar);
  if (temErro(alertas)) throw new ErroValidacao(alertas);

  const agora = agoraISO();
  const rotina: RotinaPlanejada = {
    id: idFixo ?? novoId(),
    data: entrada.data,
    funcionario_id: entrada.funcionario_id,
    sede_id: tarefa.sede_id,
    tarefa_id: tarefa.id,
    local_id: tarefa.local_id,
    inicio_planejado: entrada.inicio_planejado,
    fim_planejado: minParaHHMM(fimMin),
    tempo_previsto_min: previsto,
    tempo_visual_min: visual,
    blocos_ocupados: blocosOcupados(previsto, parametros.bloco_agenda_min),
    status: "planejada",
    observacao: `${entrada.observacao ?? ""}${autorizou ? " [Autorizado manualmente]" : ""}`.trim(),
    supervisor_id: supervisorId,
    criado_em: agora,
    atualizado_em: agora,
  };
  await ds.criar("rotinas_planejadas", rotina);
  return { rotina, alertas };
}

const STATUS_ROTINA: ReadonlySet<unknown> = new Set<StatusRotina>([
  "planejada",
  "realizada",
  "nao_realizada",
  "remanejada",
  "cancelada",
  "pendente",
]);

/** O que um PUT de rotina pode mudar. Sede, tarefa, local e contas derivadas, nunca. */
const CAMPOS_EDITAVEIS_ROTINA: ReadonlySet<string> = new Set([
  "inicio_planejado",
  "funcionario_id",
  "data",
  "status",
  "observacao",
  "tempo_previsto_min",
]);

/**
 * Move a rotina de horário/funcionário e/ou redimensiona a duração,
 * revalidando conflitos. `forcar` autoriza manualmente intervalo/sobreposição.
 */
export async function updateRotina(
  id: string,
  mudancas: Partial<
    Pick<
      RotinaPlanejada,
      | "inicio_planejado"
      | "funcionario_id"
      | "data"
      | "status"
      | "observacao"
      | "tempo_previsto_min"
    >
  > & { forcar?: boolean; bloquearAlertas?: boolean },
  /**
   * Só para chamada INTERNA — parâmetro à parte de propósito: o PUT da agenda
   * repassa o corpo inteiro em `mudancas`, e lá esta opção virava atalho para
   * soltar a sobreposição sem o "(autorizado manualmente)" (revisão de
   * segurança, 21/10/2026). No corpo, ela cai em CAMPO_NAO_EDITAVEL.
   */
  interno: {
    /**
     * Blocos do destino cujo choque de horário é aceito — e SÓ esses, ao
     * contrário do `forcar`, que solta intervalo e expediente também. É o
     * "Feita por": o colega cobriu no meio de uma tarefa dele que só encosta.
     */
    ignorarChoqueCom?: string[];
  } = {},
): Promise<ResultadoRotina> {
  const { forcar, bloquearAlertas, ...dados } = mudancas;
  const { ignorarChoqueCom } = interno;
  // O `Pick` acima só existe no TypeScript: o corpo do PUT chega inteiro. Sem esta
  // lista, `{ sede_id: "<outra sede>" }` passava direto para o banco — a rota
  // confere a sede ATUAL da rotina, não a de destino (auditoria de 14/10/2026).
  const fora = Object.keys(dados).filter((k) => !CAMPOS_EDITAVEIS_ROTINA.has(k));
  if (fora.length)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "CAMPO_NAO_EDITAVEL",
        mensagem: `Campo(s) que não se alteram por aqui: ${fora.join(", ")}.`,
      },
    ]);
  // O nome do campo estar na lista não basta: o valor também chega cru do PUT.
  const invalido =
    (dados.status !== undefined && !STATUS_ROTINA.has(dados.status)) ||
    (dados.inicio_planejado !== undefined && !/^\d{2}:\d{2}$/u.test(String(dados.inicio_planejado))) ||
    (dados.data !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(String(dados.data))) ||
    (dados.tempo_previsto_min !== undefined && !Number.isFinite(dados.tempo_previsto_min));
  if (invalido)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "VALOR_INVALIDO", mensagem: "Valor inválido em status, data, horário ou duração." },
    ]);
  const ds = await getDataSource();
  const atual = await ds.obter("rotinas_planejadas", id);
  if (!atual) throw new Error("Rotina não encontrada.");

  const destinoFuncId = dados.funcionario_id ?? atual.funcionario_id;
  const destinoData = dados.data ?? atual.data;
  const destinoInicio = dados.inicio_planejado ?? atual.inicio_planejado;

  const [funcionario, tarefa, parametros] = await Promise.all([
    ds.obter("funcionarios", destinoFuncId),
    ds.obter("tarefas", atual.tarefa_id),
    resolverParametros(atual.sede_id),
  ]);
  if (!funcionario) throw new Error("Funcionário não encontrado.");

  // Conformidade: o destino é validado e deve permanecer na sede da rotina.
  if (funcionario.sede_id !== atual.sede_id)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SEDE_DIVERGENTE",
        mensagem: "A rotina e o funcionário precisam pertencer à mesma sede.",
      },
    ]);
  // A rotina não pode sair da própria sede; portanto a validação lê somente o
  // dia desta sede, nunca o conjunto de todas as sedes.
  const rotinasDoDia = await getRotinasByData(destinoData, atual.sede_id);

  const exigeRequisitos = !!(tarefa?.requisitos ?? "").split(",").filter(Boolean).length;
  const [requisitosCatalogo, qualificacoesFuncionario] = await Promise.all([
    exigeRequisitos ? ds.listar("requisitos") : Promise.resolve([]),
    exigeRequisitos ? getQualificacoesDoFuncionario(destinoFuncId) : Promise.resolve([]),
  ]);

  const local = tarefa ? await ds.obter("locais", tarefa.local_id) : null;

  // Redimensionamento: novo tempo previsto recalcula blocos, visual e fim.
  const redimensionou =
    dados.tempo_previsto_min !== undefined &&
    dados.tempo_previsto_min !== atual.tempo_previsto_min;
  const novoPrevisto = dados.tempo_previsto_min ?? atual.tempo_previsto_min;
  if (redimensionou && novoPrevisto <= 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "SEM_TEMPO_PREVISTO", mensagem: "Duração deve ser maior que zero." },
    ]);
  const novoVisual = redimensionou
    ? tempoVisualMin(novoPrevisto, parametros.bloco_agenda_min)
    : atual.tempo_visual_min;

  const inicioMin = hhmmParaMin(destinoInicio);
  // Mesmo motivo do createRotina: o fim gravado é o real.
  const fimMin = fimPlanejadoMin(inicioMin, novoPrevisto);

  let alertas: AlertaValidacao[] = [];
  const mudouPosicao =
    dados.inicio_planejado !== undefined ||
    dados.funcionario_id !== undefined ||
    dados.data !== undefined ||
    redimensionou ||
    // Bloco cancelado ou remanejado que volta ao dia ocupa horário de novo:
    // confere conflito (remanejada passou a liberar o horário em 19/10/2026).
    (!ocupaHorario(atual) && dados.status !== undefined && ocupaHorario({ status: dados.status }));

  if (mudouPosicao) {
    await exigirPresenca(funcionario.id, funcionario.nome, destinoData);
    exigirEscala(funcionario, destinoData);
    const ignorar = new Set(ignorarChoqueCom ?? []);
    const doDestino = rotinasDoDia.filter(
      (r) => r.funcionario_id === destinoFuncId && r.id !== id && !ignorar.has(r.id),
    );
    const brutos = validarAlocacao({
      funcionario: funcionarioNoDia(funcionario, destinoData),
      rotinasExistentes: doDestino,
      inicioMin,
      fimMin,
      tarefa: tarefa ?? undefined,
      local: local ?? undefined,
      parametros,
      tempoPrevistoNovo: novoPrevisto,
      requisitosCatalogo,
      qualificacoesFuncionario,
      data: destinoData,
      tarefasEspera: await esperaEntreOsChoques(doDestino, inicioMin, fimMin),
    });
    const resultado = aplicarAutorizacaoManual(brutos, forcar);
    alertas = resultado.alertas;
    if (temErro(alertas) || (bloquearAlertas && alertas.length > 0))
      throw new ErroValidacao(alertas);
  }

  // Mão humana depois do remanejo automático: a marca deixa de dizer a verdade (o
  // aviso citaria quem não assumiu, e o "Desfazer" passaria por cima da decisão).
  const mexeuNoRemanejo =
    !!atual.remanejo_auto &&
    ((dados.funcionario_id !== undefined && dados.funcionario_id !== atual.funcionario_id) ||
      (dados.inicio_planejado !== undefined && dados.inicio_planejado !== atual.inicio_planejado) ||
      (dados.data !== undefined && dados.data !== atual.data));
  const rotina = await ds.atualizar("rotinas_planejadas", id, {
    ...dados,
    ...(mexeuNoRemanejo ? { remanejo_auto: "" } : {}),
    tempo_previsto_min: novoPrevisto,
    tempo_visual_min: novoVisual,
    blocos_ocupados: blocosOcupados(novoPrevisto, parametros.bloco_agenda_min),
    fim_planejado: mudouPosicao ? minParaHHMM(fimMin) : atual.fim_planejado,
    atualizado_em: agoraISO(),
  });
  return { rotina, alertas };
}

/** Bloco que ainda pode trocar de dono: planejado, sem realizado registrado. */
const TROCA_MOVEL: ReadonlySet<StatusRotina> = new Set(["planejada", "pendente"]);

export interface BlocoTrocado {
  rotina_id: string;
  de: string;
  para: string;
  tarefa: string;
  inicio: string;
  fim: string;
  alertas: AlertaValidacao[];
}

export interface PropostaTroca {
  a: { id: string; nome: string; recebe: number };
  b: { id: string; nome: string; recebe: number };
  blocos: BlocoTrocado[];
  /** Blocos dos dois que ficam onde estão: já têm realizado, foram cancelados ou remanejados. */
  ficam: number;
  /** Erro que nem autorizando passa (ex.: requisito que falta). */
  bloqueia: boolean;
  /** Há erro de horário que o coordenador pode autorizar, como no arrasto. */
  pedeAutorizacao: boolean;
  /** Itens da rota padrão de cada um, que trocam junto se a tela marcar "também na rota". */
  rota: { a: number; b: number };
  /** Itens da rota que quem recebe não pode fazer (requisito, validade, gênero): com eles, a rota não troca. */
  rotaRecusas: { item_id: string; dias: string; tarefa: string; para: string; inicio: string; motivo: string }[];
  /** O que a tela viu: confirmar com outra lista é recusado. */
  assinatura: string;
  gravados?: number;
}

/**
 * Troca as tarefas do dia entre duas pessoas: as de A vão para B e as de B para A, de
 * uma vez. Antes era bloco a bloco, e cada arrasto esbarrava nos blocos que o outro
 * ainda não tinha largado (pedido da coordenação, 09/11/2026). Simula as duas agendas
 * já trocadas e valida cada bloco no destino com a mesma regra do arrasto; sem
 * `confirmar`, só devolve a proposta. Com um lado vazio, vira passar as tarefas.
 */
export async function trocarTarefasDoDia(args: {
  data: unknown;
  sedeId: string;
  aId: unknown;
  bId: unknown;
  confirmar?: boolean;
  forcar?: boolean;
  /** Troca também os itens da rota padrão, para os próximos dias gerados virem trocados. */
  rota?: boolean;
  assinatura?: unknown;
}): Promise<PropostaTroca> {
  const { data, sedeId, aId, bId } = args;
  const recusa = (codigo: string, mensagem: string) => new ErroValidacao([{ nivel: "erro", codigo, mensagem }]);
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(data) || typeof aId !== "string" || typeof bId !== "string")
    throw recusa("TROCA_INVALIDA", "Informe a data e as duas pessoas.");
  if (aId === bId) throw recusa("TROCA_MESMA_PESSOA", "Escolha outra pessoa para trocar.");
  const ds = await getDataSource();
  const [fa, fb] = await Promise.all([ds.obter("funcionarios", aId), ds.obter("funcionarios", bId)]);
  if (!fa || !fb) throw recusa("TROCA_SEM_FUNCIONARIO", "Funcionário não encontrado.");
  if (fa.sede_id !== sedeId || fb.sede_id !== sedeId)
    throw recusa("SEDE_DIVERGENTE", "As duas pessoas precisam ser da sede aberta.");
  for (const f of [fa, fb]) {
    if (f.ativo !== true) throw recusa("FUNCIONARIO_INATIVO", `${f.nome} não está ativo.`);
    await exigirPresenca(f.id, f.nome, data);
    exigirEscala(f, data);
  }

  const [doDia, realizados, modelosDaSede] = await Promise.all([
    getRotinasByData(data, sedeId),
    ds.consultar("execucoes_realizadas", [
      { campo: "sede_id", op: "==", valor: sedeId },
      { campo: "data_execucao", op: "==", valor: data },
    ]),
    ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }]),
  ]);
  // Mesma leitura de `getRotaPadrao`: só itens da rota padrão, nunca de evento.
  const rotaDe = (id: string) => modelosDaSede.filter((m) => m.padrao === true && !m.evento && m.funcionario_id === id);
  const [rotaDeA, rotaDeB] = [rotaDe(aId), rotaDe(bId)];
  // O status da rotina é gravado depois do realizado, em outra escrita que pode falhar:
  // bloco com registro fica com quem fez, mesmo se o status ainda disser "planejada".
  const comRegistro = new Set(realizados.map((e) => e.rotina_id));
  const movel = (r: RotinaPlanejada) => TROCA_MOVEL.has(r.status) && !comRegistro.has(r.id);
  const dele = (id: string) => doDia.filter((r) => r.funcionario_id === id);
  const [vaiDeA, vaiDeB] = [dele(aId).filter(movel), dele(bId).filter(movel)];
  if (!vaiDeA.length && !vaiDeB.length && !rotaDeA.length && !rotaDeB.length)
    throw recusa("TROCA_VAZIA", "Nenhum dos dois tem tarefa planejada para trocar neste dia, nem na rota padrão.");
  // Tudo o que entra na conta, dos dois: quem tem o bloco, horário, duração, situação e
  // registro. Um bloco que muda de horário entre ver e confirmar mudaria os alertas.
  const assinatura = [...dele(aId), ...dele(bId)]
    .map((r) => [r.id, r.funcionario_id, r.inicio_planejado, r.tempo_previsto_min, r.status, comRegistro.has(r.id) ? "r" : ""].join("@"))
    .concat([...rotaDeA, ...rotaDeB].map((m) => `rota:${m.id}@${m.funcionario_id}`))
    .sort()
    .join(",");
  if (args.confirmar && args.assinatura !== assinatura)
    throw new ErroConflito("A agenda dos dois mudou desde que a troca foi montada. Confira de novo.");
  // A autorização vale só na confirmação: a proposta mostra sempre o que pede autorização,
  // senão a tela perdia a caixa e levava a autorização para a próxima pessoa escolhida.
  const forcar = args.confirmar === true && args.forcar === true;

  const todos: { tarefa_id: string; local_id: string }[] = [...dele(aId), ...dele(bId), ...rotaDeA, ...rotaDeB];
  const [tarefas, locais, parametros, requisitosCatalogo, qualA, qualB] = await Promise.all([
    Promise.all([...new Set(todos.map((r) => r.tarefa_id))].map((id) => ds.obter("tarefas", id))),
    Promise.all([...new Set(todos.map((r) => r.local_id))].map((id) => ds.obter("locais", id))),
    resolverParametros(sedeId),
    ds.listar("requisitos"),
    getQualificacoesDoFuncionario(aId),
    getQualificacoesDoFuncionario(bId),
  ]);
  const tarefaPorId = new Map(tarefas.filter((t) => t !== null).map((t) => [t.id, t]));
  const localPorId = new Map(locais.filter((l) => l !== null).map((l) => [l.id, l]));
  const espera = new Set([...tarefaPorId.values()].filter((t) => t.espera).map((t) => t.id));

  const blocos: BlocoTrocado[] = [];
  const fimDe = new Map<string, string>();
  const avaliar = (vao: RotinaPlanejada[], destino: Funcionario, ficaNoDestino: RotinaPlanejada[], qualificacoes: typeof qualA) => {
    const funcNoDia = funcionarioNoDia(destino, data);
    for (const r of vao) {
      const outros = [...ficaNoDestino, ...vao.filter((x) => x.id !== r.id)].map((x) => ({ ...x, funcionario_id: destino.id }));
      const tarefa = tarefaPorId.get(r.tarefa_id);
      const inicioMin = hhmmParaMin(r.inicio_planejado);
      const fimMin = fimPlanejadoMin(inicioMin, r.tempo_previsto_min);
      fimDe.set(r.id, minParaHHMM(fimMin));
      const brutos = validarAlocacao({
        funcionario: funcNoDia,
        rotinasExistentes: outros,
        inicioMin,
        fimMin,
        tarefa,
        local: localPorId.get(r.local_id),
        parametros,
        tempoPrevistoNovo: r.tempo_previsto_min,
        requisitosCatalogo,
        qualificacoesFuncionario: qualificacoes,
        data,
        tarefasEspera: espera,
      });
      blocos.push({
        rotina_id: r.id,
        de: r.funcionario_id,
        para: destino.id,
        tarefa: tarefa?.nome_tarefa ?? "Tarefa",
        inicio: r.inicio_planejado,
        fim: minParaHHMM(fimMin),
        alertas: aplicarAutorizacaoManual(brutos, forcar).alertas,
      });
    }
  };
  // No destino ficam os blocos dele que não trocam, mais os que chegam.
  avaliar(vaiDeA, fb, dele(bId).filter((r) => !movel(r)), qualB);
  avaliar(vaiDeB, fa, dele(aId).filter((r) => !movel(r)), qualA);
  blocos.sort((x, y) => x.inicio.localeCompare(y.inicio));

  // Na rota, o que depende só da pessoa: requisito, validade e restrição de gênero. Sem
  // isto, trocar só a rota escalava para a tarefa quem o arrasto recusaria, e o "Gerar o
  // dia" montava o bloco e só avisava (revisão de segurança, 09/11/2026). Horário,
  // intervalo e expediente seguem com o "Gerar o dia", que confere cada dia que monta.
  const DA_PESSOA = new Set(["REQUISITO_FALTANDO", "REQUISITO_VENCIDO", "RESTRICAO_GENERO"]);
  const rotaRecusas: PropostaTroca["rotaRecusas"] = [];
  const conferirRota = (itens: typeof rotaDeA, destino: Funcionario, qualificacoes: typeof qualA) => {
    for (const item of itens) {
      const tarefa = tarefaPorId.get(item.tarefa_id);
      const inicioMin = hhmmParaMin(item.inicio_planejado);
      const previsto = item.duracao_min && item.duracao_min > 0 ? item.duracao_min : 30;
      const motivos = validarAlocacao({
        funcionario: funcionarioNoDia(destino, data),
        rotinasExistentes: [],
        inicioMin,
        fimMin: fimPlanejadoMin(inicioMin, previsto),
        tarefa,
        local: localPorId.get(item.local_id),
        parametros,
        tempoPrevistoNovo: previsto,
        requisitosCatalogo,
        qualificacoesFuncionario: qualificacoes,
        data,
      }).filter((a) => a.nivel === "erro" && DA_PESSOA.has(a.codigo));
      if (motivos.length)
        rotaRecusas.push({
          item_id: item.id,
          // A mesma tarefa pode estar em duas camadas (seg–sex e sábado): sem os dias, o aviso
          // mostrava a mesma linha duas vezes.
          dias: item.dias_semana ? rotularDiasSemana(item.dias_semana) : "",
          tarefa: tarefa?.nome_tarefa ?? "Tarefa",
          para: destino.nome,
          inicio: item.inicio_planejado,
          motivo: motivos.map((a) => a.mensagem).join(" "),
        });
    }
  };
  conferirRota(rotaDeA, fb, qualB);
  conferirRota(rotaDeB, fa, qualA);
  rotaRecusas.sort((x, y) => x.inicio.localeCompare(y.inicio));

  const erros = blocos.flatMap((b) => b.alertas.filter((a) => a.nivel === "erro"));
  const proposta: PropostaTroca = {
    a: { id: fa.id, nome: fa.nome, recebe: vaiDeB.length },
    b: { id: fb.id, nome: fb.nome, recebe: vaiDeA.length },
    blocos,
    ficam: dele(aId).length + dele(bId).length - vaiDeA.length - vaiDeB.length,
    bloqueia: erros.some((a) => !CODIGOS_AUTORIZAVEIS.has(a.codigo)),
    pedeAutorizacao: erros.length > 0 && erros.every((a) => CODIGOS_AUTORIZAVEIS.has(a.codigo)),
    rota: { a: rotaDeA.length, b: rotaDeB.length },
    rotaRecusas,
    assinatura,
  };
  if (!args.confirmar) return proposta;
  if (erros.length) throw new ErroValidacao(erros);
  const comRota = args.rota === true;
  if (comRota && rotaRecusas.length)
    throw new ErroValidacao(
      rotaRecusas.map((r) => ({ nivel: "erro" as const, codigo: "ROTA_RECUSADA", mensagem: `Na rota, ${r.inicio} ${r.tarefa} → ${r.para}: ${r.motivo}` })),
    );
  if (!blocos.length && !comRota)
    throw recusa("TROCA_VAZIA", "Nenhum dos dois tem tarefa planejada neste dia: marque a troca na rota padrão.");

  const agora = agoraISO();
  const porId = new Map(doDia.map((r) => [r.id, r]));
  // Num lote só: ou os dois ficam trocados, com a rota se marcada, ou nada muda. A rota
  // não passa pela régua do arrasto: o "Gerar o dia" já confere cada dia que montar.
  const naRota = comRota
    ? [...rotaDeA.map((m) => ({ id: m.id, para: bId })), ...rotaDeB.map((m) => ({ id: m.id, para: aId }))].map((m) => ({
        tipo: "atualizar" as const,
        tabela: "modelos_rotina" as const,
        id: m.id,
        mudancas: { funcionario_id: m.para, atualizado_em: agora },
      }))
    : [];
  await ds.gravarLote([
    ...naRota,
    ...blocos.map((b) => {
      const atual = porId.get(b.rotina_id)!;
      const autorizado = b.alertas.some((a) => a.mensagem.endsWith("(autorizado manualmente)"));
      return {
        tipo: "atualizar" as const,
        tabela: "rotinas_planejadas" as const,
        id: b.rotina_id,
        mudancas: {
          funcionario_id: b.para,
          // Como no arrasto: o fim gravado é o real, início + previsto.
          fim_planejado: fimDe.get(b.rotina_id)!,
          // Trocar quem faz é decisão humana: a marca do remanejo automático deixa de valer.
          ...(atual.remanejo_auto ? { remanejo_auto: "" } : {}),
          ...(autorizado && !atual.observacao?.includes("[Autorizado manualmente]")
            ? { observacao: `${atual.observacao ?? ""} [Autorizado manualmente]`.trim() }
            : {}),
          atualizado_em: agora,
        },
      };
    }),
  ]);
  return { ...proposta, gravados: blocos.length };
}

export async function deleteRotina(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("rotinas_planejadas", id);
}

/**
 * Copia todas as rotinas de um dia/sede para uma ou mais datas (Duplicar /
 * aplicar em período). Cópias que conflitariam com rotinas já existentes no
 * destino (mesmo funcionário, horário sobreposto) são puladas e contadas.
 */
export async function duplicarDia(
  dataOrigem: string,
  datasDestino: string[],
  sedeId: string,
  supervisorId: string,
): Promise<{ copiadas: number; puladas: number; comProblema?: number; detalhes?: string[] }> {
  const ds = await getDataSource();
  // Cancelada e remanejada não vão para o outro dia: a cedida numa troca é
  // exceção daquele dia, não rotina (auditoria, 20/10/2026).
  // Cobertura ("Feita por") também é exceção do dia: `semCoberturas` devolve a
  // coberta ao titular e a cedida ao colega — com o `titular_id` na cópia, a
  // trava do supervisor valia numa tarefa que ninguém cobriu (auditoria, 21/10/2026).
  const origem = semCoberturas(await getRotinasByData(dataOrigem, sedeId)).filter(ocupaHorario);
  const agora = agoraISO();
  let copiadas = 0;
  let puladas = 0;

  // Idempotência: não recria uma rotina idêntica (mesmo funcionário+tarefa+
  // início) que já exista no destino — blinda contra duplicar/gerar repetidos.
  const chave = (r: { funcionario_id: string; tarefa_id: string; inicio_planejado: string }) =>
    `${r.funcionario_id}|${r.tarefa_id}|${r.inicio_planejado}`;
  const idsFunc = [...new Set(origem.map((r) => r.funcionario_id))];

  // Contexto da validação: carregado UMA vez, não muda com a data de destino.
  const [funcionarios, tarefas, locais, requisitos, qualificacoes, parametros] = await Promise.all([
    ds.consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("locais", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.listar("requisitos"),
    ds.consultar("qualificacoes_funcionario", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    resolverParametros(sedeId),
  ]);
  const problemas: ProblemaDoDia[] = [];

  for (const dataDestino of datasDestino) {
    if (dataDestino === dataOrigem) continue;
    const existentes = await getRotinasByData(dataDestino);
    const ocupados = existentes.filter((r) => r.status !== "cancelada");
    const chavesExistentes = new Set(ocupados.map(chave));

    // Presença de todos os funcionários numa só rodada (em vez de 1 query por vez).
    const ausentes = await Promise.all(idsFunc.map((id) => ausenteEm(id, dataDestino)));
    const presente = new Map(idsFunc.map((id, i) => [id, ausentes[i] === null]));

    // Monta as cópias (lógica em memória, rápida); grava depois em lote.
    const copias: RotinaPlanejada[] = [];
    for (const r of origem) {
      if (!presente.get(r.funcionario_id)) {
        puladas++;
        continue;
      }
      if (chavesExistentes.has(chave(r))) {
        puladas++; // já existe idêntica no destino
        continue;
      }
      const ini = hhmmParaMin(r.inicio_planejado);
      const fim = hhmmParaMin(r.fim_planejado);
      const conflita = ocupados.some(
        (e) =>
          e.funcionario_id === r.funcionario_id &&
          ini < hhmmParaMin(e.fim_planejado) &&
          hhmmParaMin(e.inicio_planejado) < fim,
      );
      if (conflita) {
        puladas++;
        continue;
      }
      const copia: RotinaPlanejada = {
        ...r,
        id: idMaterializacao(dataDestino, r.funcionario_id, r.tarefa_id, r.inicio_planejado),
        data: dataDestino,
        status: "planejada",
        supervisor_id: supervisorId,
        criado_em: agora,
        atualizado_em: agora,
      };
      copias.push(copia);
      ocupados.push(copia); // evita que duas cópias do mesmo lote se sobreponham
      chavesExistentes.add(chave(copia));
    }

    // Grava em lotes paralelos — o gargalo era 1 escrita por vez (~2 min p/ um dia).
    const LOTE = 25;
    for (let i = 0; i < copias.length; i += LOTE) {
      await Promise.all(copias.slice(i, i + LOTE).map((c) => ds.criar("rotinas_planejadas", c)));
    }
    copiadas += copias.length;

    // A cópia já pula ausente, duplicata e sobreposição. O que sobra é o que
    // depende da DATA — qualificação que venceu entre a origem e o destino — e o
    // que possa ter entrado torto por um caminho que não validava.
    problemas.push(
      ...validarDia({
        blocos: await getRotinasByData(dataDestino, sedeId),
        funcionarios: new Map(funcionarios.map((f) => [f.id, f])),
        tarefas: new Map(tarefas.map((t) => [t.id, t])),
        locais: new Map(locais.map((l) => [l.id, l])),
        parametros,
        data: dataDestino,
        requisitos,
        qualificacoes,
      }),
    );
  }
  return problemas.length
    ? { copiadas, puladas, comProblema: problemas.length, detalhes: resumirProblemas(problemas) }
    : { copiadas, puladas };
}

/** O que a limpeza do dia alcança. */
export type EscopoLimpeza = "geradas" | "todas";

export interface ResultadoLimpeza {
  removidas: number;
  /** Blocos que ficaram porque já têm realizado registrado. */
  preservadas: number;
  /** Blocos montados à mão, quando o escopo é só o gerado. */
  manuais: number;
  detalhes: string[];
}

/**
 * Desfaz o dia — o caminho de volta que faltava.
 *
 * Reportado da tela em 25/08/2026: *"cliquei em gerar a rota padrão sem
 * querer, podia ter a opção de limpar o dia"*. Gerar cria dezenas de blocos de
 * uma vez e **não tinha volta**: só apagando um a um, com o × de cada card.
 *
 * Duas travas, porque apagar em lote é a operação mais perigosa da tela:
 *
 *  - **Bloco com realizado registrado nunca sai.** Apagar o planejado deixaria
 *    a execução órfã, e o realizado é evidência — o que aconteceu aconteceu.
 *  - **`escopo: "geradas"` remove só o que a máquina criou**, reconhecido pelo
 *    id determinístico (`ri_…` da rota padrão, `m_…` de gerar/duplicar/aplicar/
 *    importar). O que a pessoa arrastou à mão tem id aleatório e fica. É o que
 *    torna "desfazer a geração" diferente de "limpar tudo".
 */
export async function limparDia(
  sedeId: string,
  data: string,
  escopo: EscopoLimpeza,
  autor: string,
): Promise<ResultadoLimpeza> {
  const ds = await getDataSource();
  const doDia = await getRotinasByData(data, sedeId);
  if (doDia.length === 0) return { removidas: 0, preservadas: 0, manuais: 0, detalhes: [] };

  const execucoes = await ds.consultar("execucoes_realizadas", [
    { campo: "data_execucao", op: "==", valor: data },
  ]);
  const comRealizado = new Set(execucoes.map((e) => e.rotina_id));

  const gerado = (r: RotinaPlanejada) => r.id.startsWith("ri_") || r.id.startsWith("m_");

  const alvo: RotinaPlanejada[] = [];
  let preservadas = 0;
  let manuais = 0;
  for (const r of doDia) {
    if (comRealizado.has(r.id)) {
      preservadas++;
      continue;
    }
    if (escopo === "geradas" && !gerado(r)) {
      manuais++;
      continue;
    }
    alvo.push(r);
  }

  const detalhes: string[] = [];
  if (preservadas > 0)
    detalhes.push(`${preservadas} bloco(s) mantido(s) por já terem realizado registrado.`);
  if (manuais > 0) detalhes.push(`${manuais} bloco(s) montado(s) à mão foram preservados.`);

  await ds.gravarLote(
    alvo.map((r) => ({ tipo: "excluir" as const, tabela: "rotinas_planejadas" as const, id: r.id })),
  );
  void autor; // a autoria vai no histórico pelo decorator do DataSource
  return { removidas: alvo.length, preservadas, manuais, detalhes };
}

export interface ResultadoLimpezaPeriodo {
  /** Dias em que algo foi removido. */
  diasLimpos: number;
  removidas: number;
  preservadas: number;
  manuais: number;
  detalhes: string[];
}

/**
 * Desfaz VÁRIOS dias — o caminho de volta do "gerar a semana".
 *
 * Laço sobre `limparDia`, pelo mesmo motivo do gerar: as travas (nunca apagar
 * bloco com realizado registrado; no escopo "geradas", não tocar no que foi
 * montado à mão) valem por dia e ficam num lugar só. Sequencial porque cada dia
 * lê o próprio dia antes de decidir.
 *
 * O relatório carrega a data em cada detalhe: numa semana, "3 blocos mantidos"
 * sem dizer onde não ajuda ninguém a conferir.
 */
export async function limparPeriodo(
  sedeId: string,
  datas: string[],
  escopo: EscopoLimpeza,
  autor: string,
): Promise<ResultadoLimpezaPeriodo> {
  const res: ResultadoLimpezaPeriodo = {
    diasLimpos: 0,
    removidas: 0,
    preservadas: 0,
    manuais: 0,
    detalhes: [],
  };
  for (const data of datas) {
    const dia = await limparDia(sedeId, data, escopo, autor);
    res.removidas += dia.removidas;
    res.preservadas += dia.preservadas;
    res.manuais += dia.manuais;
    if (dia.removidas > 0) res.diasLimpos++;
    res.detalhes.push(...dia.detalhes.map((d) => `${formatarDataBR(data).slice(0, 5)}: ${d}`));
  }
  return res;
}

