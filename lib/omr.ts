/**
 * Leitor OMR das fichas Orkestria — roda no NAVEGADOR (sem serviço externo).
 *
 * Não lê letra: identifica a ficha pelo QR, endireita pelos 4 cantos pretos
 * (fiduciais) via homografia, e mede a tinta dentro de cada caixa "Feito".
 * Porte 1:1 do protótipo Python validado (ver `omr-service/reader.py`).
 *
 * A geometria (em pontos PDF) é a do gerador de fichas. Mudou o layout da
 * ficha → ajuste só estas constantes.
 */
import jsQR from "jsqr";
import { CAIXA_LADO, declaracaoPos, epiPos, EPI_CAPACIDADE, FID, TAREFA, tarefaY } from "./fichaGeometria";

// ── Geometria (pontos PDF) — importada da fonte única ────────────────────
const FID_PDF = FID;
const CAIXA_X_PDF = TAREFA.x;
// linha i → y = tarefaY(i, n) (espaçamento dinâmico pelo nº de tarefas)
const CAIXA_LADO_PDF = CAIXA_LADO;
const LIMIAR_MARCA = 0.12;

// Bloco de EPIs no rodapé: posições vêm de epiPos (fonte única).

export interface LinhaOMR {
  linha: number;
  marcada: boolean;
  tinta: number;
  confianca: "alta" | "baixa";
}
export interface ResultadoOMR {
  ok: boolean;
  erro?: string;
  qr: string | null;
  tarefas: LinhaOMR[];
  epis: LinhaOMR[];
  feitas: number;
  revisar: number;
}

export interface ImagemRGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Converte RGBA → cinza (Uint8). */
function cinza(img: ImagemRGBA): Uint8Array {
  const { data, width, height } = img;
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return g;
}

/** Limiar de Otsu (0..255). */
function otsu(g: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0,
    wB = 0,
    maxVar = -1,
    limiar = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) {
      maxVar = v;
      limiar = t;
    }
  }
  return limiar;
}

/** Acha os 4 fiduciais (quadrados pretos sólidos perto dos cantos). */
function fiduciais(
  g: Uint8Array,
  w: number,
  h: number,
  thr: number,
): Record<"TL" | "TR" | "BR" | "BL", [number, number]> | null {
  const dark = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) dark[i] = g[i] < thr ? 1 : 0;

  const lado = 0.02 * w;
  const lo = 0.013 * w,
    hi = 0.045 * w;
  const margem = 0.25; // só procura dentro de 25% de cada canto

  const visit = new Uint8Array(g.length);
  const fila = new Int32Array(64 * 64 * 4);
  type Comp = { cx: number; cy: number; n: number; bw: number; bh: number };
  const comps: Comp[] = [];

  for (let p = 0; p < g.length; p++) {
    if (!dark[p] || visit[p]) continue;
    // BFS
    let head = 0,
      tail = 0;
    fila[tail++] = p;
    visit[p] = 1;
    let minx = 1e9,
      miny = 1e9,
      maxx = -1,
      maxy = -1,
      n = 0;
    let estouro = false;
    while (head < tail) {
      const q = fila[head++];
      const x = q % w,
        y = (q / w) | 0;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      n++;
      const bw = maxx - minx + 1,
        bh = maxy - miny + 1;
      if (bw > hi * 1.6 || bh > hi * 1.6) {
        estouro = true; // grande demais p/ ser fiducial — drena e descarta
      }
      const viz = [q - 1, q + 1, q - w, q + w];
      for (const r of viz) {
        if (r < 0 || r >= g.length) continue;
        // evita pular linha no -1/+1
        if ((r === q - 1 && x === 0) || (r === q + 1 && x === w - 1)) continue;
        if (dark[r] && !visit[r] && tail < fila.length) {
          visit[r] = 1;
          fila[tail++] = r;
        }
      }
    }
    if (estouro) continue;
    const bw = maxx - minx + 1,
      bh = maxy - miny + 1;
    if (bw < lo || bw > hi || bh < lo || bh > hi) continue;
    const aspect = bw / bh;
    if (aspect < 0.6 || aspect > 1.6) continue;
    if (n / (bw * bh) < 0.7) continue; // sólido
    comps.push({ cx: minx + bw / 2, cy: miny + bh / 2, n, bw, bh });
  }
  void lado;
  if (comps.length < 4) return null;

  void margem;
  // Os 4 fiduciais são os cantos do cartão (pode não preencher a imagem toda):
  // pega os pontos extremos por soma/diferença das coordenadas.
  const extremo = (fn: (c: Comp) => number, maior: boolean): number => {
    let best = -1,
      bv = maior ? -Infinity : Infinity;
    for (let i = 0; i < comps.length; i++) {
      const s = fn(comps[i]);
      if ((maior && s > bv) || (!maior && s < bv)) {
        bv = s;
        best = i;
      }
    }
    return best;
  };
  const iTL = extremo((c) => c.cx + c.cy, false);
  const iBR = extremo((c) => c.cx + c.cy, true);
  const iTR = extremo((c) => c.cx - c.cy, true);
  const iBL = extremo((c) => c.cx - c.cy, false);
  const ids = [iTL, iTR, iBR, iBL];
  if (new Set(ids).size < 4) return null;
  const ponto = (i: number): [number, number] => [comps[i].cx, comps[i].cy];
  return { TL: ponto(iTL), TR: ponto(iTR), BR: ponto(iBR), BL: ponto(iBL) };
}

