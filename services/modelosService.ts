/**
 * Modelos de rotina (templates): salvar o dia montado com um nome e
 * reaplicá-lo em qualquer data ou período. A aplicação reaproveita
 * createRotina, então todas as validações de alocação continuam valendo —
 * itens que conflitam são pulados e contabilizados.
 */
import {
  blocosOcupados,
  feriadoDoDia,
  statusPeriodoLetivo,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { agoraISO, getDataSource, type OperacaoLote } from "@/lib/datasource";
import {
  diaDaSemana,
  formatarDataBR,
  hhmmParaMin,
  minParaHHMM,
  parseDiasSemana,
  rotularDiasSemana,
  serializarDiasSemana,
} from "@/lib/dateUtils";
import {
  compararRotaComODia,
  type ContextoProjecao,
  type ItemDescartado,
  type MotivoDescarte,
  projetarDiaDaRota,
} from "@/lib/projecaoDia";
import { resumirProblemas, validarDia } from "@/lib/validacaoDoDia";
import type { ModeloRotinaItem, RotinaPlanejada, Tarefa } from "@/types";
import { ausenteEm } from "./ausenciasService";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { mapaFatorDoTipo } from "./tiposLocalService";
import {
  createRotina,
  getRotinasByData,
  idDeItemDaRota,
  idItemDeRota,
  idMaterializacao,
} from "./rotinasService";

/** Executa `fn` em lotes paralelos (evita centenas de escritas sequenciais). */
async function emLotes<T>(itens: T[], fn: (x: T) => Promise<unknown>, lote = 25): Promise<void> {
  for (let i = 0; i < itens.length; i += lote) {
    await Promise.all(itens.slice(i, i + lote).map(fn));
  }
}

export interface ResumoModelo {
  nome_modelo: string;
  sede_id: string;
  itens: number;
  padrao: boolean;
  /** Modelo de evento (formatura, feira…) — aplicado sob demanda, nunca no "Gerar o dia". */
  evento: boolean;
  /** Dias em que esta camada vale (CSV numérico). Vazio = todo dia. */
  dias_semana: string;
  /** Nos dias em que vale, substitui o dia inteiro em vez de acrescentar. */
  substitui: boolean;
  criado_por: string;
  criado_em: string;
  /** Faixa de horário do modelo (menor início / maior fim) — só para exibição. */
  inicio?: string;
  fim?: string;
}

export async function getModelos(sedeId?: string): Promise<ResumoModelo[]> {
  const ds = await getDataSource();
  const itens = sedeId
    ? await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
    : await ds.listar("modelos_rotina");
  const grupos = new Map<string, ResumoModelo>();
  // Faixa de horário por grupo, em minutos (o fim usa a duração quando o
  // modelo a preservou; sem ela, o próprio início é o melhor palpite).
  const faixa = new Map<string, { ini: number; fim: number }>();
  for (const item of itens) {
    const chave = `${item.sede_id}::${item.nome_modelo}`;
    const atual = grupos.get(chave);
    if (atual) {
      atual.itens++;
      if (item.padrao) atual.padrao = true;
      if (item.evento) atual.evento = true;
      if (item.dias_semana) atual.dias_semana = item.dias_semana;
      if (item.substitui) atual.substitui = true;
    } else
      grupos.set(chave, {
        nome_modelo: item.nome_modelo,
        sede_id: item.sede_id,
        itens: 1,
        padrao: item.padrao === true,
        evento: item.evento === true,
        dias_semana: item.dias_semana ?? "",
        substitui: item.substitui === true,
        criado_por: item.criado_por,
        criado_em: item.criado_em,
      });

    const ini = hhmmParaMin(item.inicio_planejado);
    if (!Number.isNaN(ini)) {
      // duração inválida (célula não numérica no Sheets) não pode virar NaN e
      // contaminar o rótulo da faixa inteira.
      const dur = Number(item.duracao_min);
      const fim = ini + (Number.isFinite(dur) && dur > 0 ? dur : 0);
      const f = faixa.get(chave);
      if (!f) faixa.set(chave, { ini, fim });
      else {
        f.ini = Math.min(f.ini, ini);
        f.fim = Math.max(f.fim, fim);
      }
    }
  }
  for (const [chave, g] of grupos) {
    const f = faixa.get(chave);
    if (f) {
      g.inicio = minParaHHMM(f.ini);
      g.fim = minParaHHMM(f.fim);
    }
  }
  return [...grupos.values()].sort((a, b) => a.nome_modelo.localeCompare(b.nome_modelo));
}

/** Itens da "rota padrão" da sede (modelo marcado como padrão), ou []. */
export async function getRotaPadrao(sedeId: string): Promise<ModeloRotinaItem[]> {
  const ds = await getDataSource();
  const itens = await ds.consultar("modelos_rotina", [
    { campo: "sede_id", op: "==", valor: sedeId },
  ]);
  // `!m.evento` é cinto de segurança: salvarModelo já impede padrão+evento, mas
  // dado antigo/importado não pode fazer o "Gerar o dia" montar um evento.
  return itens.filter((m) => m.padrao === true && !m.evento);
}

/**
 * Salva o dia como modelo; se o nome já existir na sede, sobrescreve.
 * `opts.padrao` marca como a rota padrão da sede (desmarca as outras).
 * `opts.comDuracao` preserva a duração de tarefas de presença/manual (que
 * variam por dia) — as demais são recalculadas na geração.
 */
export async function salvarModelo(
  nome: string,
  dataOrigem: string,
  sedeId: string,
  autor: string,
  opts: {
    padrao?: boolean;
    comDuracao?: boolean;
    evento?: boolean;
    diasSemana?: string;
    substitui?: boolean;
  } = {},
): Promise<{ itens: number }> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "MODELO_SEM_NOME", mensagem: "Informe um nome para o modelo." },
    ]);
  if (opts.padrao && opts.evento)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "MODELO_EVENTO_PADRAO",
        mensagem:
          "Um modelo de evento não pode ser a rota padrão da sede: o \"Gerar o dia\" passaria a montar a programação do evento todo dia.",
      },
    ]);
  const rotinas = (await getRotinasByData(dataOrigem, sedeId)).filter(
    (r) => r.status !== "cancelada",
  );
  if (rotinas.length === 0)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "MODELO_VAZIO",
        mensagem: `Não há rotinas em ${dataOrigem} para salvar como modelo.`,
      },
    ]);

  // Normaliza os dias: "3,1,1" → "1,3". Item sem dias vale todo dia.
  const diasLimpos = serializarDiasSemana(parseDiasSemana(opts.diasSemana));
  if (opts.substitui && !diasLimpos)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SUBSTITUI_SEM_DIAS",
        mensagem:
          "Uma rota que substitui o dia precisa dizer em quais dias ela vale — substituir todo dia é a própria rota de todo dia.",
      },
    ]);
  if (opts.evento && diasLimpos)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "MODELO_EVENTO_COM_DIAS",
        mensagem:
          "Modelo de evento não tem dia da semana: ele é aplicado na data do evento, sob demanda.",
      },
    ]);

  const ds = await getDataSource();
  const agora = agoraISO();
  const todos = await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }]);
  // Itens do mesmo nome: removidos DEPOIS de criar os novos, para não destruir a
  // rota padrão se algo falhar no meio (create-then-delete, não delete-then-create).
  const antigos = todos.filter((m) => m.nome_modelo === nomeLimpo);
  // Sobrescrever o modelo que É a rota padrão sem remarcá-lo deixaria a sede sem
  // rota padrão em silêncio (o "Gerar o dia" pararia de achar o quê gerar).
  // Duas camadas substituindo o MESMO dia não têm resolução possível: o dia
  // seria montado por uma das duas, arbitrariamente. Barra na entrada.
  if (opts.substitui) {
    const diasNovos = parseDiasSemana(diasLimpos);
    const conflitante = todos.find(
      (m) =>
        m.padrao &&
        m.substitui &&
        m.nome_modelo !== nomeLimpo &&
        parseDiasSemana(m.dias_semana).some((d) => diasNovos.includes(d)),
    );
    if (conflitante)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "DUAS_CAMADAS_SUBSTITUEM",
          mensagem: `"${conflitante.nome_modelo}" já substitui o dia em ${rotularDiasSemana(conflitante.dias_semana)}. Duas rotas não podem substituir o mesmo dia — mude os dias, ou salve esta como rota que acrescenta.`,
        },
      ]);
  }
  if (!opts.padrao && antigos.some((m) => m.padrao))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "MODELO_SOBRESCREVE_PADRAO",
        mensagem: `"${nomeLimpo}" é a rota padrão desta sede. Para substituí-la, marque também "rota padrão"; para criar outro modelo, use um nome diferente.`,
      },
    ]);

  // Número da ocorrência de cada par pessoa+tarefa, na ordem do dia: é o que
  // permite o id do item ser estável sem depender do horário.
  const ocorrencia = new Map<string, number>();
  const ordenadas = [...rotinas].sort((a, b) =>
    hhmmParaMin(a.inicio_planejado) - hhmmParaMin(b.inicio_planejado),
  );
  const numeroDaOcorrencia = new Map<string, number>();
  for (const r of ordenadas) {
    const par = `${r.funcionario_id}|${r.tarefa_id}`;
    const n = (ocorrencia.get(par) ?? 0) + 1;
    ocorrencia.set(par, n);
    numeroDaOcorrencia.set(r.id, n);
  }

  const novos: ModeloRotinaItem[] = rotinas.map((r) => ({
    id: idItemDeRota(nomeLimpo, r.funcionario_id, r.tarefa_id, numeroDaOcorrencia.get(r.id) ?? 1),
    nome_modelo: nomeLimpo,
    sede_id: sedeId,
    funcionario_id: r.funcionario_id,
    tarefa_id: r.tarefa_id,
    local_id: r.local_id,
    inicio_planejado: r.inicio_planejado,
    // Snapshot fiel da duração planejada — a geração reproduz o dia exatamente,
    // sem recalcular (evita divergência por fator de serviço/intensidade).
    ...(opts.comDuracao ? { duracao_min: r.tempo_previsto_min } : {}),
    ...(opts.padrao ? { padrao: true } : {}),
    ...(opts.evento ? { evento: true } : {}),
    ...(diasLimpos ? { dias_semana: diasLimpos } : {}),
    ...(opts.substitui ? { substitui: true } : {}),
    criado_por: autor,
    criado_em: agora,
  }));

  // 1) cria os novos; 2) remove os antigos do mesmo nome — em lotes paralelos.
  //
  // **Não desmarca mais as outras camadas padrão.** A rota padrão da sede passou a
  // ser a UNIÃO das camadas marcadas como padrão, cada uma com seus dias: a de
  // todo dia mais a de segunda mais a de sábado. Desmarcar as demais era o que
  // impedia isso — salvar a camada da terça apagava a da segunda em silêncio.
  await emLotes(novos, (item) => ds.criar("modelos_rotina", item));
  // Só os órfãos: com id estável, a maioria dos "antigos" tem o MESMO id dos novos
  // — apagar por lista cegamente deletaria o que acabou de ser gravado.
  const idsNovos = new Set(novos.map((n) => n.id));
  await emLotes(
    antigos.filter((m) => !idsNovos.has(m.id)),
    (m) => ds.excluir("modelos_rotina", m.id),
  );
  return { itens: rotinas.length };
}

