import ExcelJS from "exceljs";
import { comSessao } from "@/lib/api";
import { COLUNAS } from "@/lib/importacaoRota";

/** GET /api/importar/modelo — baixa a planilha-modelo para o supervisor preencher. */
export async function GET() {
  return comSessao(async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Orkestria";

    // ── aba 1: a rota (é o que o supervisor preenche) ───────────────────
    const ws = wb.addWorksheet("Rota");
    ws.columns = COLUNAS.map((c) => ({ header: c.rotulo, key: c.chave, width: c.largura }));

    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cab.alignment = { vertical: "middle", wrapText: true };
    cab.height = 28;
    cab.eachCell((cel, i) => {
      const c = COLUNAS[i - 1];
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.obrigatorio ? "FF223127" : "FF5A7A8A" } };
      cel.border = { bottom: { style: "thin", color: { argb: "FF223127" } } };
      cel.note = `${c.obrigatorio ? "OBRIGATÓRIO. " : "Opcional. "}${c.ajuda}`;
    });

    // linha de exemplo (cinza/itálico — o supervisor apaga e escreve as dele)
    const ex = ws.addRow(Object.fromEntries(COLUNAS.map((c) => [c.chave, c.exemplo])));
    ex.font = { italic: true, color: { argb: "FF9AA39C" }, size: 10 };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: { row: 1, column: COLUNAS.length } };

    // ── aba 2: instruções ───────────────────────────────────────────────
    const gi = wb.addWorksheet("Como preencher");
    gi.columns = [
      { header: "Coluna", key: "col", width: 20 },
      { header: "Obrigatória?", key: "obr", width: 13 },
      { header: "Como preencher", key: "aj", width: 78 },
      { header: "Exemplo", key: "ex", width: 40 },
    ];
    gi.getRow(1).font = { bold: true };
    gi.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E3D6" } };
    gi.addRow({ col: "COMO FUNCIONA", obr: "", aj: "Uma linha por TAREFA do dia. Repita o nome da pessoa em todas as tarefas dela — a jornada e os intervalos vêm da primeira linha.", ex: "" }).font = { bold: true };
    gi.addRow({ col: "", obr: "", aj: "A DURAÇÃO da tarefa sai de (Fim − Início): não existe coluna de duração.", ex: "" });
    gi.addRow({ col: "", obr: "", aj: "Locais, tarefas e funcionários que já existirem na sede são REAPROVEITADOS (casa pelo nome) — não duplica.", ex: "" });
    gi.addRow({});
    for (const c of COLUNAS) {
      gi.addRow({ col: c.rotulo, obr: c.obrigatorio ? "SIM" : "não", aj: c.ajuda, ex: c.exemplo });
    }
    gi.getColumn("aj").alignment = { wrapText: true, vertical: "top" };

    const buf = await wb.xlsx.writeBuffer();
    return new Response(Buffer.from(buf as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-rota-orkestria.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  });
}
