/**
 * Serviço de execuções realizadas (Fase 2).
 *
 * A estrutura completa (tipos, aba no Sheets, API) já existe no MVP para que
 * a Fase 2 seja apenas a construção da tela de acompanhamento.
 */
import { cobraDesvio, exigeJustificativa } from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { agoraHHMM, hojeISO } from "@/lib/dateUtils";
import type { ExecucaoRealizada, StatusRealizado, StatusRotina } from "@/types";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { getRotinasByData } from "./rotinasService";

const STATUS_ROTINA_POR_EXECUCAO: Record<StatusRealizado, StatusRotina> = {
  conforme_planejado: "realizada",
  com_atraso: "realizada",
  parcial: "realizada",
  nao_realizada: "nao_realizada",
  remanejada: "remanejada",
  cancelada: "cancelada",
};

export async function getExecucoes(
  de?: string,
  ate?: string,
  sedeId?: string,
): Promise<ExecucaoRealizada[]> {
  const ds = await getDataSource();
  // Com sede: composta (sede_id + intervalo em data_execucao) → lê só as
  // execuções daquela sede (índice composto em firestore.indexes.json). Sem
  // sede: range só em data_execucao.
  const cond = [];
  if (sedeId) cond.push({ campo: "sede_id", op: "==" as const, valor: sedeId });
  if (de) cond.push({ campo: "data_execucao", op: ">=" as const, valor: de });
  if (ate) cond.push({ campo: "data_execucao", op: "<=" as const, valor: ate });
  return cond.length
    ? ds.consultar("execucoes_realizadas", cond)
    : ds.listar("execucoes_realizadas");
}

export interface ResultadoFechamentoDia {
  confirmadas: number;
  /** Já tinham registro: o fechamento não mexe no que foi decidido antes. */
  ja_registradas: number;
  /** O horário ainda não terminou — confirmar seria afirmar o que não aconteceu. */
  aguardando_horario: number;
  /** Exigem EPI e a declaração não foi feita. */
  sem_declaracao: number;
  /** EPIs que a declaração cobriu, por nome, para ecoar na tela. */
  epis_declarados: string[];
}

/**
 * **Fecha o dia por exceção**: confirma como planejado tudo o que já passou do
 * horário e ainda não tem registro.
 *
 * Por que existe: confirmar era **uma ação por bloco**. Numa sede de 277 blocos,
 * a hipótese da doutrina ("validar o dia comum em até 5 minutos") era
 * aritmeticamente impossível — 277 cliques a 1s dão 4m37s antes de ler qualquer
 * coisa. O custo passa a ser **1 + desvios**.
 *
 * **Nunca sobrescreve decisão anterior**: bloco com registro é contado e deixado
 * como está. O supervisor registra os desvios primeiro; isto fecha o resto.
 *
 * **EPI**: 53% a 68% dos itens das rotas reais exigem EPI, e o caminho de um toque
 * não pode afirmar uso de EPI (a validação do servidor barra). Então esses blocos
 * só entram com `declararEpi`, e aí `epis_confirmados` recebe os **nomes** dos EPIs
 * da tarefa — a mesma semântica da ficha ORK3, onde uma declaração nominal cobre o
 * dia inteiro em vez de uma caixa por tarefa. Sem a declaração, eles são pulados e
 * contados, nunca confirmados em silêncio.
 */
export async function confirmarDiaComoPlanejado(
  opts: { sedeId: string; data: string; declararEpi?: boolean },
  supervisorId: string,
): Promise<ResultadoFechamentoDia> {
  const ds = await getDataSource();
  const [rotinas, execucoes, requisitos, tarefas] = await Promise.all([
    getRotinasByData(opts.data, opts.sedeId),
    getExecucoes(opts.data, opts.data, opts.sedeId),
    ds.listar("requisitos"),
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: opts.sedeId }]),
  ]);

  const jaRegistrada = new Set(execucoes.map((e) => e.rotina_id));
  const nomeDoEpi = new Map(requisitos.filter((r) => r.tipo === "epi").map((r) => [r.id, r.nome]));
  const tMap = new Map(tarefas.map((t) => [t.id, t]));
  const episDaTarefa = (tarefaId: string): string[] =>
    (tMap.get(tarefaId)?.requisitos ?? "")
      .split(",")
      .filter(Boolean)
      .map((id) => nomeDoEpi.get(id))
      .filter((n): n is string => !!n);

  // Só o que já terminou. Três casos, e juntar dois deles era um bug: com
  // `data >= hoje`, um dia FUTURO usava a hora de agora como limite e confirmava
  // como realizado o que ainda não tinha acontecido.
  const hoje = hojeISO();
  const limite = opts.data > hoje ? "00:00" : opts.data === hoje ? agoraHHMM() : "23:59";

  const res: ResultadoFechamentoDia = {
    confirmadas: 0,
    ja_registradas: 0,
    aguardando_horario: 0,
    sem_declaracao: 0,
    epis_declarados: [],
  };
  const declarados = new Set<string>();
  const aConfirmar: Array<{ rotina: (typeof rotinas)[number]; epis: string[] }> = [];

  for (const rotina of rotinas) {
    // A ordem importa: registrar um desvio muda o `status` da rotina, então
    // checar status antes de contar fazia o bloco desaparecer da conta — as somas
    // não fechavam com o total do dia e ninguém saberia dizer por quê.
    if (jaRegistrada.has(rotina.id) || (rotina.status !== "planejada" && rotina.status !== "pendente")) {
      res.ja_registradas++;
      continue;
    }
    if (rotina.fim_planejado > limite) {
      res.aguardando_horario++;
      continue;
    }
    const epis = episDaTarefa(rotina.tarefa_id);
    if (epis.length > 0 && !opts.declararEpi) {
      res.sem_declaracao++;
      continue;
    }
    for (const e of epis) declarados.add(e);
    aConfirmar.push({ rotina, epis });
  }

  await emLotes(aConfirmar, ({ rotina, epis }) =>
    registrarExecucao(
      {
        rotina_id: rotina.id,
        data_execucao: rotina.data,
        status_realizado: "conforme_planejado",
        inicio_real: rotina.inicio_planejado,
        fim_real: rotina.fim_planejado,
        tempo_real_min: rotina.tempo_previsto_min,
        justificativa: "",
        observacao:
          epis.length > 0
            ? "Fechamento do dia: conforme o planejamento, com declaração de EPI do supervisor."
            : "Fechamento do dia: conforme o planejamento.",
        supervisor_id: supervisorId,
        epis_confirmados: epis.join(", "),
      },
      // Sem atalho quando há EPI: aí a declaração é de verdade, e o servidor
      // deve tratá-la como o formulário completo.
      { confirmacaoRapida: epis.length === 0 },
    ),
  );
  res.confirmadas = aConfirmar.length;
  res.epis_declarados = [...declarados].sort();
  return res;
}