export interface ResultadoAplicacao {
  criadas: number;
  puladas: number;
  detalhes: string[];
}

/** Aplica o modelo em uma ou mais datas; conflitos são pulados, não erram. */
export async function aplicarModelo(
  nome: string,
  sedeId: string,
  datas: string[],
  supervisorId: string,
): Promise<ResultadoAplicacao> {
  const ds = await getDataSource();
  const itens = (
    await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
  ).filter((m) => m.nome_modelo === nome);
  if (itens.length === 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "MODELO_INEXISTENTE", mensagem: `Modelo "${nome}" não encontrado.` },
    ]);

  // Catálogo de tarefas da sede — para respeitar a frequência semanal por data.
  const tMap = new Map(
    (await ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: sedeId }])).map((t) => [t.id, t]),
  );
  const resultado: ResultadoAplicacao = { criadas: 0, puladas: 0, detalhes: [] };
  const chave = (f: string, t: string, i: string) => `${f}|${t}|${i}`;
  for (const data of datas) {
    const dow = diaDaSemana(data);
    // Idempotência: não recria itens que já existem na data (rodar 2× é seguro).
    const jaTem = new Set(
      (await getRotinasByData(data, sedeId))
        .filter((r) => r.status !== "cancelada")
        .map((r) => chave(r.funcionario_id, r.tarefa_id, r.inicio_planejado)),
    );
    for (const item of itens) {
      if (jaTem.has(chave(item.funcionario_id, item.tarefa_id, item.inicio_planejado))) {
        resultado.puladas++;
        continue;
      }
      // tarefa semanal só nos dias configurados
      const tItem = tMap.get(item.tarefa_id);
      if (tItem?.frequencia === "semanal") {
        const dias = parseDiasSemana(tItem.dias_semana);
        if (dias.length && !dias.includes(dow)) {
          resultado.puladas++;
          continue;
        }
      }
      try {
        await createRotina(
          {
            data,
            funcionario_id: item.funcionario_id,
            tarefa_id: item.tarefa_id,
            inicio_planejado: item.inicio_planejado,
            duracao_min: item.duracao_min,
            observacao: `Modelo: ${nome}`,
            idFixo: idMaterializacao(data, item.funcionario_id, item.tarefa_id, item.inicio_planejado),
          },
          supervisorId,
        );
        resultado.criadas++;
      } catch (e) {
        resultado.puladas++;
        if (e instanceof ErroValidacao && resultado.detalhes.length < 8) {
          resultado.detalhes.push(`${data} ${item.inicio_planejado}: ${e.message}`);
        }
      }
    }
  }
  return resultado;
}

