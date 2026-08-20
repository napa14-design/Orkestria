/**
 * Aplica uma rota importada de planilha: cria os locais, as tarefas, os
 * funcionários e as rotinas do dia — REAPROVEITANDO o que já existe na sede
 * (casa por nome, não duplica) — e opcionalmente salva o dia como rota padrão.
 *
 * Idempotente: rodar a mesma planilha 2× não cria nada de novo (as rotinas usam
 * id determinístico e as entidades casam por nome).
 */
import { blocosOcupados, tempoVisualMin } from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { hhmmParaMin } from "@/lib/dateUtils";
import type { Analise } from "@/lib/importacaoRota";
import type { Funcionario, Local, RotinaPlanejada, Tarefa } from "@/types";
import { resumirProblemas, validarDia } from "@/lib/validacaoDoDia";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";
import { getRotinasByData, idMaterializacao } from "./rotinasService";
import { salvarModelo } from "./modelosService";

const chave = (s: string) => (s ?? "").trim().toLowerCase();

/** Turno derivado do horário — a planilha não pede (é redundante com entrada/saída). */
function turnoDoHorario(entrada: string, saida: string): Funcionario["turno"] {
  const ini = hhmmParaMin(entrada);
  const fim = hhmmParaMin(saida);
  if (fim - ini >= 480) return "integral"; // 8h+ cobre manhã e tarde
  if (ini >= 18 * 60) return "noite";
  if (ini >= 12 * 60) return "tarde";
  return "manha";
}

async function emLotes<T>(itens: T[], fn: (x: T) => Promise<unknown>, lote = 25): Promise<void> {
  for (let i = 0; i < itens.length; i += lote) await Promise.all(itens.slice(i, i + lote).map(fn));
}

export interface ResultadoImportacao {
  locais: { criados: number; reaproveitados: number };
  tarefas: { criadas: number; reaproveitadas: number };
  funcionarios: { criados: number; reaproveitados: number };
  rotinas: { criadas: number; jaExistiam: number };
  rotaPadrao: number; // itens salvos como rota padrão (0 = não salvou)
  /**
   * Blocos que a agenda MANUAL teria recusado. A planilha é conferida contra si
   * mesma em `analisarRota`, mas nada comparava o resultado com o que JÁ estava
   * no dia — importar por cima de um dia gerado duplicava a pessoa em silêncio.
   */
  comProblema?: number;
  avisos: string[];
}

