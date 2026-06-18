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

export const CARD = { x0: 40, x1: 555, yBot: 250, yTop: 802 };

export const FID_LADO = 12; // lado do quadrado fiducial
/** Centros dos 4 fiduciais (cantos do cartão). */
export const FID = {
  TL: [54, 788] as [number, number],
  TR: [541, 788] as [number, number],
  BR: [541, 264] as [number, number],
  BL: [54, 264] as [number, number],
};

export const CAIXA_LADO = 12; // lado das caixas de marcação

/** Coluna "Feito" das tarefas: caixa i centrada em (x, linha0 - delta*i). */
export const TAREFA = { x: 436, linha0: 690, delta: 21 };

/** Bloco de EPIs no rodapé: caixa i centrada em (x, linha0 - delta*i). */
export const EPI = { x: 76, linha0: 382, delta: 18 };

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