export interface ResultadoGeracao {
  semRota?: boolean;
  /** Nome do feriado/recesso que fecha o dia. Presente = nada foi gerado. */
  fechado?: string;
  geradas: number;
  /** Blocos alinhados à rota (ela mudou de horário/duração depois de gerado). */
  atualizadas?: number;
  puladas: number;
  /**
   * Blocos que a agenda MANUAL teria recusado (sobreposição, dentro do
   * intervalo, requisito faltando, restrição de gênero). Não impede a geração —
   * rota que não cabe é o dado que interessa —, mas para de sair em silêncio.
   */
  comProblema?: number;
  detalhes: string[];
}

/**
 * Gera o dia a partir da rota padrão da sede. A rota é dado já validado, então
 * a reproduzimos **fielmente** (tempo exato, sem re-encaixar na grade de 15 min —
 * o que criaria sobreposições artificiais em rotas finas de 5/10 min). Idempotente
 * (não recria item já existente). Adapta: pula ausentes, dias de folga (escala) e
 * tarefas que dependem do calendário fora do período letivo.
 */
export async function gerarDiaDaRotaPadrao(
  sedeId: string,
  data: string,
  supervisorId: string,
): Promise<ResultadoGeracao> {
  const carregado = await carregarRotaEContexto(sedeId, data);
  if (!carregado) return { semRota: true, geradas: 0, puladas: 0, detalhes: [] };
  // Dia fechado não se monta: recusa em vez de gerar zero em silêncio, para a
  // pessoa saber que o sistema sabe.
  if (carregado.feriado)
    return { fechado: carregado.feriado.nome, geradas: 0, puladas: 0, detalhes: [] };
  const { itens, ctx, locais, params } = carregado;

  const { materializar, atualizar, descartados } = projetarDiaDaRota(itens, ctx);

  const res: ResultadoGeracao = {
    geradas: 0,
    puladas: descartados.length,
    detalhes: explicarDescartes(descartados, ctx),
  };

  const ds = await getDataSource();
  const agora = agoraISO();

  // Uma leitura só para o dia inteiro, não uma por item.
  const fatorDoTipo = await mapaFatorDoTipo();

  /** Tempo previsto do item: a duração do snapshot, ou o cálculo da tarefa. */
  const previstoDoItem = (it: ModeloRotinaItem) =>
    it.duracao_min ??
    tempoPrevistoMin(ctx.tarefas.get(it.tarefa_id)!, locais.get(it.local_id) ?? undefined, fatorDoTipo);

  const medidas = (inicio: string, previsto: number) => ({
    inicio_planejado: inicio,
    fim_planejado: minParaHHMM(hhmmParaMin(inicio) + previsto),
    tempo_previsto_min: previsto,
    tempo_visual_min: tempoVisualMin(previsto, params.bloco_agenda_min),
    blocos_ocupados: blocosOcupados(previsto, params.bloco_agenda_min),
  });

  // Alinha à rota o bloco que ela mesma gerou e ninguém tocou. É o conserto do
  // defeito antigo: mover 08:00 → 09:00 na rota deixava o bloco das 08:00 no dia
  // e criava outro às 09:00.
  // Alinhamentos e criações vão num LOTE só, no fim: gerar o dia é uma operação,
  // não N. Se algo falha no meio, o dia não fica metade alinhado e metade não.
  const escritas: OperacaoLote[] = atualizar.map(({ item, bloco }) => {
    const previsto = previstoDoItem(item);
    return {
      tipo: "atualizar" as const,
      tabela: "rotinas_planejadas" as const,
      id: bloco.id,
      mudancas: {
        ...medidas(item.inicio_planejado, previsto),
        origem_inicio: item.inicio_planejado,
        atualizado_em: agora,
      },
    };
  });
  res.atualizadas = atualizar.length;

  const aCriar: RotinaPlanejada[] = materializar.map((it) => {
    const previsto = previstoDoItem(it);
    return {
      id: idDeItemDaRota(data, it.id),
      data,
      funcionario_id: it.funcionario_id,
      sede_id: sedeId,
      tarefa_id: it.tarefa_id,
      local_id: it.local_id,
      ...medidas(it.inicio_planejado, previsto),
      status: "planejada",
      observacao: "Rota padrão",
      supervisor_id: supervisorId,
      criado_em: agora,
      atualizado_em: agora,
      // Proveniência: de qual item da rota veio, e o que a rota dizia na hora.
      origem_item_id: it.id,
      origem_inicio: it.inicio_planejado,
    };
  });

  for (const r of aCriar) escritas.push({ tipo: "criar", tabela: "rotinas_planejadas", registro: r });
  await ds.gravarLote(escritas);
  res.geradas = aCriar.length;

  // Confere o dia com as MESMAS regras do arrasto manual. A premissa antiga
  // ("a rota é dado já validado") não vale quando a rota nasceu de importação,
  // que também não validava — e foi por aí que 38 sobreposições entraram.
  const problemas = validarDia({
    // Relê em vez de somar `ctx.blocosDoDia + aCriar`: os blocos que a rota
    // ALINHOU acabaram de mudar de horário, e o contexto ainda tem o antigo.
    blocos: await getRotinasByData(data, sedeId),
    funcionarios: ctx.funcionarios,
    tarefas: ctx.tarefas,
    locais,
    parametros: params,
    data,
    ...(await contextoDeRequisitos(ctx.tarefas, sedeId)),
  });
  if (problemas.length) {
    res.comProblema = problemas.length;
    res.detalhes.push(...resumirProblemas(problemas));
  }
  return res;
}

