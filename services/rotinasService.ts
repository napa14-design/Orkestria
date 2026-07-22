/**
 * Serviço de rotinas planejadas — o coração do sistema.
 *
 * O servidor SEMPRE recalcula tempo previsto, blocos e horário de fim a
 * partir da tarefa/local/parâmetros (nunca confia nos números do cliente)
 * e revalida conflitos antes de gravar.
 */
import {
  blocosOcupados,
  funcionarioNoDia,
  jornadaDoDia,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { hhmmParaMin, minParaHHMM } from "@/lib/dateUtils";
import { temErro, validarAlocacao, validarRotina } from "@/lib/validations";
import type { AlertaValidacao, Funcionario, RotinaPlanejada } from "@/types";
import { ausenteEm } from "./ausenciasService";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { getQualificacoesDoFuncionario } from "./qualificacoesService";
import { getTempoPessoal } from "./temposPersonalizadosService";

const ROTULO_AUSENCIA: Record<string, string> = {
  falta: "falta",
  atestado: "atestado",
  ferias: "férias",
  folga: "folga",
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

export interface NovaRotina {
  data: string;
  funcionario_id: string;
  tarefa_id: string;
  inicio_planejado: string;
  observacao?: string;
  /** Id fixo (determinístico) — usado só pela materialização; manual usa aleatório. */
  idFixo?: string;
  /** Autorização manual: rebaixa INTERVALO/SOBREPOSICAO de erro para alerta. */
  forcar?: boolean;
  /**
   * Duração (min) informada na alocação — só é respeitada para tarefas de
   * presença/plantão ou regra "manual", cuja duração varia por dia. Para as
   * demais o servidor sempre calcula (m² × ambiente × serviço).
   */
  duracao_min?: number;
}

const CODIGOS_AUTORIZAVEIS = new Set(["INTERVALO", "SOBREPOSICAO"]);

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

export async function createRotina(
  entrada: NovaRotina,
  supervisorId: string,
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
      : tempoPessoal ?? tempoPrevistoMin(tarefa, local ?? undefined);
  const visual = tempoVisualMin(previsto, parametros.bloco_agenda_min);
  const inicioMin = hhmmParaMin(entrada.inicio_planejado);
  const fimMin = inicioMin + visual;

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
  });
  const { alertas, autorizou } = aplicarAutorizacaoManual(brutos, entrada.forcar);
  if (temErro(alertas)) throw new ErroValidacao(alertas);

  const agora = agoraISO();
  const rotina: RotinaPlanejada = {
    id: entrada.idFixo ?? novoId(),
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
): Promise<ResultadoRotina> {
  const { forcar, bloquearAlertas, ...dados } = mudancas;
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
  const fimMin = inicioMin + novoVisual;

  let alertas: AlertaValidacao[] = [];
  const mudouPosicao =
    dados.inicio_planejado !== undefined ||
    dados.funcionario_id !== undefined ||
    dados.data !== undefined ||
    redimensionou;

  if (mudouPosicao) {
    await exigirPresenca(funcionario.id, funcionario.nome, destinoData);
    exigirEscala(funcionario, destinoData);
    const brutos = validarAlocacao({
      funcionario: funcionarioNoDia(funcionario, destinoData),
      rotinasExistentes: rotinasDoDia.filter(
        (r) => r.funcionario_id === destinoFuncId && r.id !== id,
      ),
      inicioMin,
      fimMin,
      tarefa: tarefa ?? undefined,
      local: local ?? undefined,
      parametros,
      tempoPrevistoNovo: novoPrevisto,
      requisitosCatalogo,
      qualificacoesFuncionario,
      data: destinoData,
    });
    const resultado = aplicarAutorizacaoManual(brutos, forcar);
    alertas = resultado.alertas;
    if (temErro(alertas) || (bloquearAlertas && alertas.length > 0))
      throw new ErroValidacao(alertas);
  }

  const rotina = await ds.atualizar("rotinas_planejadas", id, {
    ...dados,
    tempo_previsto_min: novoPrevisto,
    tempo_visual_min: novoVisual,
    blocos_ocupados: blocosOcupados(novoPrevisto, parametros.bloco_agenda_min),
    fim_planejado: mudouPosicao ? minParaHHMM(fimMin) : atual.fim_planejado,
    atualizado_em: agoraISO(),
  });
  return { rotina, alertas };
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
): Promise<{ copiadas: number; puladas: number }> {
  const ds = await getDataSource();
  const origem = (await getRotinasByData(dataOrigem, sedeId)).filter(
    (r) => r.status !== "cancelada",
  );
  const agora = agoraISO();
  let copiadas = 0;
  let puladas = 0;

  // Idempotência: não recria uma rotina idêntica (mesmo funcionário+tarefa+
  // início) que já exista no destino — blinda contra duplicar/gerar repetidos.
  const chave = (r: { funcionario_id: string; tarefa_id: string; inicio_planejado: string }) =>
    `${r.funcionario_id}|${r.tarefa_id}|${r.inicio_planejado}`;
  const idsFunc = [...new Set(origem.map((r) => r.funcionario_id))];

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
  }
  return { copiadas, puladas };
}
