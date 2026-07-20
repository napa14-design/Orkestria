/**
 * Modelos de rotina (templates): salvar o dia montado com um nome e
 * reaplicá-lo em qualquer data ou período. A aplicação reaproveita
 * createRotina, então todas as validações de alocação continuam valendo —
 * itens que conflitam são pulados e contabilizados.
 */
import {
  blocosOcupados,
  jornadaDoDia,
  statusPeriodoLetivo,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { diaDaSemana, hhmmParaMin, minParaHHMM, parseDiasSemana } from "@/lib/dateUtils";
import type { ModeloRotinaItem, RotinaPlanejada } from "@/types";
import { ausenteEm } from "./ausenciasService";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { createRotina, getRotinasByData, idMaterializacao } from "./rotinasService";

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
    } else
      grupos.set(chave, {
        nome_modelo: item.nome_modelo,
        sede_id: item.sede_id,
        itens: 1,
        padrao: item.padrao === true,
        evento: item.evento === true,
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
  opts: { padrao?: boolean; comDuracao?: boolean; evento?: boolean } = {},
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

  const ds = await getDataSource();
  const agora = agoraISO();
  const todos = await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }]);
  // Itens do mesmo nome: removidos DEPOIS de criar os novos, para não destruir a
  // rota padrão se algo falhar no meio (create-then-delete, não delete-then-create).
  const antigos = todos.filter((m) => m.nome_modelo === nomeLimpo);
  // Sobrescrever o modelo que É a rota padrão sem remarcá-lo deixaria a sede sem
  // rota padrão em silêncio (o "Gerar o dia" pararia de achar o quê gerar).
  if (!opts.padrao && antigos.some((m) => m.padrao))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "MODELO_SOBRESCREVE_PADRAO",
        mensagem: `"${nomeLimpo}" é a rota padrão desta sede. Para substituí-la, marque também "rota padrão"; para criar outro modelo, use um nome diferente.`,
      },
    ]);

  const novos: ModeloRotinaItem[] = rotinas.map((r) => ({
    id: novoId(),
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
    criado_por: autor,
    criado_em: agora,
  }));

  // 1) cria os novos; 2) só uma rota padrão por sede (desmarca as demais);
  // 3) remove os antigos do mesmo nome — tudo em lotes paralelos.
  await emLotes(novos, (item) => ds.criar("modelos_rotina", item));
  if (opts.padrao) {
    const desmarcar = todos.filter((m) => m.padrao && m.nome_modelo !== nomeLimpo);
    await emLotes(desmarcar, (m) => ds.atualizar("modelos_rotina", m.id, { padrao: false }));
  }
  await emLotes(antigos, (m) => ds.excluir("modelos_rotina", m.id));
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
  geradas: number;
  puladas: number;
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
  const itens = await getRotaPadrao(sedeId);
  if (itens.length === 0) return { semRota: true, geradas: 0, puladas: 0, detalhes: [] };

  const ds = await getDataSource();
  const chave = (f: string, t: string, i: string) => `${f}|${t}|${i}`;
  const existentes = await getRotinasByData(data, sedeId);
  const jaTem = new Set(
    existentes
      .filter((r) => r.status !== "cancelada")
      .map((r) => chave(r.funcionario_id, r.tarefa_id, r.inicio_planejado)),
  );
  const [tarefas, locais, funcionarios, periodos, params] = await Promise.all([
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("locais", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("periodos_letivos", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    resolverParametros(sedeId),
  ]);
  const tMap = new Map(tarefas.map((t) => [t.id, t]));
  const lMap = new Map(locais.map((l) => [l.id, l]));
  const fMap = new Map(funcionarios.map((f) => [f.id, f]));
  const letivoFora = statusPeriodoLetivo(periodos, sedeId, data) === "fora";
  const dow = diaDaSemana(data); // 0=dom … 6=sáb
  const agora = agoraISO();

  // Presença de todos os funcionários numa só rodada (era 1 query por item).
  const idsFunc = [...new Set(itens.map((i) => i.funcionario_id))];
  const ausentes = await Promise.all(idsFunc.map((id) => ausenteEm(id, data)));
  const ausente = new Map(idsFunc.map((id, i) => [id, ausentes[i] !== null]));

  const res: ResultadoGeracao = { geradas: 0, puladas: 0, detalhes: [] };
  const nota = (m: string) => {
    if (res.detalhes.length < 8) res.detalhes.push(m);
  };

  const aCriar: RotinaPlanejada[] = [];
  for (const it of itens) {
    if (jaTem.has(chave(it.funcionario_id, it.tarefa_id, it.inicio_planejado))) {
      res.puladas++;
      continue;
    }
    const t = tMap.get(it.tarefa_id);
    const f = fMap.get(it.funcionario_id);
    if (!t || !f) {
      res.puladas++;
      continue;
    }
    if (t.depende_calendario && letivoFora) {
      res.puladas++;
      nota(`${it.inicio_planejado} ${t.nome_tarefa}: fora do período letivo`);
      continue;
    }
    // Tarefa semanal só entra nos dias configurados (ex.: "seg,qua,sex").
    if (t.frequencia === "semanal") {
      const dias = parseDiasSemana(t.dias_semana);
      if (dias.length && !dias.includes(dow)) {
        res.puladas++;
        nota(`${it.inicio_planejado} ${t.nome_tarefa}: não é do dia da semana`);
        continue;
      }
    }
    if (!jornadaDoDia(f, data).trabalha) {
      res.puladas++;
      nota(`${f.nome}: folga pela escala em ${data}`);
      continue;
    }
    if (ausente.get(it.funcionario_id)) {
      res.puladas++;
      nota(`${f.nome}: ausente — redistribuir no Remanejo`);
      continue;
    }

    const previsto = it.duracao_min ?? tempoPrevistoMin(t, lMap.get(it.local_id) ?? undefined);
    const fim = minParaHHMM(hhmmParaMin(it.inicio_planejado) + previsto);
    const rotina: RotinaPlanejada = {
      id: idMaterializacao(data, it.funcionario_id, it.tarefa_id, it.inicio_planejado),
      data,
      funcionario_id: it.funcionario_id,
      sede_id: sedeId,
      tarefa_id: it.tarefa_id,
      local_id: it.local_id,
      inicio_planejado: it.inicio_planejado,
      fim_planejado: fim,
      tempo_previsto_min: previsto,
      tempo_visual_min: tempoVisualMin(previsto, params.bloco_agenda_min),
      blocos_ocupados: blocosOcupados(previsto, params.bloco_agenda_min),
      status: "planejada",
      observacao: "Rota padrão",
      supervisor_id: supervisorId,
      criado_em: agora,
      atualizado_em: agora,
    };
    aCriar.push(rotina);
  }

  // Grava em lotes paralelos — escrita 1 a 1 levava ~2 min para um dia cheio.
  const LOTE = 25;
  for (let i = 0; i < aCriar.length; i += LOTE) {
    await Promise.all(aCriar.slice(i, i + LOTE).map((r) => ds.criar("rotinas_planejadas", r)));
  }
  res.geradas = aCriar.length;
  return res;
}

export async function excluirModelo(nome: string, sedeId: string): Promise<number> {
  const ds = await getDataSource();
  const itens = (
    await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
  ).filter((m) => m.nome_modelo === nome);
  await emLotes(itens, (item) => ds.excluir("modelos_rotina", item.id));
  return itens.length;
}
