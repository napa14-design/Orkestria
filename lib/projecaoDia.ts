/**
 * Projeção do dia a partir da rota padrão — **a decisão, sem a gravação**.
 *
 * Existe para que a geração real e a *geração sombra* usem exatamente o mesmo
 * julgamento. Se a sombra reimplementasse as regras de descarte, ela divergiria
 * da realidade em silêncio e o relatório passaria a mentir com aparência de
 * medição. Aqui é função pura: recebe o que já foi lido do banco e devolve o que
 * seria materializado e o que seria descartado, com o motivo.
 *
 * A ORDEM dos testes é significativa: o motivo relatado é o primeiro que se
 * aplica. Mexer na ordem muda o texto que o supervisor lê.
 */
import { jornadaDoDia } from "./calculations";
import { diaDaSemana, parseDiasSemana } from "./dateUtils";
import type { Funcionario, ModeloRotinaItem, RotinaPlanejada, Tarefa } from "@/types";

export type MotivoDescarte =
  /** Já existe no dia (a geração é idempotente). */
  | "ja_no_dia"
  /** Tarefa ou funcionário do item saiu do cadastro depois de a rota ser salva. */
  | "cadastro_removido"
  /** O item da rota vale só em certos dias da semana, e hoje não é um deles. */
  | "item_de_outro_dia"
  /** Hoje existe camada que SUBSTITUI o dia, e este item não é dela. */
  | "substituido_por_camada"
  /** O bloco existe mas já saiu do planejado (realizado, cancelado…): não se mexe. */
  | "bloco_ja_iniciado"
  /** O bloco existe e foi movido À MÃO: a decisão humana vence a rota. */
  | "movido_a_mao"
  | "fora_do_periodo_letivo"
  /** A TAREFA é semanal e hoje não está nos dias dela. */
  | "outro_dia_da_semana"
  | "folga_pela_escala"
  | "pessoa_ausente";

export interface ItemDescartado {
  item: ModeloRotinaItem;
  motivo: MotivoDescarte;
}

/** O bloco existe e a rota mudou: alinhar em vez de criar outro ao lado. */
export interface ItemParaAtualizar {
  item: ModeloRotinaItem;
  bloco: RotinaPlanejada;
}

export interface Projecao {
  /** Itens que a geração criaria agora. */
  materializar: ModeloRotinaItem[];
  /** Blocos que a geração atualizaria (a rota mudou de horário/duração). */
  atualizar: ItemParaAtualizar[];
  descartados: ItemDescartado[];
}

export interface ContextoProjecao {
  data: string;
  tarefas: Map<string, Tarefa>;
  funcionarios: Map<string, Funcionario>;
  /** Blocos do dia que contam (canceladas já filtradas por quem chama). */
  blocosDoDia: RotinaPlanejada[];
  /** Ids de funcionários com ausência registrada na data. */
  ausentes: Set<string>;
  letivoFora: boolean;
}

/**
 * Chave de identidade do bloco materializado.
 *
 * **Ela não reconcilia**: mudar o horário na rota produz outra chave, então o
 * bloco antigo permanece e o novo nasce ao lado. A troca por
 * `data|id_do_item_da_rota` é tarefa própria — a geração sombra existe, entre
 * outras coisas, para medir com que frequência isso acontece de verdade.
 */
export function chaveMaterializacao(
  funcionarioId: string,
  tarefaId: string,
  inicio: string,
): string {
  return `${funcionarioId}|${tarefaId}|${inicio}`;
}

/** O item vale no dia da semana `dow`? Sem dias declarados = vale todo dia. */
function valeNoDia(item: ModeloRotinaItem, dow: number): boolean {
  const dias = parseDiasSemana(item.dias_semana);
  return dias.length === 0 || dias.includes(dow);
}

/**
 * Camadas que SUBSTITUEM o dia hoje (por `nome_modelo`).
 *
 * Quando existe alguma, o dia é montado **só** por ela: é o caso de "a segunda
 * tem programação própria", em que somar a rota de todo dia duplicaria o dia
 * inteiro. Sem nenhuma, o dia é a união das camadas que acrescentam.
 */
export function camadasQueSubstituem(itens: ModeloRotinaItem[], dow: number): Set<string> {
  return new Set(
    itens.filter((i) => i.substitui === true && valeNoDia(i, dow)).map((i) => i.nome_modelo),
  );
}