export async function aplicarImportacao(
  sedeId: string,
  data: string,
  analise: Analise,
  autor: string,
  opts: { salvarPadrao?: boolean } = {},
): Promise<ResultadoImportacao> {
  if (analise.erros.length)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "IMPORT_COM_ERROS", mensagem: "Corrija os erros da planilha antes de importar." },
    ]);

  const ds = await getDataSource();
  const agora = agoraISO();
  const avisos: string[] = [];
  const res: ResultadoImportacao = {
    locais: { criados: 0, reaproveitados: 0 },
    tarefas: { criadas: 0, reaproveitadas: 0 },
    funcionarios: { criados: 0, reaproveitados: 0 },
    rotinas: { criadas: 0, jaExistiam: 0 },
    rotaPadrao: 0,
    avisos,
  };

  const [locaisEx, tarefasEx, funcsEx, categorias, requisitos, params] = await Promise.all([
    ds.consultar("locais", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.listar("categorias"),
    ds.listar("requisitos"),
    resolverParametros(sedeId),
  ]);

  const catPorNome = new Map(categorias.map((c) => [chave(c.nome), c.id]));
  const epiPorNome = new Map(requisitos.filter((r) => r.tipo === "epi").map((r) => [chave(r.nome), r.id]));

  // ── locais ────────────────────────────────────────────────────────────
  const idLocal = new Map(locaisEx.map((l) => [chave(l.nome_local), l.id]));
  const novosLocais: Local[] = [];
  for (const l of analise.locais) {
    if (idLocal.has(chave(l.nome_local))) {
      res.locais.reaproveitados++;
      continue;
    }
    const id = novoId();
    idLocal.set(chave(l.nome_local), id);
    novosLocais.push({
      id, sede_id: sedeId, nome_local: l.nome_local, andar: l.andar || "—",
      // sem coluna própria na planilha: entra genérico e o supervisor refina depois
      tipo_local: "outros",
      metragem: l.metragem, ativo: true, observacoes: "",
      criado_por: autor, criado_em: agora, atualizado_por: autor, atualizado_em: agora,
    });
    res.locais.criados++;
  }
  await emLotes(novosLocais, (x) => ds.criar("locais", x));

  // ── tarefas (únicas por nome + local) ─────────────────────────────────
  const idTarefa = new Map(tarefasEx.map((t) => [`${chave(t.nome_tarefa)}@${t.local_id}`, t.id]));
  const novasTarefas: Tarefa[] = [];
  for (const t of analise.tarefas) {
    const localId = idLocal.get(chave(t.local))!;
    const k = `${chave(t.nome_tarefa)}@${localId}`;
    if (idTarefa.has(k)) {
      res.tarefas.reaproveitadas++;
      continue;
    }
    const catId = t.categoria ? catPorNome.get(chave(t.categoria)) : undefined;
    if (t.categoria && !catId) avisos.push(`Categoria "${t.categoria}" não existe no catálogo — a tarefa "${t.nome_tarefa}" entrou sem categoria.`);
    const episIds: string[] = [];
    for (const e of t.epis) {
      const id = epiPorNome.get(chave(e));
      if (id) episIds.push(id);
      else avisos.push(`EPI "${e}" não existe no catálogo de Requisitos — ignorado em "${t.nome_tarefa}".`);
    }
    const id = novoId();
    idTarefa.set(k, id);
    novasTarefas.push({
      id, sede_id: sedeId, local_id: localId, nome_tarefa: t.nome_tarefa, tipo_tarefa: "Rota",
      categoria_id: catId, regra_calculo: "fixo", tipo_servico: (t.tipo_servico as Tarefa["tipo_servico"]) || "rotina",
      tempo_base_min: t.tempo_base_min, quantidade: 1,
      frequencia: (t.frequencia as Tarefa["frequencia"]) || "diaria",
      dias_semana: t.dias_semana || "", prioridade: "media",
      requisitos: episIds.join(","), ativo: true, observacoes: "",
      criado_por: autor, criado_em: agora, atualizado_por: autor, atualizado_em: agora,
    });
    res.tarefas.criadas++;
  }
  await emLotes(novasTarefas, (x) => ds.criar("tarefas", x));

  // ── funcionários ──────────────────────────────────────────────────────
  const idFunc = new Map(funcsEx.map((f) => [chave(f.nome), f.id]));
  const novosFuncs: Funcionario[] = [];
  for (const f of analise.funcionarios) {
    if (idFunc.has(chave(f.nome))) {
      res.funcionarios.reaproveitados++;
      continue;
    }
    const pares = f.intervalos.split(";").map((p) => p.trim()).filter(Boolean)
      .map((p) => p.split("-").map((s) => s.trim()));
    const intMin = pares.reduce((s, [a, b]) => s + Math.max(0, hhmmParaMin(b) - hhmmParaMin(a)), 0);
    const almoco = pares.slice().sort((a, b) => (hhmmParaMin(b[1]) - hhmmParaMin(b[0])) - (hhmmParaMin(a[1]) - hhmmParaMin(a[0])))[0];
    const id = novoId();
    idFunc.set(chave(f.nome), id);
    novosFuncs.push({
      id, sede_id: sedeId, nome: f.nome, genero: f.genero || "",
      turno: turnoDoHorario(f.entrada, f.saida),
      entrada: f.entrada, saida: f.saida,
      intervalos: f.intervalos, intervalo_min: intMin,
      intervalo_inicio: almoco?.[0] ?? "", intervalo_fim: almoco?.[1] ?? "",
      escala: (f.escala as Funcionario["escala"]) || "seg_sex",
      cargo: "ASG", ativo: true, observacoes: "",
      criado_por: autor, criado_em: agora, atualizado_por: autor, atualizado_em: agora,
    });
    res.funcionarios.criados++;
  }
  await emLotes(novosFuncs, (x) => ds.criar("funcionarios", x));

  // ── rotinas do dia (id determinístico → reimportar não duplica) ────────
  const jaTem = new Set(
    (await getRotinasByData(data, sedeId)).filter((r) => r.status !== "cancelada")
      .map((r) => `${r.funcionario_id}|${r.tarefa_id}|${r.inicio_planejado}`),
  );
  const novasRotinas: RotinaPlanejada[] = [];
  for (const r of analise.rotinas) {
    const fId = idFunc.get(chave(r.funcionario))!;
    const lId = idLocal.get(chave(r.local))!;
    const tId = idTarefa.get(`${chave(r.tarefa)}@${lId}`)!;
    if (jaTem.has(`${fId}|${tId}|${r.inicio}`)) {
      res.rotinas.jaExistiam++;
      continue;
    }
    novasRotinas.push({
      id: idMaterializacao(data, fId, tId, r.inicio),
      data, funcionario_id: fId, sede_id: sedeId, tarefa_id: tId, local_id: lId,
      inicio_planejado: r.inicio, fim_planejado: r.fim,
      tempo_previsto_min: r.minutos,
      tempo_visual_min: tempoVisualMin(r.minutos, params.bloco_agenda_min),
      blocos_ocupados: blocosOcupados(r.minutos, params.bloco_agenda_min),
      status: "planejada", observacao: "Importada da planilha",
      supervisor_id: autor, criado_em: agora, atualizado_em: agora,
    });
    res.rotinas.criadas++;
  }
  await emLotes(novasRotinas, (x) => ds.criar("rotinas_planejadas", x));

  // Mesmas regras do arrasto manual, sobre o dia inteiro: o que já existia mais
  // o que acabou de entrar.
  // Relê o dia DEPOIS de gravar — os novos blocos já estão lá. Concatenar
  // `novasRotinas` aqui contaria cada um duas vezes e faria todo bloco
  // "sobrepor a si mesmo" (302 falsos positivos num dia de 151 blocos).
  const doDia = await getRotinasByData(data, sedeId);
  const problemas = validarDia({
    blocos: doDia,
    funcionarios: new Map([...funcsEx, ...novosFuncs].map((f) => [f.id, f])),
    tarefas: new Map([...tarefasEx, ...novasTarefas].map((t) => [t.id, t])),
    locais: new Map([...locaisEx, ...novosLocais].map((l) => [l.id, l])),
    parametros: params,
    data,
    requisitos,
  });
  if (problemas.length) {
    res.comProblema = problemas.length;
    avisos.push(...resumirProblemas(problemas));
  }

  // ── rota padrão (opcional) ────────────────────────────────────────────
  if (opts.salvarPadrao && res.rotinas.criadas + res.rotinas.jaExistiam > 0) {
    const { itens } = await salvarModelo("Rota padrão", data, sedeId, autor, { padrao: true, comDuracao: true });
    res.rotaPadrao = itens;
  }

  return res;
}
