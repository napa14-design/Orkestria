/**
 * "Assume o posto de" com outro horário (pedido do dono, 13/11/2026): quem assume o
 * posto de quem entrava às 12:00 na CESIU entra às 09:00. A rota do posto
 * **anda junto com a entrada**, na mesma ordem: 12:00 vira 09:00, 13:00 vira 10:00…
 * (decisão do dono: deslocar tudo, não só o que não cabe).
 *
 * Três cuidados:
 *  1. **As pausas de quem entra.** O almoço dela não é o almoço dele deslocado: tarefa
 *     que cai numa pausa vai para o fim dela, e as seguintes andam junto até a folga
 *     que a pausa antiga deixou absorver o atraso. A ordem não muda.
 *  2. **O sábado tem o horário dele.** O item de todo dia também vale no sábado. Se
 *     quem saiu não o fazia no sábado (caía fora do horário de sábado e a geração o
 *     descartava), ele continua sem valer no sábado; deslocado, poderia passar a caber
 *     e somar com a camada própria do sábado. Se fazia, vira uma cópia só de sábado,
 *     deslocada pelo horário de sábado de cada um.
 *  3. **O que não cabe fica depois da saída** (decisão do dono): a agenda marca como
 *     "passa da saída" e a coordenação resolve. Nada some.
 *
 * Tarefas que no original se sobrepunham (café de espera e outra ao mesmo tempo)
 * mantêm a mesma distância entre si. Itens de evento ou fora da rota padrão não mexem.
 */
import { funcionarioNoDia, intervalosDoFuncionario } from "./calculations";
import { hhmmParaMin, minParaHHMM, parseDiasSemana, serializarDiasSemana } from "./dateUtils";
import type { Funcionario, ModeloRotinaItem } from "@/types";

/** Uma segunda e um sábado quaisquer: o horário do dia só depende do dia da semana. */
const UMA_SEGUNDA = "2026-11-16";
const UM_SABADO = "2026-11-21";
const TODOS = [0, 1, 2, 3, 4, 5, 6];

export interface ItemNoHorario {
  /** O item como estava. */
  item: ModeloRotinaItem;
  /** Início novo nos dias que não são sábado (ou no sábado, se o item é só de sábado). */
  inicio: string;
  /** Dias do item depois do ajuste; `undefined` = os mesmos de antes. */
  dias_semana?: string;
  /** Presente = criar uma cópia só de sábado (dias "6") começando aqui. */
  inicioSabado?: string;
}

export interface RotaNoHorario {
  itens: ItemNoHorario[];
  /** Minutos que a entrada andou (negativo = mais cedo). */
  minutos: number;
  minutosSabado: number;
  /** Quantos itens terminam depois da saída de quem assume (ficam, marcados). */
  passamDaSaida: number;
  /** Itens de sábado maiores que o sábado inteiro de quem assume: a geração os descarta. */
  naoCabemNoSabado: number;
}

type Horario = Pick<
  Funcionario,
  "entrada" | "saida" | "intervalos" | "intervalo_inicio" | "intervalo_fim" | "intervalo_min" | "entrada_sabado" | "saida_sabado" | "intervalos_sabado" | "escala"
>;

function doDia(f: Horario, data: string) {
  const g = funcionarioNoDia(f as Funcionario, data);
  const pausas = intervalosDoFuncionario(g)
    .map((p) => ({ ini: hhmmParaMin(p.inicio), fim: hhmmParaMin(p.fim) }))
    .filter((p) => !Number.isNaN(p.ini) && !Number.isNaN(p.fim) && p.fim > p.ini);
  return { entrada: hhmmParaMin(g.entrada), saida: hhmmParaMin(g.saida), pausas };
}

/** Quanto a entrada andou; sem horário de um dos dois, não anda. */
function quantoAndou(de: number, para: number): number {
  return Number.isNaN(de) || Number.isNaN(para) ? 0 : para - de;
}

