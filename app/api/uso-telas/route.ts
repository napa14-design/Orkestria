import { NextResponse } from "next/server";
import { comSessao } from "@/lib/api";
import { TELAS_DO_CLIENTE } from "@/lib/usoTelas";
import { registrarUso } from "@/services/usoTelasService";

/**
 * POST /api/uso-telas — { tela, sede_id }. Sem rota de leitura de propósito: os
 * dados só saem por script do dono. O corpo não diz perfil nem dia: vêm da sessão
 * e do relógio do servidor. Ver `lib/usoTelas.ts`.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const corpo = (await req.json().catch(() => null)) as { tela?: unknown; sede_id?: unknown } | null;
    if (!TELAS_DO_CLIENTE.has(corpo?.tela)) return NextResponse.json({ erro: "Tela inválida." }, { status: 422 });
    // Com o banco fora, a tela segue: quem abriu não tem o que fazer com o erro.
    await registrarUso(sessao, corpo!.tela as string, corpo!.sede_id).catch((e) => console.error("[uso-telas]", e));
    return new NextResponse(null, { status: 204 });
  });
}