export interface ResultadoPeriodo {
  /** Dias em que algo foi criado. */
  diasGerados: number;
  geradas: number;
  atualizadas: number;
  puladas: number;
  /** A sede não tem rota padrão — nada a gerar em dia nenhum. */
  semRota?: boolean;
  /** "12/10 Nossa Senhora" — dias que a sede não opera, listados por data. */
  fechados: string[];
  detalhes: string[];
}

/**
 * Gera VÁRIOS dias da rota padrão — cada data resolvida por si.
 *
 * É só um laço sobre `gerarDiaDaRotaPadrao`, e é de propósito: quem decide qual
 * camada vale numa data é `projetarDiaDaRota`, olhando o dia da semana dela. Por
 * isso gerar a semana com uma rota por dia **funciona sozinho** — segunda monta
 * a de segunda, sábado a de sábado — enquanto "aplicar um modelo no período"
 * jogaria a MESMA rota em todos os dias.
 *
 * Sequencial, não paralelo: a geração de cada dia lê os blocos já existentes
 * para não duplicar, e dois dias em paralelo na mesma data se atropelariam. São
 * 7 dias no pior caso — não vale a complexidade.
 */
export async function gerarPeriodoDaRotaPadrao(
  sedeId: string,
  datas: string[],
  supervisorId: string,
): Promise<ResultadoPeriodo> {
  const res: ResultadoPeriodo = {
    diasGerados: 0,
    geradas: 0,
    atualizadas: 0,
    puladas: 0,
    fechados: [],
    detalhes: [],
  };
  for (const data of datas) {
    const dia = await gerarDiaDaRotaPadrao(sedeId, data, supervisorId);
    // Sem rota padrão a resposta é a mesma para todo dia: diz uma vez e para.
    if (dia.semRota) return { ...res, semRota: true };
    if (dia.fechado) {
      res.fechados.push(`${formatarDataBR(data).slice(0, 5)} ${dia.fechado}`);
      continue;
    }
    res.geradas += dia.geradas;
    res.atualizadas += dia.atualizadas ?? 0;
    res.puladas += dia.puladas;
    if (dia.geradas > 0) res.diasGerados++;
    // O detalhe sem a data seria inútil num relatório de 7 dias.
    res.detalhes.push(...dia.detalhes.map((d) => `${formatarDataBR(data).slice(0, 5)}: ${d}`));
  }
  return res;
}

