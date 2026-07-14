/**
 * Gera as fichas de rotina como PDF de LAYOUT FIXO (pdf-lib), usando a mesma
 * geometria do leitor OMR (lib/fichaGeometria). É a ficha "oficial" para
 * impressão — o que sai daqui é lido com 100% de confiança por lib/omr.
 */
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { getDataSource } from "@/lib/datasource";
import { CARD, EPI, epiPos, epiTopo, FID_LADO, fidRects, CAIXA_LADO, PAGINA, TAREFA, tarefaY, deltaTarefas, codigoLinha } from "@/lib/fichaGeometria";
import { formatarDataBR, formatarDuracao, hhmmParaMin } from "@/lib/dateUtils";

const TINTA = rgb(0.13, 0.19, 0.15);
const CINZA = rgb(0.3, 0.34, 0.3);
const CINZA3 = rgb(0.45, 0.45, 0.42);
const ACENTO = rgb(0.61, 0.05, 0.22);
const LINHA = rgb(0.8, 0.78, 0.7);
const PRETO = rgb(0, 0, 0);

const ROT_SERVICO: Record<string, string> = { pesada: "pesada", desincrustante: "desincrustante" };

interface LinhaFicha {
  ini: string;
  fim: string;
  nome: string;
  servico?: string;
  local: string;
  dur: string;
}
interface FichaInput {
  nome: string;
  sedeNome: string;
  dataBR: string;
  qr: string;
  tarefas: LinhaFicha[];
  epis: string[];
}

function trunc(font: PDFFont, s: string, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  let r = s;
  while (r.length > 1 && font.widthOfTextAtSize(r + "…", size) > maxW) r = r.slice(0, -1);
  return r + "…";
}

function colunas() {
  const { x0, x1 } = CARD;
  const defs: [string, number][] = [["Horário", 64], ["Tarefa", 178], ["Local", 90], ["Tempo", 44], ["Feito", 40], ["Anotações", 0]];
  const usable = x1 - x0;
  const fixo = defs.reduce((s, [, w]) => s + w, 0);
  let acc = x0;
  return defs.map(([n, w]) => {
    const larg = w || usable - fixo;
    const o = { nome: n, x: acc, w: larg };
    acc += larg;
    return o;
  });
}

function desenhaX(page: PDFPage, cx: number, cy: number) {
  const r = CAIXA_LADO / 2 - 1.5;
  page.drawLine({ start: { x: cx - r, y: cy - r }, end: { x: cx + r, y: cy + r }, thickness: 1.6, color: PRETO });
  page.drawLine({ start: { x: cx - r, y: cy + r }, end: { x: cx + r, y: cy - r }, thickness: 1.6, color: PRETO });
}

