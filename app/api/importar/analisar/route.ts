import ExcelJS from "exceljs";
import { comSessao, ok } from "@/lib/api";
import { podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { analisarRota, COLUNAS, type LinhaPlanilha } from "@/lib/importacaoRota";

/**
 * POST /api/importar/analisar (multipart: arquivo) — lê a planilha (.xlsx/.csv),
 * valida e devolve o que SERIA criado. **Não grava nada** (preview).
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const form = await req.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) return ok({ erro: "Envie o arquivo da planilha." }, 400);

    if (!/\.xlsx$/i.test(arquivo.name))
      return ok({ erro: "Envie o arquivo em .xlsx (o modelo baixado aqui). CSV não é aceito porque o separador do Excel pt-BR varia e quebra a leitura." }, 400);

    const buf = Buffer.from(await arquivo.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    try {
      // (cast: os tipos do Node 24 usam Buffer<ArrayBuffer>, o ExcelJS espera Buffer)
      await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    } catch {
      return ok({ erro: "Não consegui ler o arquivo. Use o modelo (.xlsx) baixado aqui." }, 400);
    }

    // usa a 1ª aba (no modelo é a "Rota")
    const ws = wb.getWorksheet("Rota") ?? wb.worksheets[0];
    if (!ws) return ok({ erro: "A planilha está vazia." }, 400);

    // casa o cabeçalho pelo RÓTULO (a ordem das colunas pode variar)
    const cabecalho: string[] = [];
    ws.getRow(1).eachCell((cel, i) => { cabecalho[i] = String(cel.value ?? "").trim(); });
    const porRotulo = new Map(COLUNAS.map((c) => [c.rotulo.toLowerCase(), c.chave]));
    const idxParaChave = new Map<number, string>();
    cabecalho.forEach((rot, i) => {
      const k = porRotulo.get((rot ?? "").toLowerCase());
      if (k) idxParaChave.set(i, k);
    });
    const faltando = COLUNAS.filter((c) => c.obrigatorio && ![...idxParaChave.values()].includes(c.chave));
    if (faltando.length)
      return ok({ erro: `A planilha não tem as colunas obrigatórias: ${faltando.map((c) => c.rotulo).join(", ")}. Baixe o modelo e use o cabeçalho dele.` }, 400);

    const linhas: LinhaPlanilha[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return; // cabeçalho
      const l: LinhaPlanilha = {};
      row.eachCell({ includeEmpty: true }, (cel, i) => {
        const k = idxParaChave.get(i);
        if (!k) return;
        const v = cel.value;
        // hora vinda como Date (Excel) → HH:mm
        if (v instanceof Date) {
          l[k] = `${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
        } else if (v && typeof v === "object" && "text" in v) {
          l[k] = String((v as { text: unknown }).text ?? "");
        } else {
          l[k] = v == null ? "" : String(v);
        }
      });
      linhas.push(l);
    });

    const analise = analisarRota(linhas);
    return ok({ analise, linhasLidas: linhas.length });
  });
}
