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
import { hhmmParaMin, minParaHHMM } from "@/lib/dateUtils";
import type { ModeloRotinaItem, RotinaPlanejada } from "@/types";
import { ausenteEm } from "./ausenciasService";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { createRotina, getRotinasByData } from "./rotinasService";

export interface ResumoModelo {
  nome_modelo: string;
  sede_id: string;
  itens: number;
  padrao: boolean;
  criado_por: string;
  criado_em: string;
}

export async function getModelos(sedeId?: string): Promise<ResumoModelo[]> {
  const ds = await getDataSource();
  const itens = sedeId
    ? await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
    : await ds.listar("modelos_rotina");
  const grupos = new Map<string, ResumoModelo>();
  for (const item of itens) {
    const chave = `${item.sede_id}::${item.nome_modelo}`;
    const atual = grupos.get(chave);
    if (atual) {
      atual.itens++;
      if (item.padrao) atual.padrao = true;
    } else
      grupos.set(chave, {
        nome_modelo: item.nome_modelo,
        sede_id: item.sede_id,
        itens: 1,
        padrao: item.padrao === true,
        criado_por: item.criado_por,
        criado_em: item.criado_em,
      });
  }
  return [...grupos.values()].sort((a, b) => a.nome_modelo.localeCompare(b.nome_modelo));
}

/** Itens da "rota padrão" da sede (modelo marcado como padrão), ou []. */
export async function getRotaPadrao(sedeId: string): Promise<ModeloRotinaItem[]> {
  const ds = await getDataSource();
  const itens = await ds.consultar("modelos_rotina", [
    { campo: "sede_id", op: "==", valor: sedeId },
  ]);
  return itens.filter((m) => m.padrao === true);
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
  opts: { padrao?: boolean; comDuracao?: boolean } = {},
): Promise<{ itens: number }> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "MODELO_SEM_NOME", mensagem: "Informe um nome para o modelo." },
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

  await excluirModelo(nomeLimpo, sedeId); // sobrescreve o mesmo nome
  const ds = await getDataSource();
  const agora = agoraISO();

  // Só uma rota padrão por sede: desmarca as demais.
  if (opts.padrao) {
    const outros = await ds.consultar("modelos_rotina", [
      { campo: "sede_id", op: "==", valor: sedeId },
    ]);
    for (const m of outros) if (m.padrao) await ds.atualizar("modelos_rotina", m.id, { padrao: false });
  }

  for (const r of rotinas) {
    const item: ModeloRotinaItem = {
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
      criado_por: autor,
      criado_em: agora,
    };
    await ds.criar("modelos_rotina", item);
  }
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

  const resultado: ResultadoAplicacao = { criadas: 0, puladas: 0, detalhes: [] };
  const chave = (f: string, t: string, i: string) => `${f}|${t}|${i}`;
  for (const data of datas) {
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
      try {
        await createRotina(
          {
            data,
            funcionario_id: item.funcionario_id,
            tarefa_id: item.tarefa_id,
            inicio_planejado: item.inicio_planejado,
            duracao_min: item.duracao_min,
            observacao: `Modelo: ${nome}`,
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
      id: novoId(),
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
  for (const item of itens) await ds.excluir("modelos_rotina", item.id);
  return itens.length;
}