async function desenhaFicha(
  doc: PDFDocument,
  fonts: { reg: PDFFont; bold: PDFFont; obl: PDFFont },
  logo: { img: PDFImage; asp: number } | null,
  f: FichaInput,
  marcarTodas: boolean,
) {
  const page = doc.addPage([PAGINA.W, PAGINA.H]);
  const { x0, x1, yBot, yTop } = CARD;
  const { reg, bold, obl } = fonts;

  page.drawRectangle({ x: x0, y: yBot, width: x1 - x0, height: yTop - yBot, borderColor: TINTA, borderWidth: 1.4 });
  for (const [fx, fy] of fidRects()) page.drawRectangle({ x: fx, y: fy, width: FID_LADO, height: FID_LADO, color: PRETO });

  // cabeçalho: logo + nome + sede·data
  let nomeX = x0 + 18;
  if (logo) {
    const lw = 150, lh = lw / logo.asp;
    page.drawImage(logo.img, { x: x0 + 6, y: yTop - 8 - FID_LADO - 5 - lh, width: lw, height: lh });
    nomeX = x0 + 6 + lw + 22;
  }
  page.drawText(f.nome, { x: nomeX, y: yTop - 44, size: 18, font: bold, color: TINTA });
  page.drawText(`${f.sedeNome}  -  ${f.dataBR}`, { x: nomeX, y: yTop - 59, size: 9, font: reg, color: CINZA });

  // QR (o leitor o localiza sozinho — posição é só visual)
  const qrPng = await doc.embedPng(await QRCode.toBuffer(f.qr, { margin: 1, scale: 6 }));
  page.drawImage(qrPng, { x: x1 - 70, y: yTop - 76, width: 52, height: 52 });
  page.drawText("LEITURA", { x: x1 - 60, y: yTop - 84, size: 6, font: reg, color: PRETO });

  // tabela
  const cols = colunas();
  const ty = 686;
  page.drawLine({ start: { x: x0, y: ty + 10 }, end: { x: x1, y: ty + 10 }, thickness: 0.6, color: TINTA });
  for (const c of cols) {
    const t = c.nome.toUpperCase();
    if (c.nome === "Feito") page.drawText(t, { x: c.x + c.w / 2 - bold.widthOfTextAtSize(t, 7.5) / 2, y: ty, size: 7.5, font: bold, color: CINZA });
    else page.drawText(t, { x: c.x + 4, y: ty, size: 7.5, font: bold, color: CINZA });
  }
  page.drawLine({ start: { x: x0, y: ty - 6 }, end: { x: x1, y: ty - 6 }, thickness: 0.5, color: LINHA });

  const nT = f.tarefas.length;
  const dT = deltaTarefas(nT);
  f.tarefas.forEach((t, idx) => {
    const i = idx + 1;
    const cy = tarefaY(i, nT); // centro da caixa (espaçamento dinâmico)
    const baseY = cy - 4; // baseline do texto da linha
    page.drawText(`${t.ini}-${t.fim}`, { x: cols[0].x + 4, y: baseY, size: 8, font: reg, color: TINTA });
    const lab = trunc(bold, t.nome, 8, cols[1].w - 8);
    page.drawText(lab, { x: cols[1].x + 4, y: baseY, size: 8, font: bold, color: TINTA });
    if (t.servico && ROT_SERVICO[t.servico]) {
      const wl = bold.widthOfTextAtSize(lab, 8);
      const tag = `  · ${ROT_SERVICO[t.servico]}`;
      if (4 + wl + obl.widthOfTextAtSize(tag, 7) <= cols[1].w - 4)
        page.drawText(tag, { x: cols[1].x + 4 + wl, y: baseY, size: 7, font: obl, color: CINZA3 });
    }
    page.drawText(trunc(reg, t.local, 8, cols[2].w - 6), { x: cols[2].x + 4, y: baseY, size: 8, font: reg, color: TINTA });
    page.drawText(t.dur, { x: cols[3].x + 4, y: baseY, size: 8, font: reg, color: TINTA });
    page.drawRectangle({ x: TAREFA.x - 6, y: cy - 6, width: CAIXA_LADO, height: CAIXA_LADO, borderColor: PRETO, borderWidth: 1.2 });
    if (marcarTodas) desenhaX(page, TAREFA.x, cy);
    page.drawLine({ start: { x: x0, y: cy - dT / 2 }, end: { x: x1, y: cy - dT / 2 }, thickness: 0.5, color: LINHA });
  });

  // instrução (abaixo da última linha)
  const ultimaY = tarefaY(nT, nT) - dT / 2;
  page.drawText(
    "Marque um X dentro da caixa do que foi feito. Não escreva sobre os quadrados pretos dos cantos.",
    { x: x0 + 12, y: ultimaY - 14, size: 7.5, font: reg, color: CINZA3 },
  );

  // EPIs no rodapé (em colunas). O topo acompanha o fim das tarefas — nunca colide.
  const topoEpi = epiTopo(nT);
  if (f.epis.length) {
    page.drawText("EPIS UTILIZADOS (marque o que usou):", { x: x0 + 12, y: topoEpi + 6, size: 8, font: bold, color: ACENTO });
    f.epis.forEach((nome, idx) => {
      const { x: cx, y: cy } = epiPos(idx, nT);
      page.drawRectangle({ x: cx - 6, y: cy - 6, width: CAIXA_LADO, height: CAIXA_LADO, borderColor: PRETO, borderWidth: 1.2 });
      if (marcarTodas) desenhaX(page, cx, cy);
      const larguraNome = (idx >= EPI.porColuna ? CARD.x1 : EPI.colX[1]) - (cx + 14) - 4;
      page.drawText(trunc(reg, nome, 9, larguraNome), { x: cx + 14, y: cy - 3, size: 9, font: reg, color: TINTA });
    });
  }

  // Observações / ocorrências — logo abaixo do que veio antes (EPIs ou tarefas).
  const fimAcima = f.epis.length ? topoEpi - EPI.delta * EPI.porColuna : ultimaY - 24;
  const obsTop = Math.max(178, Math.min(228, fimAcima - 24));
  page.drawText("OBSERVAÇÕES / OCORRÊNCIAS DO DIA:", { x: x0 + 12, y: obsTop, size: 8, font: bold, color: ACENTO });
  for (const ly of [obsTop - 20, obsTop - 44, obsTop - 68]) {
    page.drawLine({ start: { x: x0 + 12, y: ly }, end: { x: x1 - 12, y: ly }, thickness: 0.5, color: LINHA });
  }

  // assinaturas
  const sy = yBot + 44;
  page.drawLine({ start: { x: x0 + 30, y: sy }, end: { x: x0 + 230, y: sy }, thickness: 0.8, color: TINTA });
  page.drawLine({ start: { x: x1 - 230, y: sy }, end: { x: x1 - 30, y: sy }, thickness: 0.8, color: TINTA });
  page.drawText("Assinatura do funcionário", { x: x0 + 130 - reg.widthOfTextAtSize("Assinatura do funcionário", 8) / 2, y: sy - 12, size: 8, font: reg, color: CINZA });
  page.drawText("Assinatura do supervisor", { x: x1 - 130 - reg.widthOfTextAtSize("Assinatura do supervisor", 8) / 2, y: sy - 12, size: 8, font: reg, color: CINZA });
}