/** Homografia que leva PDF → pixels (4 correspondências). Retorna 9 coef. */
function homografia(
  src: [number, number][],
  dst: [number, number][],
): number[] | null {
  // monta A (8x8) e b (8) para [h0..h7], h8=1
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  // Gauss
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 8; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const hh = new Array(9);
  for (let i = 0; i < 8; i++) hh[i] = b[i] / A[i][i];
  hh[8] = 1;
  return hh;
}

function aplica(H: number[], x: number, y: number): [number, number] {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

/** Fração de pixels escuros num quadrado PDF (centro cx,cy; lado*frac). */
function tinta(
  g: Uint8Array,
  w: number,
  h: number,
  H: number[],
  thr: number,
  cxPdf: number,
  cyPdf: number,
  ladoPt: number,
  frac: number,
): number {
  const r = (ladoPt * frac) / 2;
  const cantos = [
    aplica(H, cxPdf - r, cyPdf - r),
    aplica(H, cxPdf + r, cyPdf - r),
    aplica(H, cxPdf + r, cyPdf + r),
    aplica(H, cxPdf - r, cyPdf + r),
  ];
  let minx = 1e9,
    miny = 1e9,
    maxx = -1,
    maxy = -1;
  for (const [px, py] of cantos) {
    minx = Math.min(minx, px);
    maxx = Math.max(maxx, px);
    miny = Math.min(miny, py);
    maxy = Math.max(maxy, py);
  }
  minx = Math.max(0, Math.floor(minx));
  miny = Math.max(0, Math.floor(miny));
  maxx = Math.min(w - 1, Math.ceil(maxx));
  maxy = Math.min(h - 1, Math.ceil(maxy));
  let dark = 0,
    tot = 0;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      tot++;
      if (g[y * w + x] < thr) dark++;
    }
  }
  return tot === 0 ? 0 : dark / tot;
}

function confianca(fi: number): "alta" | "baixa" {
  return fi >= 0.2 || fi <= 0.05 ? "alta" : "baixa";
}

export interface DadosQR {
  sede: string;
  data: string;
  funcionario: string;
  /**
   * 1 = ORK1 (casa por posição);
   * 2 = ORK2 (casa por código, com n impresso; uma caixa por EPI);
   * 3 = ORK3 (idem ORK2, mas o bloco de EPI é UMA declaração).
   */
  versao: 1 | 2 | 3;
  /** ORK2/ORK3: nº de tarefas impressas (geometria) e códigos das linhas. */
  n?: number;
  codigos?: string[];
}

/**
 * Decompõe o QR. ORK1: `ORK1|sede|data|func` (casa por posição).
 * ORK2: `ORK2|sede|data|func|n|cod1,cod2,…` (casa por código; blinda contra a
 * rotina mudar depois de imprimir).
 */
export function parseQR(qr: string | null): DadosQR | null {
  if (!qr) return null;
  const p = qr.split("|");
  if ((p[0] === "ORK2" || p[0] === "ORK3") && p.length >= 6) {
    return {
      sede: p[1],
      data: p[2],
      funcionario: p[3],
      versao: p[0] === "ORK3" ? 3 : 2,
      n: Number(p[4]) || 0,
      codigos: (p[5] ?? "").split(",").filter(Boolean),
    };
  }
  if (p[0] === "ORK1" && p.length >= 4) {
    return { sede: p[1], data: p[2], funcionario: p[3], versao: 1 };
  }
  return null;
}

/**
 * Lê uma ficha. Se `numTarefas` for informado (vem do QR→banco), mede
 * exatamente essas linhas (determinístico). Sem ele, descobre quantas há.
 */
