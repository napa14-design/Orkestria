import { comSessao } from "@/lib/api";
import { leituraCompleta, limitarSedeConsulta } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { gerarFichasPdf } from "@/services/fichaPdf";
import { somarDias } from "@/lib/dateUtils";

const DATA = /^\d{4}-\d{2}-\d{2}$/u;
/** Uma semana: o PDF de um período maior seria um maço que ninguém imprime de uma vez. */
const MAX_DIAS = 7;

/**
 * GET /api/fichas/pdf?data=YYYY-MM-DD&sede=ID → PDF das fichas do dia (layout fixo p/ OMR).
 * GET /api/fichas/pdf?de=YYYY-MM-DD&ate=YYYY-MM-DD&sede=ID → a semana, dia a dia.
 */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    // O supervisor (perfil de chão) vê a rota e marca o feito; imprimir a ficha
    // não é dele (decisão do dono, 19/10/2026) — no servidor, não só na tela.
    if (!leituraCompleta(sessao)) throw new ErroPermissao("Seu perfil não imprime fichas.");
    const url = new URL(req.url);
    const data = url.searchParams.get("data");
    const de = url.searchParams.get("de") ?? data;
    const ate = url.searchParams.get("ate") ?? data;
    const sede = url.searchParams.get("sede");
    if (!de || !ate || !sede || !DATA.test(de) || !DATA.test(ate) || ate < de)
      return new Response("Informe a data (ou de/até) e a sede.", { status: 400 });
    const datas: string[] = [];
    for (let d = de; d <= ate && datas.length <= MAX_DIAS; d = somarDias(d, 1)) datas.push(d);
    // Cada dia tem de ser data REAL e o laço tem de chegar exatamente em `ate`:
    // 9999-12-31 + 1 vira "10000-01-01", que ordena ANTES e transformava 4 dias
    // numa leitura do histórico inteiro da sede (revisão de segurança); e
    // 2099-02-30 passava no formato.
    if (
      datas.length > MAX_DIAS ||
      datas.some((d) => !DATA.test(d) || somarDias(d, 0) !== d) ||
      datas[datas.length - 1] !== ate
    )
      return new Response(`Período inválido: datas reais, no máximo ${MAX_DIAS} dias por vez.`, { status: 400 });
    const sedePermitida = limitarSedeConsulta(sessao, sede);
    // marcar=todas: gabarito de teste (todas as caixas com X) — calibração do leitor
    const marcarTodas = url.searchParams.get("marcar") === "todas";
    const { bytes } = await gerarFichasPdf(sedePermitida ?? sede, datas, { marcarTodas });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="fichas-${de === ate ? de : `${de}_a_${ate}`}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