/** Lotes paralelos: um dia cheio tem centenas de blocos. */
async function emLotes<T>(itens: T[], fn: (x: T) => Promise<unknown>, lote = 25): Promise<void> {
  for (let i = 0; i < itens.length; i += lote) {
    await Promise.all(itens.slice(i, i + lote).map(fn));
  }
}

export async function registrarExecucao(
  // sede_id é preenchida aqui a partir da rotina (o cliente não envia).
  dados: Omit<ExecucaoRealizada, "id" | "sede_id" | "criado_em" | "atualizado_em">,
  opcoes?: { confirmacaoRapida?: boolean },
): Promise<ExecucaoRealizada> {
  const ds = await getDataSource();
  const rotina = await ds.obter("rotinas_planejadas", dados.rotina_id);
  if (!rotina) throw new Error("Rotina planejada não encontrada.");
  const comSede = { ...dados, sede_id: rotina.sede_id };

  const parametros = await resolverParametros(rotina.sede_id);
  // Tarefa com "tempo é referência" não cobra desvio (execução varia muito).
  const tarefa = await ds.obter("tarefas", rotina.tarefa_id);

  // O caminho de um toque não pode afirmar uso de EPI sem a declaração humana.
  // A UI já esconde o atalho, e esta validação fecha também chamadas diretas.
  if (opcoes?.confirmacaoRapida && tarefa?.requisitos) {
    const requisitos = await Promise.all(
      tarefa.requisitos
        .split(",")
        .filter(Boolean)
        .map((id) => ds.obter("requisitos", id)),
    );
    if (requisitos.some((requisito) => requisito?.tipo === "epi")) {
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "EPI_EXIGE_CONFIRMACAO",
          mensagem: "Esta tarefa exige confirmação de EPI no formulário completo.",
        },
      ]);
    }
  }

  // Regras de justificativa obrigatória.
  const statusQueExigem: StatusRealizado[] = ["nao_realizada", "remanejada", "cancelada"];
  const desvioGrande =
    cobraDesvio(tarefa) &&
    dados.tempo_real_min > 0 &&
    exigeJustificativa(dados.tempo_real_min, rotina.tempo_previsto_min, parametros);
  if ((statusQueExigem.includes(dados.status_realizado) || desvioGrande) && !dados.justificativa.trim()) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "JUSTIFICATIVA_OBRIGATORIA",
        mensagem: desvioGrande
          ? `Desvio acima de ${parametros.desvio_justificativa_percentual}% do previsto exige justificativa.`
          : "Este status exige justificativa.",
      },
    ]);
  }

  const agora = agoraISO();
  const registro = { ...comSede, epis_confirmados: comSede.epis_confirmados ?? "" };

  // Idempotência: uma execução por (rotina, data). Reenviar a mesma ficha
  // ATUALIZA o registro em vez de duplicar.
  const doRotina = await ds.consultar("execucoes_realizadas", [
    { campo: "rotina_id", op: "==" as const, valor: registro.rotina_id },
  ]);
  const existente = doRotina.find((e) => e.data_execucao === registro.data_execucao);

  let execucao: ExecucaoRealizada;
  if (existente) {
    execucao = await ds.atualizar("execucoes_realizadas", existente.id, {
      ...registro,
      atualizado_em: agora,
    });
  } else {
    execucao = { id: novoId(), ...registro, criado_em: agora, atualizado_em: agora };
    await ds.criar("execucoes_realizadas", execucao);
  }

  // Sincroniza o status da rotina planejada.
  await ds.atualizar("rotinas_planejadas", rotina.id, {
    status: STATUS_ROTINA_POR_EXECUCAO[registro.status_realizado],
    atualizado_em: agora,
  });

  return execucao;
}