export function lerFicha(
  img: ImagemRGBA,
  opts: {
    numTarefas?: number;
    numEpis?: number;
    maxLinhas?: number;
    /** ORK3: o bloco de EPI é UMA declaração — lê só a caixa dela. */
    declaracaoEpi?: boolean;
  } = {},
): ResultadoOMR {
  const { width: w, height: h } = img;
  const g = cinza(img);
  const thr = otsu(g);

  // QR
  let qr: string | null = null;
  try {
    const r = jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" });
    qr = r?.data ?? null;
  } catch {
    qr = null;
  }

  const fid = fiduciais(g, w, h, thr);
  if (!fid) return { ok: false, erro: "fiduciais não encontrados", qr, tarefas: [], epis: [], feitas: 0, revisar: 0 };

  const H = homografia(
    [FID_PDF.TL, FID_PDF.TR, FID_PDF.BR, FID_PDF.BL],
    [fid.TL, fid.TR, fid.BR, fid.BL],
  );
  if (!H) return { ok: false, erro: "alinhamento falhou", qr, tarefas: [], epis: [], feitas: 0, revisar: 0 };

  const linhas: LinhaOMR[] = [];
  const max = opts.numTarefas ?? opts.maxLinhas ?? 14;
  // espaçamento das linhas é função do total de tarefas (igual ao gerador)
  const nT = opts.numTarefas ?? max;
  let semBox = 0,
    comecou = false;
  for (let i = 1; i <= max; i++) {
    const cy = tarefaY(i, nT);
    const fi = tinta(g, w, h, H, thr, CAIXA_X_PDF, cy, CAIXA_LADO_PDF, 0.55);
    if (opts.numTarefas) {
      linhas.push({ linha: i, marcada: fi > LIMIAR_MARCA, tinta: +fi.toFixed(3), confianca: confianca(fi) });
    } else {
      const fb = tinta(g, w, h, H, thr, CAIXA_X_PDF, cy, CAIXA_LADO_PDF * 1.6, 1.0);
      if (fb > 0.18) {
        comecou = true;
        semBox = 0;
        linhas.push({ linha: linhas.length + 1, marcada: fi > LIMIAR_MARCA, tinta: +fi.toFixed(3), confianca: confianca(fi) });
      } else if (comecou && ++semBox >= 3) {
        break;
      }
    }
  }

  // Bloco de EPIs no rodapé. ORK3: UMA caixa (declaração). ORK2 e anteriores:
  // uma caixa por EPI, em colunas. Posições sempre da geometria (fonte única).
  const epis: LinhaOMR[] = [];
  if (opts.declaracaoEpi) {
    const { x: dx, y: dy } = declaracaoPos(nT);
    const fi = tinta(g, w, h, H, thr, dx, dy, CAIXA_LADO_PDF, 0.55);
    epis.push({ linha: 1, marcada: fi > LIMIAR_MARCA, tinta: +fi.toFixed(3), confianca: confianca(fi) });
    return {
      ok: true,
      qr,
      tarefas: linhas,
      epis,
      feitas: linhas.filter((l) => l.marcada).length,
      revisar: [...linhas, ...epis].filter((l) => l.confianca === "baixa").length,
    };
  }
  const maxE = opts.numEpis ?? EPI_CAPACIDADE;
  let semBoxE = 0,
    comecouE = false;
  for (let i = 1; i <= maxE; i++) {
    const { x: ex, y: cy } = epiPos(i - 1, nT);
    const fi = tinta(g, w, h, H, thr, ex, cy, CAIXA_LADO_PDF, 0.55);
    if (opts.numEpis) {
      epis.push({ linha: i, marcada: fi > LIMIAR_MARCA, tinta: +fi.toFixed(3), confianca: confianca(fi) });
    } else {
      const fb = tinta(g, w, h, H, thr, ex, cy, CAIXA_LADO_PDF * 1.6, 1.0);
      if (fb > 0.18) {
        comecouE = true;
        semBoxE = 0;
        epis.push({ linha: epis.length + 1, marcada: fi > LIMIAR_MARCA, tinta: +fi.toFixed(3), confianca: confianca(fi) });
      } else if (comecouE && ++semBoxE >= 2) {
        break;
      }
    }
  }

  return {
    ok: true,
    qr,
    tarefas: linhas,
    epis,
    feitas: linhas.filter((l) => l.marcada).length,
    revisar: [...linhas, ...epis].filter((l) => l.confianca === "baixa").length,
  };
}
