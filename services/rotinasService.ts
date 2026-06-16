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
import type { AlertaValidacao, Funcionario, RotinaPlanejada, StatusRotina } from "@/types";
import { ausenteEm } from "./ausenciasService";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
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

export interface NovaRotina {
  data: string;
  funcionario_id: string;
  tarefa_id: string;
  inicio_planejado: string;
  observacao?: string;
  /** Autorização manual: rebaixa INTERVALO/SOBREPOSICAO de erro para alerta. */
  forcar?: boolean;
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
  // Firestore: lê só as rotinas DESTA data (índice de campo único); a sede é
  // filtrada em memória sobre esse conjunto já pequeno.
  const doDia = await ds.consultar("rotinas_planejadas", [
    { campo: "data", op: "==", valor: data },
  ]);
  return sedeId ? doDia.filter((r) => r.sede_id === sedeId) : doDia;
}

export async function getRotinasPeriodo(
  de: string,
  ate: string,
  sedeId?: string,
): Promise<RotinaPlanejada[]> {
  const ds = await getDataSource();
  // intervalo sobre o campo `data` (índice de campo único — sem índice composto)
  const noPeriodo = await ds.consultar("rotinas_planejadas", [
    { campo: "data", op: ">=", valor: de },
    { campo: "data", op: "<=", valor: ate },
  ]);
  return sedeId ? noPeriodo.filter((r) => r.sede_id === sedeId) : noPeriodo;
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

  const [local, parametros, rotinasDoDia, categoria] = await Promise.all([
    ds.obter("locais", tarefa.local_id),
    resolverParametros(tarefa.sede_id),
    getRotinasByData(entrada.data),
    tarefa.categoria_id ? ds.obter("categorias", tarefa.categoria_id) : Promise.resolve(null),
  ]);

  // tempo pessoal (planejamento realista) substitui o padrão quando existe
  const tempoPessoal = await getTempoPessoal(entrada.funcionario_id, tarefa.id);
  const previsto =
    tempoPessoal ?? tempoPrevistoMin(tarefa, local ?? undefined, categoria ?? undefined);
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
  });
  const { alertas, autorizou } = aplicarAutorizacaoManual(brutos, entrada.forcar);
  if (temErro(alertas)) throw new ErroValidacao(alertas);

  const agora = agoraISO();
  const rotina: RotinaPlanejada = {
    id: novoId(),
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
  > & { forcar?: boolean },
): Promise<ResultadoRotina> {
  const { forcar, ...dados } = mudancas;
  const ds = await getDataSource();
  const atual = await ds.obter("rotinas_planejadas", id);
  if (!atual) throw new Error("Rotina não encontrada.");

  const destinoFuncId = dados.funcionario_id ?? atual.funcionario_id;
  const destinoData = dados.data ?? atual.data;
  const destinoInicio = dados.inicio_planejado ?? atual.inicio_planejado;

  const [funcionario, tarefa, parametros, rotinasDoDia] = await Promise.all([
    ds.obter("funcionarios", destinoFuncId),
    ds.obter("tarefas", atual.tarefa_id),
    resolverParametros(atual.sede_id),
    getRotinasByData(destinoData),
  ]);
  if (!funcionario) throw new Error("Funcionário não encontrado.");

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
    });
    const resultado = aplicarAutorizacaoManual(brutos, forcar);
    alertas = resultado.alertas;
    if (temErro(alertas)) throw new ErroValidacao(alertas);
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

  for (const dataDestino of datasDestino) {
    if (dataDestino === dataOrigem) continue;
    const existentes = await getRotinasByData(dataDestino);
    const ocupados = existentes.filter((r) => r.status !== "cancelada");
    const presencaCache = new Map<string, boolean>();

    for (const r of origem) {
      // não copia para funcionário ausente na data de destino
      let presente = presencaCache.get(r.funcionario_id);
      if (presente === undefined) {
        presente = (await ausenteEm(r.funcionario_id, dataDestino)) === null;
        presencaCache.set(r.funcionario_id, presente);
      }
      if (!presente) {
        puladas++;
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
      const copia = {
        ...r,
        id: novoId(),
        data: dataDestino,
        status: "planejada" as StatusRotina,
        supervisor_id: supervisorId,
        criado_em: agora,
        atualizado_em: agora,
      };
      await ds.criar("rotinas_planejadas", copia);
      ocupados.push(copia); // evita que duas cópias do mesmo lote se sobreponham
      copiadas++;
    }
  }
  return { copiadas, puladas };
}
