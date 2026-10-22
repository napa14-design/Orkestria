/**
 * Serviço de execuções realizadas (Fase 2).
 *
 * A estrutura completa (tipos, aba no Sheets, API) já existe no MVP para que
 * a Fase 2 seja apenas a construção da tela de acompanhamento.
 */
import { cedidasNaCobertura, cobraDesvio, exigeJustificativa, ocupaHorario } from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { agoraHHMM, hhmmParaMin, hojeISO, intervalosSobrepoem, somarDias } from "@/lib/dateUtils";
import type { ExecucaoRealizada, Perfil, RotinaPlanejada, StatusRealizado, StatusRotina } from "@/types";
import { noQuadro } from "@/lib/desligamento";
import { podeAlterarSede, podeRegistrarRealizado, type SessaoUsuario } from "@/lib/permissions";
import { ausenteEm } from "./ausenciasService";
import { ErroPermissao, ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { getRotinasByData, updateRotina } from "./rotinasService";

/** O que o supervisor (perfil de chão) registra: feita ou não, e como foi feita. */
export const STATUS_DO_SUPERVISOR: readonly StatusRealizado[] = [
  "conforme_planejado",
  "com_atraso",
  "parcial",
  "nao_realizada",
];

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
  /**
   * O titular está ausente no dia: confirmar seria creditar a quem faltou. Fica
   * para o "Feita por…" ou o "Não feita".
   */
  de_ausentes: number;
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
  perfil: Perfil,
): Promise<ResultadoFechamentoDia> {
  const ds = await getDataSource();
  const [rotinas, execucoes, requisitos, tarefas] = await Promise.all([
    getRotinasByData(opts.data, opts.sedeId),
    getExecucoes(opts.data, opts.data, opts.sedeId),
    ds.listar("requisitos"),
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: opts.sedeId }]),
  ]);
  // Por funcionário, como o `ausenteEm`: pela sede gravada na ausência, quem foi
  // transferido depois dela escapava e voltava a ser creditado (revisão de segurança).
  const funcsDoDia = [...new Set(rotinas.map((r) => r.funcionario_id))];
  const ausenciasDoDia = await Promise.all(funcsDoDia.map((id) => ausenteEm(id, opts.data)));
  const ausentes = new Set(funcsDoDia.filter((_, i) => ausenciasDoDia[i]));

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
    de_ausentes: 0,
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
    if (ausentes.has(rotina.funcionario_id)) {
      res.de_ausentes++;
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
      { perfil, confirmacaoRapida: epis.length === 0 },
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

/**
 * Nomes dos EPIs que a tarefa exige — lidos do cadastro, no servidor. A
 * declaração de uso grava ESTES nomes, nunca uma lista vinda do cliente.
 */
export async function episDaTarefa(tarefaId: string): Promise<string[]> {
  const ds = await getDataSource();
  const tarefa = await ds.obter("tarefas", tarefaId);
  const ids = (tarefa?.requisitos ?? "").split(",").filter(Boolean);
  const requisitos = await Promise.all(ids.map((id) => ds.obter("requisitos", id)));
  return [...new Set(requisitos.filter((r) => r?.tipo === "epi").map((r) => r!.nome))];
}

export async function registrarExecucao(
  // sede_id é preenchida aqui a partir da rotina (o cliente não envia).
  dados: Omit<ExecucaoRealizada, "id" | "sede_id" | "criado_em" | "atualizado_em">,
  /**
   * `perfil` é OBRIGATÓRIO de propósito: as restrições do supervisor nascem aqui
   * dentro, e não em cada rota. Quando era opcional, a rota do "✓ Conforme"
   * esqueceu de passar e o supervisor desfazia o cancelamento do coordenador.
   */
  opcoes: { perfil: Perfil; confirmacaoRapida?: boolean },
): Promise<ExecucaoRealizada> {
  const ds = await getDataSource();
  const rotina = await ds.obter("rotinas_planejadas", dados.rotina_id);
  if (!rotina) throw new Error("Rotina planejada não encontrada.");
  // hasOwn, não `in`: `"constructor"`/`"__proto__"` passavam no `in`.
  if (!Object.hasOwn(STATUS_ROTINA_POR_EXECUCAO, dados.status_realizado))
    throw new ErroValidacao([{ nivel: "erro", codigo: "STATUS_INVALIDO", mensagem: "Status do realizado inválido." }]);
  // O supervisor (perfil de chão) só diz se foi feito ou não: "cancelada" e
  // "remanejada" tiram a tarefa da ocupação e do Chromos — quem é medido não
  // apaga o que o mede (revisão, 19/10/2026).
  const restrito = opcoes.perfil === "supervisor";
  if (restrito && !STATUS_DO_SUPERVISOR.includes(dados.status_realizado))
    throw new ErroPermissao("Seu perfil só registra se a tarefa foi feita ou não.");
  // Quem só pode "feita ou não" não desfaz o que o coordenador decidiu: reabrir
  // traria a tarefa de volta à medição. Olha o status da ROTINA, não o registro
  // de execução — o coordenador também cancela direto na rotina (auditoria).
  if (restrito && (rotina.status === "cancelada" || rotina.status === "remanejada"))
    throw new ErroPermissao("Esta tarefa foi cancelada ou remanejada pelo coordenador — só ele altera.");
  // Coberta por colega ("Feita por"): o supervisor não a troca para "não feita"
  // — seria jogar uma falha em quem cobriu (revisão de segurança, 21/10/2026).
  if (restrito && rotina.titular_id && STATUS_ROTINA_POR_EXECUCAO[dados.status_realizado] !== "realizada")
    throw new ErroPermissao("Esta tarefa foi coberta por um colega — só o coordenador muda o registro.");
  // "Foi feita" antes de a tarefa terminar é afirmação sem lastro — mesma régua
  // do "fechar o dia" (`limite` em confirmarDiaComoPlanejado). Para o
  // coordenador, só o que afirma realização: cancelar, remanejar ou "não vai
  // dar" com antecedência é decisão de quem planeja. O supervisor não planeja —
  // nele vale para tudo, "não realizada" inclusive.
  const hoje = hojeISO();
  const limite = rotina.data > hoje ? "00:00" : rotina.data === hoje ? agoraHHMM() : "23:59";
  if ((restrito || STATUS_ROTINA_POR_EXECUCAO[dados.status_realizado] === "realizada") && rotina.fim_planejado > limite)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "AINDA_NAO_TERMINOU", mensagem: "Esta tarefa ainda não terminou — registre depois do horário dela." },
    ]);
  // "Feita" na tarefa de quem tem ausência no dia creditaria a quem faltou: o
  // supervisor usa o "Feita por…". A tela já escondia o botão; isto fecha a
  // chamada direta (auditoria, 21/10/2026). O coordenador passa — dia parcial
  // (saiu mais cedo) é decisão dele, e a tela dele abre em "não feita".
  if (
    restrito &&
    STATUS_ROTINA_POR_EXECUCAO[dados.status_realizado] === "realizada" &&
    (await ausenteEm(rotina.funcionario_id, rotina.data))
  )
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "TITULAR_AUSENTE",
        mensagem: "Quem está nesta tarefa está ausente no dia — use “Feita por…” ou “Não feita”.",
      },
    ]);
  // Campo a campo, e não `...dados`: o corpo do pedido não escolhe id, data nem
  // sede. A data é a da rotina — outra data criava um registro paralelo.
  const comSede: Omit<ExecucaoRealizada, "id" | "criado_em" | "atualizado_em"> = {
    rotina_id: rotina.id,
    sede_id: rotina.sede_id,
    data_execucao: rotina.data,
    status_realizado: dados.status_realizado,
    // String(): o corpo chega cru; objeto ou número no lugar de texto não entra.
    inicio_real: String(dados.inicio_real ?? ""),
    fim_real: String(dados.fim_real ?? ""),
    tempo_real_min: Number(dados.tempo_real_min) || 0,
    justificativa: String(dados.justificativa ?? ""),
    epis_confirmados: String(dados.epis_confirmados ?? ""),
    observacao: String(dados.observacao ?? ""),
    supervisor_id: dados.supervisor_id,
  };

  const parametros = await resolverParametros(rotina.sede_id);
  // Tarefa com "tempo é referência" não cobra desvio (execução varia muito).
  const tarefa = await ds.obter("tarefas", rotina.tarefa_id);

  // O caminho de um toque não pode afirmar uso de EPI sem a declaração humana.
  // A UI já esconde o atalho, e esta validação fecha também chamadas diretas.
  if (opcoes.confirmacaoRapida && tarefa?.requisitos) {
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
    comSede.tempo_real_min > 0 &&
    exigeJustificativa(comSede.tempo_real_min, rotina.tempo_previsto_min, parametros);
  if ((statusQueExigem.includes(comSede.status_realizado) || desvioGrande) && !comSede.justificativa.trim()) {
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
  const registro = comSede;

  // Idempotência: uma execução por (rotina, data). Reenviar a mesma ficha
  // ATUALIZA o registro em vez de duplicar.
  const doRotina = await ds.consultar("execucoes_realizadas", [
    { campo: "rotina_id", op: "==" as const, valor: registro.rotina_id },
  ]);
  const existente = doRotina.find((e) => e.data_execucao === registro.data_execucao);
  // O supervisor corrige o que ELE lançou, não o de outra pessoa: um "não
  // realizada — funcionária ausente" do coordenador virava "feita" por cima, e a
  // justificativa sumia (decisão do dono, 19/10/2026).
  if (restrito && existente && existente.supervisor_id !== registro.supervisor_id)
    throw new ErroPermissao("Este registro foi feito por outra pessoa — só o coordenador altera.");

  // Cancelada/remanejada não ocupa o horário; registrar o realizado a traz de
  // volta. Se outro bloco da pessoa já ocupa aquela faixa (a troca por
  // prioridade põe um ali), recusa — mesma regra do `updateRotina`, que esta
  // porta pulava (auditoria, 20/10/2026).
  const novoStatus = STATUS_ROTINA_POR_EXECUCAO[registro.status_realizado];
  // Tarefa de espera não disputa a pessoa (mesma exceção do `updateRotina`).
  if (!tarefa?.espera && !ocupaHorario(rotina) && ocupaHorario({ status: novoStatus })) {
    const ini = hhmmParaMin(rotina.inicio_planejado);
    const fim = hhmmParaMin(rotina.fim_planejado);
    const sobrepostas = (await getRotinasByData(rotina.data, rotina.sede_id)).filter(
      (r) =>
        r.id !== rotina.id &&
        r.funcionario_id === rotina.funcionario_id &&
        ocupaHorario(r) &&
        intervalosSobrepoem(ini, fim, hhmmParaMin(r.inicio_planejado), hhmmParaMin(r.fim_planejado)),
    );
    let choque: (typeof sobrepostas)[number] | undefined;
    for (const r of sobrepostas) {
      if (!(await ds.obter("tarefas", r.tarefa_id))?.espera) {
        choque = r;
        break;
      }
    }
    if (choque)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "SOBREPOSICAO",
          mensagem: `Esta tarefa saiu do horário e outra já ocupa ${choque.inicio_planejado}–${choque.fim_planejado}. Ajuste na Agenda antes de registrar.`,
        },
      ]);
  }

  let execucao: ExecucaoRealizada;
  if (existente) {
    execucao = await ds.atualizar("execucoes_realizadas", existente.id, {
      ...registro,
      atualizado_em: agora,
    });
  } else {
    // id depois do spread: o do corpo não sobrescreve outro registro (revisão, 14/10/2026).
    execucao = { ...registro, id: novoId(), criado_em: agora, atualizado_em: agora };
    await ds.criar("execucoes_realizadas", execucao);
  }

  // Sincroniza o status da rotina planejada.
  await ds.atualizar("rotinas_planejadas", rotina.id, {
    status: novoStatus,
    atualizado_em: agora,
  });

  return execucao;
}

