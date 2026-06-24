/**
 * Geometria da ficha (em pontos PDF) — FONTE ÚNICA compartilhada pelo gerador
 * de PDF (`services/fichaPdf.ts`) e pelo leitor OMR (`lib/omr.ts`).
 *
 * Enquanto os dois importarem daqui, a ficha impressa e a leitura nunca
 * divergem. Mudou o layout? Mude só este arquivo.
 *
 * Convenção PDF: origem no canto inferior-esquerdo, y cresce para cima.
 */
export const PAGINA = { W: 595.28, H: 841.89 }; // A4

// Cartão ocupa a folha A4 quase inteira (margens ~40pt).
export const CARD = { x0: 40, x1: 555, yBot: 42, yTop: 802 };

export const FID_LADO = 12; // lado do quadrado fiducial
/** Centros dos 4 fiduciais (cantos do cartão). Devem casar com fidRects(). */
export const FID = {
  TL: [54, 788] as [number, number],
  TR: [541, 788] as [number, number],
  BR: [541, 56] as [number, number],
  BL: [54, 56] as [number, number],
};

export const CAIXA_LADO = 12; // lado das caixas de marcação

/**
 * Coluna "Feito" das tarefas. O espaçamento entre linhas é **dinâmico**: com
 * poucas tarefas as linhas ficam folgadas (deltaMax); com muitas (até ~20) elas
 * se comprimem para caber acima do bloco de EPIs (deltaMin). Gerador e leitor
 * usam `tarefaY(i, n)` — mesma conta dos dois lados, então nunca divergem.
 */
export const TAREFA = { x: 436, linha0: 686, deltaMax: 26, deltaMin: 14.5, floor: 392 };

/** Espaçamento entre linhas de tarefa para um total de `n` tarefas. */
export function deltaTarefas(n: number): number {
  if (n <= 0) return TAREFA.deltaMax;
  const ideal = (TAREFA.linha0 - TAREFA.floor) / n;
  return Math.max(TAREFA.deltaMin, Math.min(TAREFA.deltaMax, ideal));
}

/** Centro Y da caixa "Feito" da tarefa `i` (1-based), dado o total `n`. */
export function tarefaY(i: number, n: number): number {
  return TAREFA.linha0 - deltaTarefas(n) * i;
}

/**
 * Bloco de EPIs no rodapé, em colunas (cabe muito mais que uma coluna só).
 * O índice (0-based) preenche a 1ª coluna de cima para baixo e transborda para
 * a próxima. `epiPos(i)` dá o centro da caixa i — usado pelo gerador E pelo leitor.
 */
export const EPI = {
  linha0: 350,
  delta: 21,
  porColuna: 5,
  colX: [76, 320] as number[],
};

/** Centro da caixa de marcação do EPI de índice `i` (0-based). */
export function epiPos(i: number): { x: number; y: number } {
  const col = Math.min(Math.floor(i / EPI.porColuna), EPI.colX.length - 1);
  const row = i % EPI.porColuna;
  return { x: EPI.colX[col], y: EPI.linha0 - EPI.delta * (row + 1) };
}

/** Quantos EPIs cabem no bloco (todas as colunas cheias). */
export const EPI_CAPACIDADE = EPI.porColuna * EPI.colX.length;

/** Posição (canto inferior-esquerdo) de cada fiducial para desenhar. */
export function fidRects(): [number, number][] {
  const { x0, x1, yBot, yTop } = CARD;
  return [
    [x0 + 8, yTop - 8 - FID_LADO], // TL
    [x1 - 8 - FID_LADO, yTop - 8 - FID_LADO], // TR
    [x1 - 8 - FID_LADO, yBot + 8], // BR
    [x0 + 8, yBot + 8], // BL
  ];
}