/**
 * Requisitos e qualificações — só quando alguma tarefa da sede exige algo que
 * BLOQUEIA (treinamento/aptidão). EPI não bloqueia, e hoje as 201 tarefas com
 * requisito na produção referenciam só EPI: nesse caso não custa leitura nenhuma.
 */
async function contextoDeRequisitos(tarefas: Map<string, Tarefa>, sedeId: string) {
  const exigidos = new Set<string>();
  for (const t of tarefas.values()) {
    for (const id of String(t.requisitos ?? "").split(",")) {
      if (id.trim()) exigidos.add(id.trim());
    }
  }
  if (exigidos.size === 0) return {};
  const ds = await getDataSource();
  const requisitos = (await ds.listar("requisitos")).filter((r) => exigidos.has(r.id));
  if (!requisitos.some((r) => r.tipo !== "epi")) return {}; // só EPI: não bloqueia
  const qualificacoes = await ds.consultar("qualificacoes_funcionario", [
    { campo: "sede_id", op: "==", valor: sedeId },
  ]);
  return { requisitos, qualificacoes };
}

/**
 * Tudo que a projeção precisa do banco, numa só passada — compartilhado entre a
 * geração de verdade e a **geração sombra**, para as duas julgarem pelos mesmos
 * dados. Devolve `null` quando a sede não tem rota padrão.
 */