/** Monta o PDF (uma página por funcionário com rotina no dia). */
export async function gerarFichasPdf(
  sedeId: string,
  data: string,
  opts: { marcarTodas?: boolean } = {},
): Promise<{ bytes: Uint8Array; fichas: number }> {
  const ds = await getDataSource();
  const [sede, funcs, rotinasTodas, tarefas, locais, requisitos, ausenciasTodas] = await Promise.all([
    ds.obter("sedes", sedeId),
    ds.consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: data }]),
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.consultar("locais", [{ campo: "sede_id", op: "==", valor: sedeId }]),
    ds.listar("requisitos"),
    ds.consultar("ausencias", [{ campo: "sede_id", op: "==", valor: sedeId }]),
  ]);

  const rotinas = rotinasTodas.filter((r) => r.sede_id === sedeId);
  const ausentes = new Set(
    ausenciasTodas.filter((a) => a.data_inicio <= data && data <= a.data_fim).map((a) => a.funcionario_id),
  );
  const tPorId = new Map(tarefas.map((t) => [t.id, t]));
  const lPorId = new Map(locais.map((l) => [l.id, l]));
  const reqPorId = new Map(requisitos.map((r) => [r.id, r]));
  const dataBR = formatarDataBR(data);
  const sedeNome = sede?.nome_sede ?? sedeId;

  const entradas: FichaInput[] = [];
  for (const f of funcs.filter((x) => x.ativo && !ausentes.has(x.id))) {
    const doFunc = rotinas
      .filter((r) => r.funcionario_id === f.id && r.status !== "cancelada")
      .sort((a, b) => hhmmParaMin(a.inicio_planejado) - hhmmParaMin(b.inicio_planejado));
    if (!doFunc.length) continue;

    const epis: string[] = [];
    const vistos = new Set<string>();
    const tarefasFicha: LinhaFicha[] = doFunc.map((r) => {
      const t = tPorId.get(r.tarefa_id);
      const l = lPorId.get(r.local_id);
      for (const id of (t?.requisitos ?? "").split(",").filter(Boolean)) {
        const req = reqPorId.get(id);
        if (req?.tipo === "epi" && !vistos.has(req.nome)) {
          vistos.add(req.nome);
          epis.push(req.nome);
        }
      }
      return {
        ini: r.inicio_planejado,
        fim: r.fim_planejado,
        nome: t?.nome_tarefa ?? "Tarefa",
        servico: t?.tipo_servico,
        local: l ? `${l.nome_local} (${l.andar})` : "",
        dur: formatarDuracao(r.tempo_previsto_min),
      };
    });
    // QR ORK2: carrega o nº impresso de tarefas e os códigos das linhas (ordem
    // impressa) — a conferência casa por código, não por posição, e usa este n
    // na geometria (blindado contra a rotina mudar depois de imprimir).
    const codigos = doFunc.map((r) => codigoLinha(r.funcionario_id, r.tarefa_id, r.inicio_planejado));
    const qr = `ORK2|${sedeId}|${data}|${f.id}|${doFunc.length}|${codigos.join(",")}`;
    entradas.push({ nome: f.nome, sedeNome, dataBR, qr, tarefas: tarefasFicha, epis });
  }

  const doc = await PDFDocument.create();
  const fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    obl: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  let logo: { img: PDFImage; asp: number } | null = null;
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "logo-horizontal-fundo-claro.png"));
    const img = await doc.embedPng(bytes);
    logo = { img, asp: img.width / img.height };
  } catch {
    logo = null;
  }

  if (!entradas.length) {
    // página única avisando que não há fichas
    const page = doc.addPage([PAGINA.W, PAGINA.H]);
    page.drawText(`Sem rotinas planejadas para ${dataBR} nesta sede.`, { x: 60, y: PAGINA.H - 80, size: 12, font: fonts.reg, color: TINTA });
  } else {
    for (const e of entradas) await desenhaFicha(doc, fonts, logo, e, !!opts.marcarTodas);
  }

  const bytes = await doc.save();
  return { bytes, fichas: entradas.length };
}