export function projetarDiaDaRota(
  itens: ModeloRotinaItem[],
  ctx: ContextoProjecao,
): Projecao {
  const dow = diaDaSemana(ctx.data);
  const substitutas = camadasQueSubstituem(itens, dow);
  const materializar: ModeloRotinaItem[] = [];
  const atualizar: ItemParaAtualizar[] = [];
  const descartados: ItemDescartado[] = [];
  const descartar = (item: ModeloRotinaItem, motivo: MotivoDescarte) =>
    descartados.push({ item, motivo });

  // Bloco por item da rota que o gerou — a identidade que sobrevive a mudança de
  // horário. E a chave antiga como rede: bloco criado à mão ou gerado antes deste
  // campo existir não tem `origem_item_id`, e não pode ser duplicado por isso.
  const porItem = new Map<string, RotinaPlanejada>();
  const chavesDoDia = new Set<string>();
  for (const b of ctx.blocosDoDia) {
    if (b.origem_item_id) porItem.set(b.origem_item_id, b);
    chavesDoDia.add(chaveMaterializacao(b.funcionario_id, b.tarefa_id, b.inicio_planejado));
  }

  for (const item of itens) {
    const existente = porItem.get(item.id);
    if (existente) {
      if (existente.status !== "planejada") {
        descartar(item, "bloco_ja_iniciado");
        continue;
      }
      // Mão humana vence a rota: se o bloco não está mais onde a rota o pôs,
      // alguém o moveu de propósito.
      if (existente.origem_inicio && existente.inicio_planejado !== existente.origem_inicio) {
        descartar(item, "movido_a_mao");
        continue;
      }
      const horarioMudou = existente.inicio_planejado !== item.inicio_planejado;
      const duracaoMudou =
        item.duracao_min != null && existente.tempo_previsto_min !== item.duracao_min;
      if (horarioMudou || duracaoMudou) atualizar.push({ item, bloco: existente });
      else descartar(item, "ja_no_dia");
      continue;
    }
    if (chavesDoDia.has(chaveMaterializacao(item.funcionario_id, item.tarefa_id, item.inicio_planejado))) {
      descartar(item, "ja_no_dia");
      continue;
    }
    const tarefa = ctx.tarefas.get(item.tarefa_id);
    const funcionario = ctx.funcionarios.get(item.funcionario_id);
    if (!tarefa || !funcionario) {
      descartar(item, "cadastro_removido");
      continue;
    }
    // Recorrência do próprio item: é o que permite a sede ter a camada de todo
    // dia mais camadas por dia da semana. Vazio = todo dia (rotas antigas).
    if (!valeNoDia(item, dow)) {
      descartar(item, "item_de_outro_dia");
      continue;
    }
    // Hoje tem camada que substitui o dia: só ela monta.
    if (substitutas.size > 0 && !substitutas.has(item.nome_modelo)) {
      descartar(item, "substituido_por_camada");
      continue;
    }
    if (tarefa.depende_calendario && ctx.letivoFora) {
      descartar(item, "fora_do_periodo_letivo");
      continue;
    }
    if (tarefa.frequencia === "semanal") {
      const dias = parseDiasSemana(tarefa.dias_semana);
      if (dias.length && !dias.includes(dow)) {
        descartar(item, "outro_dia_da_semana");
        continue;
      }
    }
    if (!jornadaDoDia(funcionario, ctx.data).trabalha) {
      descartar(item, "folga_pela_escala");
      continue;
    }
    if (ctx.ausentes.has(item.funcionario_id)) {
      descartar(item, "pessoa_ausente");
      continue;
    }
    materializar.push(item);
  }
  return { materializar, atualizar, descartados };
}

export interface BlocoMovido {
  item: ModeloRotinaItem;
  rotina: RotinaPlanejada;
  de: string;
  para: string;
}

export interface Divergencia {
  /** Itens da rota que faltam no dia montado à mão. */
  soNaRota: ModeloRotinaItem[];
  /** Blocos do dia que a rota não tem (acréscimo manual). */
  soNoDia: RotinaPlanejada[];
  /** Mesma pessoa e tarefa em outro horário: o supervisor moveu o bloco. */
  movidos: BlocoMovido[];
}

/**
 * Confronta a rota com o dia que existe de verdade.
 *
 * `movidos` é o achado que interessa: um par pessoa+tarefa presente nos dois
 * lados em horários diferentes é, ao mesmo tempo, a prova de que a rota está
 * desatualizada **e** o caso que a chave por horário duplicaria numa regeração.
 * Ele sai de `soNaRota`/`soNoDia` para não ser contado duas vezes.
 *
 * **Receba só os itens aplicáveis à data** — o que a rota criaria mais o que já
 * está no dia. Passar a rota inteira faz os descartes legítimos (tarefa de outro
 * dia da semana, folga, ausência) virarem "falta no dia", e o relatório acusa
 * divergência num dia perfeito.
 */
export function compararRotaComODia(
  itensDaRota: ModeloRotinaItem[],
  existentes: RotinaPlanejada[],
): Divergencia {
  const chavesDaRota = new Set(
    itensDaRota.map((i) => chaveMaterializacao(i.funcionario_id, i.tarefa_id, i.inicio_planejado)),
  );
  const chavesDoDia = new Set(
    existentes.map((r) => chaveMaterializacao(r.funcionario_id, r.tarefa_id, r.inicio_planejado)),
  );

  const soNaRota = itensDaRota.filter(
    (i) => !chavesDoDia.has(chaveMaterializacao(i.funcionario_id, i.tarefa_id, i.inicio_planejado)),
  );
  const soNoDia = existentes.filter(
    (r) => !chavesDaRota.has(chaveMaterializacao(r.funcionario_id, r.tarefa_id, r.inicio_planejado)),
  );

  const movidos: BlocoMovido[] = [];
  const usados = new Set<string>();
  const restoNaRota: ModeloRotinaItem[] = [];
  for (const item of soNaRota) {
    const par = soNoDia.find(
      (r) =>
        !usados.has(r.id) &&
        r.funcionario_id === item.funcionario_id &&
        r.tarefa_id === item.tarefa_id,
    );
    if (par) {
      usados.add(par.id);
      movidos.push({ item, rotina: par, de: item.inicio_planejado, para: par.inicio_planejado });
    } else {
      restoNaRota.push(item);
    }
  }
  return {
    soNaRota: restoNaRota,
    soNoDia: soNoDia.filter((r) => !usados.has(r.id)),
    movidos,
  };
}