/** Empurra o início para depois de qualquer pausa que o bloco atravesse. */
function foraDasPausas(inicio: number, dur: number, pausas: Array<{ ini: number; fim: number }>): number {
  let s = inicio;
  for (let mexeu = true; mexeu; ) {
    mexeu = false;
    for (const p of pausas) {
      if (s < p.fim && s + Math.max(dur, 1) > p.ini) {
        s = p.fim;
        mexeu = true;
      }
    }
  }
  return s;
}

const DIA = 24 * 60;

/**
 * Recoloca um grupo de itens (mesmo tipo de dia) deslocado e fora das pausas.
 * `janela` (só no sábado com horário próprio): lá, passar da saída é ser descartado
 * pela geração (`projecaoDia`), e a regra do dono é "nada some". Então o que a pausa
 * empurraria para depois da saída fica no lugar deslocado, por cima da pausa; e o que
 * ainda assim não cabe (sábado de quem assume mais curto) é puxado para terminar na
 * saída, por cima do anterior. A agenda acusa o conflito e a coordenação resolve
 * (auditoria e pedido do dono, 13/11/2026). Só some o que é maior que o sábado inteiro.
 */
function recolocar(
  /** `valia`: o item valia no sábado para quem saiu. Só esse é segurado dentro da janela —
   *  o que já caía fora continua caindo fora; puxá-lo para dentro dava ao sábado uma
   *  tarefa que ele nunca teve (reauditoria, 13/11/2026). */
  grupo: Array<{ chave: number; orig: number; dur: number; valia?: boolean }>,
  delta: number,
  pausas: Array<{ ini: number; fim: number }>,
  janela?: { entrada: number; saida: number },
): Map<number, number> {
  const saida = janela?.saida;
  const ordem = [...grupo].sort((a, b) => a.orig - b.orig || a.dur - b.dur);
  const novo = new Map<number, number>();
  let ant: { orig: number; s: number } | null = null;
  let maxOrigFim = -Infinity;
  let maxNovoFim = -Infinity;
  for (const g of ordem) {
    const s0 =
      ant && g.orig < maxOrigFim
        ? ant.s + (g.orig - ant.orig) // sobreposto no original: mantém a distância
        : Math.max(g.orig + delta, maxNovoFim);
    let s = foraDasPausas(s0, g.dur, pausas);
    if (janela && g.valia && saida !== undefined && !Number.isNaN(saida) && s + g.dur > saida) {
      if (s0 + g.dur <= saida) s = s0;
      else if (saida - g.dur >= janela.entrada) s = saida - g.dur;
    }
    // Deslocamento grande não pode virar "25:30" nem "-1:00".
    s = Math.min(Math.max(s, 0), DIA - Math.max(g.dur, 1));
    novo.set(g.chave, s);
    ant = { orig: g.orig, s };
    maxOrigFim = Math.max(maxOrigFim, g.orig + g.dur);
    maxNovoFim = Math.max(maxNovoFim, s + g.dur);
  }
  return novo;
}