async function carregarRotaEContexto(sedeId: string, data: string) {
  const itens = await getRotaPadrao(sedeId);
  if (itens.length === 0) return null;

  const ds = await getDataSource();
  const existentes = await getRotinasByData(data, sedeId);
  const [tarefas, locais, funcionarios, periodos, feriados, params] = await Promise.all([
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("locais", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("periodos_letivos", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    // Coleção pequena e sem consulta possível por "vazio OU esta sede": lê tudo.
    ds.listar("feriados"),
    resolverParametros(sedeId),
  ]);

  // Presença de todos os funcionários numa só rodada (era 1 query por item).
  const idsFunc = [...new Set(itens.map((i) => i.funcionario_id))];
  const ausencias = await Promise.all(idsFunc.map((id) => ausenteEm(id, data)));

  const ctx: ContextoProjecao = {
    data,
    tarefas: new Map(tarefas.map((t) => [t.id, t])),
    funcionarios: new Map(funcionarios.map((f) => [f.id, f])),
    blocosDoDia: existentes.filter((r) => r.status !== "cancelada"),
    ausentes: new Set(idsFunc.filter((_, i) => ausencias[i] !== null)),
    letivoFora: statusPeriodoLetivo(periodos, sedeId, data) === "fora",
  };
  return {
    itens,
    existentes,
    ctx,
    locais: new Map(locais.map((l) => [l.id, l])),
    params,
    feriado: feriadoDoDia(feriados, sedeId, data),
  };
}

/**
 * Motivos em português para o supervisor, no máximo 8 — o texto vai para a tela
 * do "Gerar o dia". `ja_no_dia` e `cadastro_removido` não geram linha: o primeiro
 * é o caso normal (idempotência) e o segundo não tem nome para exibir.
 */
function explicarDescartes(descartados: ItemDescartado[], ctx: ContextoProjecao): string[] {
  const linhas: string[] = [];
  for (const { item, motivo } of descartados) {
    if (linhas.length >= 8) break;
    const tarefa = ctx.tarefas.get(item.tarefa_id);
    const funcionario = ctx.funcionarios.get(item.funcionario_id);
    if (motivo === "item_de_outro_dia")
      linhas.push(
        `${item.inicio_planejado} ${tarefa?.nome_tarefa}: a rota "${item.nome_modelo}" não vale hoje (${rotularDiasSemana(item.dias_semana)})`,
      );
    else if (motivo === "substituido_por_camada")
      linhas.push(
        `${item.inicio_planejado} ${tarefa?.nome_tarefa}: hoje outra rota substitui o dia, e "${item.nome_modelo}" ficou de fora`,
      );
    else if (motivo === "fora_do_periodo_letivo")
      linhas.push(`${item.inicio_planejado} ${tarefa?.nome_tarefa}: fora do período letivo`);
    else if (motivo === "outro_dia_da_semana")
      linhas.push(`${item.inicio_planejado} ${tarefa?.nome_tarefa}: não é do dia da semana`);
    else if (motivo === "bloco_ja_iniciado")
      linhas.push(
        `${item.inicio_planejado} ${tarefa?.nome_tarefa}: já saiu do planejado (realizada ou cancelada) — não foi mexido`,
      );
    else if (motivo === "movido_a_mao")
      linhas.push(
        `${item.inicio_planejado} ${tarefa?.nome_tarefa}: foi movido à mão no dia — a rota não sobrescreve`,
      );
    else if (motivo === "folga_pela_escala")
      linhas.push(`${funcionario?.nome}: folga pela escala em ${ctx.data}`);
    else if (motivo === "pessoa_ausente")
      linhas.push(`${funcionario?.nome}: ausente — redistribuir no Remanejo`);
  }
  return linhas;
}

export interface RelatorioSombra {
  sede_id: string;
  data: string;
  semRota?: boolean;
  /** Feriado/recesso que fecha o dia — nada seria gerado. */
  fechado?: string;
  /** Itens da rota padrão da sede. */
  itens_na_rota: number;
  /** Blocos que existem no dia (planejados à mão ou gerados antes). */
  blocos_no_dia: number;
  /** A geração criaria estes agora. */
  materializaria: number;
  /** A geração ALINHARIA estes: a rota mudou de horário/duração depois de gerada. */
  atualizaria: number;
  /** Já presentes: a rota e o dia concordam. */
  preservados: number;
  descartes: Record<MotivoDescarte, number>;
  divergencia: {
    /** A rota tem, o dia não — e não é caso de bloco movido. */
    so_na_rota: number;
    /** O dia tem, a rota não: acréscimo manual do supervisor. */
    so_no_dia: number;
    /** Mesma pessoa+tarefa em outro horário: a rota está desatualizada. */
    movidos: number;
  };
  /** Amostra legível das divergências (no máximo 20 linhas). */
  amostra: string[];
}

/**
 * **Geração sombra**: calcula o que a geração automática produziria e confronta
 * com o dia que existe — **sem escrever bloco nenhum**.
 *
 * É instrumento de medição, não feature: não aparece em tela nenhuma do
 * supervisor. Serve para responder, com número, se a rota padrão sobrevive ao
 * contato com a operação antes de deixarmos um cron escrever por conta própria.
 */
export async function projetarDiaSombra(sedeId: string, data: string): Promise<RelatorioSombra> {
  const vazio = (): Record<MotivoDescarte, number> => ({
    ja_no_dia: 0,
    cadastro_removido: 0,
    item_de_outro_dia: 0,
    substituido_por_camada: 0,
    bloco_ja_iniciado: 0,
    movido_a_mao: 0,
    fora_do_periodo_letivo: 0,
    outro_dia_da_semana: 0,
    folga_pela_escala: 0,
    pessoa_ausente: 0,
  });

  const carregado = await carregarRotaEContexto(sedeId, data);
  if (!carregado) {
    return {
      sede_id: sedeId,
      data,
      semRota: true,
      itens_na_rota: 0,
      blocos_no_dia: 0,
      materializaria: 0,
      atualizaria: 0,
      preservados: 0,
      descartes: vazio(),
      divergencia: { so_na_rota: 0, so_no_dia: 0, movidos: 0 },
      amostra: [],
    };
  }
  if (carregado.feriado) {
    return {
      sede_id: sedeId,
      data,
      fechado: carregado.feriado.nome,
      itens_na_rota: carregado.itens.length,
      blocos_no_dia: carregado.existentes.filter((r) => r.status !== "cancelada").length,
      materializaria: 0,
      atualizaria: 0,
      preservados: 0,
      descartes: vazio(),
      divergencia: { so_na_rota: 0, so_no_dia: 0, movidos: 0 },
      amostra: [],
    };
  }
  const { itens, existentes, ctx } = carregado;
  const { materializar, atualizar, descartados } = projetarDiaDaRota(itens, ctx);
  const vivos = existentes.filter((r) => r.status !== "cancelada");

  // Compara só o que a rota REALMENTE prevê para esta data: o que ela criaria
  // mais o que já está lá. Comparar a rota inteira somaria os descartes legítimos
  // (tarefa de outro dia da semana, folga, ausência) à divergência — o relatório
  // diário acusaria "faltam 2 blocos" num dia perfeito. Foi o que a verificação
  // com a rota real do Pré Sul pegou: as duas tarefas semanais "escala de segunda"
  // e "escala de terça" apareciam como falta numa quarta-feira.
  const aplicaveis = [
    ...materializar,
    ...descartados
      .filter((d) => d.motivo === "ja_no_dia" || d.motivo === "movido_a_mao" || d.motivo === "bloco_ja_iniciado")
      .map((d) => d.item),
  ];
  // O que a geração vai ALINHAR sai dos dois lados da comparação: não é
  // divergência, é trabalho já contabilizado em `atualizaria`. Deixá-lo dentro
  // fazia o mesmo bloco aparecer como "vai alinhar" E como "só na rota" — dupla
  // contagem no relatório que existe justamente para ser confiável.
  const idsAlinhados = new Set(atualizar.map((a) => a.bloco.id));
  const div = compararRotaComODia(
    aplicaveis,
    vivos.filter((b) => !idsAlinhados.has(b.id)),
  );

  const descartes = vazio();
  for (const d of descartados) descartes[d.motivo]++;

  const nome = (id: string) => ctx.funcionarios.get(id)?.nome ?? id;
  const tarefa = (id: string) => ctx.tarefas.get(id)?.nome_tarefa ?? id;
  const amostra = [
    ...atualizar.map(
      (a) =>
        `ALINHARIA ${nome(a.item.funcionario_id)} / ${tarefa(a.item.tarefa_id)}: bloco ${a.bloco.inicio_planejado} → rota ${a.item.inicio_planejado}`,
    ),
    ...div.movidos.map(
      (m) => `MOVIDO ${nome(m.item.funcionario_id)} / ${tarefa(m.item.tarefa_id)}: rota ${m.de} → dia ${m.para}`,
    ),
    ...div.soNaRota.map(
      (i) => `SÓ NA ROTA ${i.inicio_planejado} ${nome(i.funcionario_id)} / ${tarefa(i.tarefa_id)}`,
    ),
    ...div.soNoDia.map(
      (r) => `SÓ NO DIA ${r.inicio_planejado} ${nome(r.funcionario_id)} / ${tarefa(r.tarefa_id)}`,
    ),
  ].slice(0, 20);

  return {
    sede_id: sedeId,
    data,
    itens_na_rota: itens.length,
    blocos_no_dia: vivos.length,
    materializaria: materializar.length,
    atualizaria: atualizar.length,
    preservados: descartes.ja_no_dia,
    descartes,
    divergencia: {
      so_na_rota: div.soNaRota.length,
      so_no_dia: div.soNoDia.length,
      movidos: div.movidos.length,
    },
    amostra,
  };
}

/**
 * Sedes que têm rota padrão — uma consulta só, em vez de varrer as 18 sedes para
 * descobrir que 15 não têm nada a projetar.
 */
export async function sedesComRotaPadrao(): Promise<string[]> {
  const ds = await getDataSource();
  const itens = await ds.consultar("modelos_rotina", [{ campo: "padrao", op: "==", valor: true }]);
  return [...new Set(itens.filter((m) => !m.evento).map((m) => m.sede_id))].sort();
}

/** Geração sombra de uma data: uma sede, ou todas as que têm rota padrão. */
export async function projetarSombraDoDia(
  data: string,
  sedeId?: string,
): Promise<RelatorioSombra[]> {
  const sedes = sedeId ? [sedeId] : await sedesComRotaPadrao();
  const relatorios: RelatorioSombra[] = [];
  for (const sede of sedes) relatorios.push(await projetarDiaSombra(sede, data));
  return relatorios;
}

export async function excluirModelo(nome: string, sedeId: string): Promise<number> {
  const ds = await getDataSource();
  const itens = (
    await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
  ).filter((m) => m.nome_modelo === nome);
  await emLotes(itens, (item) => ds.excluir("modelos_rotina", item.id));
  return itens.length;
}