/**
 * "Feita por <colega>" — a tarefa de quem está ausente foi feita por outra
 * pessoa. Antes, o "Feita" creditava a quem faltou, e só o coordenador, pela
 * Central, conseguia passar a tarefa para quem cobriu (pedido do dono,
 * 21/10/2026: supervisor e coordenador marcam no Acompanhamento).
 *
 * O poder novo do supervisor — mudar de quem é a tarefa — fica preso aqui:
 * só tarefa de quem tem ausência lançada no dia, ainda sem registro, já
 * terminada (e, para o supervisor, de no máximo 7 dias atrás); só para colega
 * da mesma sede, no quadro e presente. A troca passa por `updateRotina`, com
 * as checagens da agenda (gênero, requisito, escala, intervalo, sobreposição)
 * e sem autorização manual. Tudo o que dá para conferir é conferido ANTES da
 * primeira escrita (revisão de segurança, 21/10/2026).
 */
export async function registrarFeitaPor(
  rotinaId: string,
  colegaId: string,
  sessao: SessaoUsuario,
  declaroEpi: boolean,
): Promise<ExecucaoRealizada> {
  const ds = await getDataSource();
  const recusa = (codigo: string, mensagem: string) => new ErroValidacao([{ nivel: "erro", codigo, mensagem }]);
  const rotina = await ds.obter("rotinas_planejadas", rotinaId);
  // Escopo antes de qualquer regra, e a MESMA resposta para "não existe" e "é de
  // outra sede": 403 × 422 dizia quais ids existem fora dela (revisão de segurança).
  if (!rotina || !podeRegistrarRealizado(sessao) || !podeAlterarSede(sessao, rotina.sede_id))
    throw new ErroPermissao("Tarefa não encontrada nas sedes que você opera.");

  if (rotina.status !== "planejada" && rotina.status !== "pendente")
    throw recusa("FEITA_POR_JA_DECIDIDA", "Esta tarefa já foi registrada, cancelada ou remanejada.");
  const registros = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: rotina.id }]);
  if (registros.some((e) => e.data_execucao === rotina.data))
    throw recusa("FEITA_POR_JA_DECIDIDA", "Esta tarefa já tem registro — reabra pelo coordenador.");
  const hoje = hojeISO();
  const limite = rotina.data > hoje ? "00:00" : rotina.data === hoje ? agoraHHMM() : "23:59";
  if (rotina.fim_planejado > limite)
    throw recusa("AINDA_NAO_TERMINOU", "Esta tarefa ainda não terminou — registre depois do horário dela.");
  // O supervisor não reescreve o planejado de meses atrás: a semana que a tela
  // mostra como pendente. O coordenador corrige o resto.
  if (sessao.perfil === "supervisor" && rotina.data < somarDias(hoje, -7))
    throw recusa("FEITA_POR_ANTIGA", "Tarefa de mais de 7 dias — peça ao coordenador.");
  // EPI antes de mexer: a falta da declaração era descoberta só DEPOIS da troca.
  const epis = await episDaTarefa(rotina.tarefa_id);
  if (epis.length > 0 && !declaroEpi)
    throw recusa("EPI_EXIGE_CONFIRMACAO", `Esta tarefa exige EPI: confirme a declaração (${epis.join(", ")}).`);
  if (!(await ausenteEm(rotina.funcionario_id, rotina.data)))
    throw recusa("FEITA_POR_SEM_AUSENCIA", "Só a tarefa de quem está ausente no dia pode ser marcada como feita por outra pessoa.");

  const colega = await ds.obter("funcionarios", colegaId);
  // Uma mensagem só para "não existe" e "é de outra sede": não revela ids alheios.
  if (!colega || colega.sede_id !== rotina.sede_id || colega.id === rotina.funcionario_id || !noQuadro(colega, rotina.data))
    throw recusa("FEITA_POR_COLEGA_INVALIDO", "Escolha um colega da mesma sede, em atividade.");
  // Antes do `updateRotina`: a mensagem de ausência dele cita o TIPO (atestado…).
  if (await ausenteEm(colega.id, rotina.data))
    throw recusa("FEITA_POR_COLEGA_AUSENTE", `${colega.nome} também está ausente neste dia.`);

  const titular = await ds.obter("funcionarios", rotina.funcionario_id);
  const observacaoAntes = rotina.observacao ?? "";
  // Tarefas do colega que encostam na faixa: ele trocou uma pela outra (decisão
  // do dono, 21/10/2026 — quase sempre há, a DT roda a 96%). Só a que cabe
  // INTEIRA na faixa vira remanejada (`cedidasNaCobertura`); a que só encosta
  // fica com ele, e a troca aceita o choque com ela — e só com ela.
  const ini = hhmmParaMin(rotina.inicio_planejado);
  const fim = hhmmParaMin(rotina.fim_planejado);
  const naFaixa = (await getRotinasByData(rotina.data, rotina.sede_id)).filter(
    (r) =>
      r.funcionario_id === colega.id &&
      r.id !== rotina.id &&
      ocupaHorario(r) &&
      intervalosSobrepoem(ini, fim, hhmmParaMin(r.inicio_planejado), hhmmParaMin(r.fim_planejado)),
  );
  const tarefasDaFaixa = new Map(
    await Promise.all(
      [...new Set(naFaixa.map((r) => r.tarefa_id))].map(async (id) => [id, await ds.obter("tarefas", id)] as const),
    ),
  );
  // Crítica do colega inteira na faixa: não sai da medição e, ficando, o
  // "Fechar o dia" confirmaria as duas no mesmo horário. Quem sabe se ela foi
  // feita é o coordenador (decisão do dono, 21/10/2026).
  const critica = naFaixa.find(
    (r) =>
      tarefasDaFaixa.get(r.tarefa_id)?.critica &&
      !tarefasDaFaixa.get(r.tarefa_id)?.espera &&
      hhmmParaMin(r.inicio_planejado) >= ini &&
      hhmmParaMin(r.fim_planejado) <= fim,
  );
  if (critica)
    throw recusa(
      "FEITA_POR_CRITICA",
      `${colega.nome} tem tarefa crítica entre ${critica.inicio_planejado} e ${critica.fim_planejado} — o coordenador decide pela Central do dia.`,
    );
  const cedidas = cedidasNaCobertura(rotina, naFaixa, (id) => tarefasDaFaixa.get(id) ?? undefined);
  // Cedida com decisão (status ou registro) não se mexe: remanejá-la sobrescrevia
  // o registro de outra pessoa — e o desfazer o apagaria.
  const registrosDoDia = new Set(
    (await getExecucoes(rotina.data, rotina.data, rotina.sede_id)).map((e) => e.rotina_id),
  );
  for (const r of cedidas)
    if ((r.status !== "planejada" && r.status !== "pendente") || registrosDoDia.has(r.id))
      throw recusa(
        "FEITA_POR_SOBREPOSICAO_REGISTRADA",
        `${colega.nome} já tem tarefa registrada entre ${r.inicio_planejado} e ${r.fim_planejado} — ajuste pelo coordenador.`,
      );
  const tarefaNome = (await ds.obter("tarefas", rotina.tarefa_id))?.nome_tarefa ?? "a tarefa";

  // Primeiro libera o horário (cedidas remanejadas, com o motivo), depois move:
  // ao contrário, o `updateRotina` veria o choque e recusaria. Qualquer falha
  // daqui em diante desfaz tudo o que este pedido gravou.
  let moveu = false;
  try {
    for (const cedida of cedidas) {
      await registrarExecucao(
        {
          rotina_id: cedida.id,
          data_execucao: cedida.data,
          status_realizado: "remanejada",
          inicio_real: "",
          fim_real: "",
          tempo_real_min: 0,
          justificativa: `${colega.nome} cobriu “${tarefaNome}” de ${titular?.nome ?? "titular"} (ausente) neste horário.`,
          observacao: "Feita por colega no Acompanhamento.",
          supervisor_id: sessao.id,
          epis_confirmados: "",
        },
        // Perfil de quem PLANEJA de propósito: "remanejada" é consequência que o
        // servidor decidiu (a pessoa estava na outra tarefa), não uma escolha
        // livre do supervisor — ele continua sem remanejar pela porta comum. E só
        // entra o que cabe inteiro na faixa coberta, nunca crítica.
        { perfil: "coordenador" },
      );
    }
    // A porta da agenda, sem `forcar`: gênero, requisito, escala, intervalo e
    // sobreposição recusam (menos o choque com as tarefas dele que só encostam);
    // o alerta de sobrecarga passa. Recusa aqui não grava.
    await updateRotina(rotina.id, {
      funcionario_id: colega.id,
      observacao: [observacaoAntes, `Coberta por ${colega.nome} — ${titular?.nome ?? "titular"} ausente`].filter(Boolean).join(" · "),
    }, { ignorarChoqueCom: naFaixa.map((r) => r.id) });
    moveu = true;
    await ds.atualizar("rotinas_planejadas", rotina.id, { titular_id: rotina.funcionario_id, atualizado_em: agoraISO() });
    return await registrarExecucao(
      {
        rotina_id: rotina.id,
        data_execucao: rotina.data,
        status_realizado: "conforme_planejado",
        inicio_real: rotina.inicio_planejado,
        fim_real: rotina.fim_planejado,
        tempo_real_min: rotina.tempo_previsto_min,
        justificativa: "",
        observacao: `Feita por ${colega.nome}, cobrindo a ausência de ${titular?.nome ?? "titular"}.`,
        supervisor_id: sessao.id,
        // Nomes do CADASTRO da tarefa, nunca do cliente (como no "✓ Feita · EPI").
        epis_confirmados: epis.join(", "),
      },
      { perfil: sessao.perfil, confirmacaoRapida: epis.length === 0 },
    );
  } catch (e) {
    // Nenhuma destas tinha registro no dia (conferido acima), então todo
    // registro delas na data é deste pedido — inclusive o que o
    // `registrarExecucao` grava antes de falhar ao mudar o status, que a versão
    // anterior deixava: quem faltou ficava com um "conforme" (auditoria).
    const apagarRegistros = async (rotinaId: string) => {
      const doRotina = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: rotinaId }]);
      for (const ex of doRotina) if (ex.data_execucao === rotina.data) await ds.excluir("execucoes_realizadas", ex.id);
    };
    try {
      // A tarefa não fica no nome do colega sem o realizado que justifica a troca
      // — mas só desfaz se ainda for o colega DESTE pedido: outro pedido em
      // paralelo pode ter gravado depois, e voltar ao titular creditaria a quem faltou.
      // Sem a troca, este pedido não gravou registro da coberta: apagar ali só
      // acharia o de OUTRO pedido, que passou no meio (auditoria).
      const agora = moveu ? await ds.obter("rotinas_planejadas", rotina.id) : null;
      if (moveu && agora?.funcionario_id === colega.id && agora.status !== "realizada") {
        await ds.atualizar("rotinas_planejadas", rotina.id, {
          funcionario_id: rotina.funcionario_id,
          observacao: observacaoAntes,
          titular_id: "",
          status: rotina.status,
          atualizado_em: agoraISO(),
        });
        await apagarRegistros(rotina.id);
      }
      // As cedidas voltam: ninguém perde a tarefa numa cobertura que não aconteceu.
      for (const cedida of cedidas) {
        await apagarRegistros(cedida.id);
        if ((await ds.obter("rotinas_planejadas", cedida.id))?.status === "remanejada")
          await ds.atualizar("rotinas_planejadas", cedida.id, { status: cedida.status, atualizado_em: agoraISO() });
      }
    } catch (desfazer) {
      console.error("[feita-por] não consegui desfazer a cobertura", rotina.id, desfazer);
    }
    throw e;
  }
}