export function rotaNoHorario(
  itens: ModeloRotinaItem[],
  antigo: Horario,
  novo: Horario,
  duracao: (item: ModeloRotinaItem) => number,
): RotaNoHorario {
  const semanaAnt = doDia(antigo, UMA_SEGUNDA);
  const semanaNovo = doDia(novo, UMA_SEGUNDA);
  const sabAnt = doDia(antigo, UM_SABADO);
  const sabNovo = doDia(novo, UM_SABADO);
  const dW = quantoAndou(semanaAnt.entrada, semanaNovo.entrada);
  const dS = quantoAndou(sabAnt.entrada, sabNovo.entrada);
  const sabadoProprio = (f: Horario) => Boolean(f.entrada_sabado && f.saida_sabado);

  // O item valia no sábado para quem saiu? A mesma regra da geração: com horário de
  // sábado próprio, só o que cabe nele.
  const valiaNoSabado = (inicio: number, dur: number) =>
    !sabadoProprio(antigo) || (inicio >= sabAnt.entrada && inicio + dur <= sabAnt.saida);
  const valeriaNoSabado = (inicio: number, dur: number) =>
    !sabadoProprio(novo) || (inicio >= sabNovo.entrada && inicio + dur <= sabNovo.saida);

  type Plano = { item: ModeloRotinaItem; orig: number; dur: number; outros: number[]; dias?: string; semana: boolean; sabado: boolean; misto: boolean };
  const planos: Plano[] = [];
  const intocados: ItemNoHorario[] = [];
  for (const item of itens) {
    const orig = hhmmParaMin(item.inicio_planejado);
    if (!item.padrao || item.evento || Number.isNaN(orig)) {
      intocados.push({ item, inicio: item.inicio_planejado });
      continue;
    }
    const dur = Math.max(0, duracao(item));
    const dias = parseDiasSemana(item.dias_semana);
    const valeEm = dias.length ? dias : TODOS;
    const outros = valeEm.filter((d) => d !== 6);
    if (!outros.length) planos.push({ item, orig, dur, outros, semana: false, sabado: true, misto: false });
    else planos.push({ item, orig, dur, outros, semana: true, sabado: false, misto: valeEm.includes(6) });
  }
  const grupo = (f: (p: Plano) => boolean) =>
    planos
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => f(p))
      .map(({ p, i }) => ({ chave: i, orig: p.orig, dur: p.dur, valia: valiaNoSabado(p.orig, p.dur) }));

  // 1º a semana. O item de todo dia vale também no sábado, no MESMO horário: a
  // decisão do sábado olha onde ele terminou de fato, depois de contornar as pausas.
  const semana = recolocar(grupo((p) => p.semana), dW, semanaNovo.pausas);
  for (const [i, p] of planos.entries()) {
    if (!p.misto) continue;
    const s = semana.get(i)!;
    // Segue um item só se no sábado ele cairia no mesmo lugar (sem empurrão das pausas
    // da semana) e o sábado não muda de "vale" para "não vale" nem o contrário.
    if (s === p.orig + dS && valiaNoSabado(p.orig, p.dur) === valeriaNoSabado(s, p.dur)) continue;
    // Sai o sábado do item de todo dia; volta como cópia de sábado só se valia.
    p.dias = serializarDiasSemana(p.outros);
    p.sabado = valiaNoSabado(p.orig, p.dur);
  }
  // 2º o sábado: os só de sábado e as cópias, pelo horário de sábado.
  const sabado = recolocar(
    grupo((p) => p.sabado),
    dS,
    sabNovo.pausas,
    sabadoProprio(novo) && !Number.isNaN(sabNovo.entrada) ? { entrada: sabNovo.entrada, saida: sabNovo.saida } : undefined,
  );

  let passamDaSaida = 0;
  let naoCabemNoSabado = 0;
  const conta = (s: number, dur: number, saida: number, sabadoDe?: Plano) => {
    if (Number.isNaN(saida) || s + dur <= saida) return;
    // No sábado com horário próprio, passar da saída é ser descartado pela geração. Só
    // conta como perda o que quem saiu fazia: o que já caía fora continua igual.
    if (sabadoDe && sabadoProprio(novo)) {
      if (valiaNoSabado(sabadoDe.orig, sabadoDe.dur)) naoCabemNoSabado++;
    } else passamDaSaida++;
  };
  const ajustados: ItemNoHorario[] = planos.map((p, i) => {
    if (!p.semana) {
      const s = sabado.get(i)!;
      conta(s, p.dur, sabNovo.saida, p);
      return { item: p.item, inicio: minParaHHMM(s) };
    }
    const s = semana.get(i)!;
    conta(s, p.dur, semanaNovo.saida);
    const r: ItemNoHorario = { item: p.item, inicio: minParaHHMM(s), ...(p.dias !== undefined ? { dias_semana: p.dias } : {}) };
    if (p.sabado && p.dias !== undefined) {
      const ss = sabado.get(i)!;
      conta(ss, p.dur, sabNovo.saida, p);
      r.inicioSabado = minParaHHMM(ss);
    }
    return r;
  });
  return { itens: [...ajustados, ...intocados], minutos: dW, minutosSabado: dS, passamDaSaida, naoCabemNoSabado };
}
