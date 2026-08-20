/**
 * Geometria da ficha (em pontos PDF) — FONTE ÚNICA compartilhada pelo gerador
 * de PDF (`services/fichaPdf.ts`) e pelo leitor OMR (`lib/omr.ts`).
 *
 * Enquanto os dois importarem daqui, a ficha impressa e a leitura nunca
 * divergem. Mudou o layout? Mude só este arquivo.
 *
 * Convenção PDF: origem no canto inferior-esquerdo, y cresce para cima.
 */
/**
 * Código curto e ESTÁVEL de uma linha da ficha (6 chars base36), derivado de
 * funcionário+tarefa+início. Vai no QR (ORK2) na ordem impressa; a conferência
 * recomputa o mesmo código para casar cada marcação com a rotina certa — mesmo
 * que a rotina do dia tenha mudado depois de imprimir (fim do "casa por posição").
 * Gerador (fichaPdf) e leitor (conferir) importam esta função — nunca divergem.
 */
export function codigoLinha(funcId: string, tarefaId: string, inicio: string): string {
  const s = `${funcId}|${tarefaId}|${inicio}`;
  let h = 0x811c9dc5; // FNV-1a 32 bits
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(6, "0").slice(-6);
}

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
/**
 * `deltaMin` 13,2pt é o mínimo seguro: a caixa tem 12pt e o leitor amostra só
 * ±3,3pt do centro, então a tinta da caixa vizinha (a ≥7pt) nunca contamina.
 * Abaixo disso a ficha começa a não caber (limite prático ≈ 27 tarefas/página).
 */
export const TAREFA = { x: 436, linha0: 686, deltaMax: 26, deltaMin: 13.2, floor: 345 };

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
 * a próxima.
 *
 * O topo do bloco é **dinâmico**: acompanha o fim da lista de tarefas (que varia
 * com `n`), entre um TETO (poucas tarefas → EPI logo abaixo delas, sem buraco) e
 * um PISO (muitas tarefas → desce até aqui, sem invadir as Observações). Antes era
 * fixo em 350 e, com ~22 tarefas, a lista descia e colidia com o título dos EPIs.
 */
export const EPI = {
  tetoTopo: 350, // mais alto que o bloco pode ficar (poucas tarefas)
  pisoTopo: 302, // mais baixo (muitas tarefas) — abaixo disso invade Observações
  delta: 21,
  porColuna: 5,
  colX: [76, 320] as number[],
};

/** Topo do bloco de EPIs para um total de `n` tarefas (gerador E leitor). */
export function epiTopo(n: number): number {
  const ultimaSeparadora = tarefaY(n, n) - deltaTarefas(n) / 2;
  return Math.max(EPI.pisoTopo, Math.min(EPI.tetoTopo, ultimaSeparadora - 32));
}

/** Centro da caixa de marcação do EPI de índice `i` (0-based), dado o total `n` de tarefas. */
export function epiPos(i: number, n: number): { x: number; y: number } {
  const col = Math.min(Math.floor(i / EPI.porColuna), EPI.colX.length - 1);
  const row = i % EPI.porColuna;
  return { x: EPI.colX[col], y: epiTopo(n) - EPI.delta * (row + 1) };
}

/** Quantos EPIs cabem no bloco (todas as colunas cheias). */
export const EPI_CAPACIDADE = EPI.porColuna * EPI.colX.length;

/**
 * ORK3 — caixa ÚNICA da declaração de EPIs (ata de 17/07: o funcionário não
 * escolhe item a item; declara que usou os EPIs corretos, que vêm listados
 * nominalmente ao lado para o registro continuar dizendo o que de fato foi
 * usado).
 *
 * Ocupa exatamente a posição da 1ª caixa do layout antigo — assim a âncora do
 * bloco (`epiTopo`) e as Observações abaixo seguem valendo sem recalibração.
 */
export function declaracaoPos(n: number): { x: number; y: number } {
  return epiPos(0, n);
}

/**
 * Quantas tarefas cabem numa ficha — **derivado**, não escolhido.
 *
 * A partir de certo `n` a lista de tarefas desce até encostar na primeira caixa
 * do bloco de EPI (que tem piso em `EPI.pisoTopo` e não desce mais). Daí em
 * diante a ficha impressa fica errada: as marcas se sobrepõem e, por volta de
 * `n = 49`, as últimas caixas caem **abaixo da borda da página** e nem são
 * impressas — o leitor amostraria fora do cartão.
 *
 * Já aconteceu antes com o topo do bloco fixo em 350 (colidia em ~22). O topo
 * virou dinâmico e a colisão foi para 31 — continuava existindo, só mais longe.
 * Por isso o limite é **calculado da própria invariante**: mexer no layout
 * recalcula o número, em vez de deixar um valor escrito à mão envelhecer.
 */
export const CAPACIDADE_TAREFAS = (() => {
  const raioAmostra = (CAIXA_LADO * 0.55) / 2;
  for (let n = 1; n <= 200; n++) {
    if (epiPos(0, n).y >= tarefaY(n, n) - 2 * raioAmostra) return n - 1;
  }
  return 200;
})();

/** A ficha de `n` tarefas pode ser impressa numa página sem sobrepor nada? */
export function cabeNaFicha(n: number): boolean {
  return n <= CAPACIDADE_TAREFAS;
}

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
