import { comSessao } from "@/lib/api";
import { leituraCompleta, limitarSedeConsulta } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { gerarFichasPdf } from "@/services/fichaPdf";

/** GET /api/fichas/pdf?data=YYYY-MM-DD&sede=ID  → PDF das fichas (layout fixo p/ OMR). */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    // O supervisor (perfil de chão) vê a rota e marca o feito; imprimir a ficha
    // não é dele (decisão do dono, 19/10/2026) — no servidor, não só na tela.
    if (!leituraCompleta(sessao)) throw new ErroPermissao("Seu perfil não imprime fichas.");
    const url = new URL(req.url);
    const data = url.searchParams.get("data");
    const sede = url.searchParams.get("sede");
    if (!data || !sede) return new Response("Informe data e sede.", { status: 400 });
    const sedePermitida = limitarSedeConsulta(sessao, sede);
    // marcar=todas: gabarito de teste (todas as caixas com X) — calibração do leitor
    const marcarTodas = url.searchParams.get("marcar") === "todas";
    const { bytes } = await gerarFichasPdf(sedePermitida ?? sede, data, { marcarTodas });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="fichas-${data}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
