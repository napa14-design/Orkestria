import { comSessao } from "@/lib/api";
import { gerarFichasPdf } from "@/services/fichaPdf";

/** GET /api/fichas/pdf?data=YYYY-MM-DD&sede=ID  → PDF das fichas (layout fixo p/ OMR). */
export async function GET(req: Request) {
  return comSessao(async () => {
    const url = new URL(req.url);
    const data = url.searchParams.get("data");
    const sede = url.searchParams.get("sede");
    if (!data || !sede) return new Response("Informe data e sede.", { status: 400 });
    // marcar=todas: gabarito de teste (todas as caixas com X) — calibração do leitor
    const marcarTodas = url.searchParams.get("marcar") === "todas";
    const { bytes } = await gerarFichasPdf(sede, data, { marcarTodas });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="fichas-${data}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
