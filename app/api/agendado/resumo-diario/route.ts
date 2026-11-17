import { NextResponse } from "next/server";
import { enviarResumoDiario } from "@/services/resumoDiarioService";

/**
 * GET /api/agendado/resumo-diario — chamado pelo Vercel Cron (vercel.json) às 10h de
 * Fortaleza, de segunda a sábado. SEM chave, por decisão do dono (nenhum segredo novo):
 * qualquer um pode chamar, e nada distingue o cron de um estranho (cabeçalhos `x-vercel-*`
 * e `vercel-cron/1.0` se forjam). O pior que se consegue é antecipar o e-mail do dia dentro
 * da janela. As travas estão no serviço. A rota não lê nada do pedido, e quem chama só fica
 * sabendo "ok" ou "fora da janela" — o status fino (enviado, sem destinatário…) vai ao log.
 */
export const dynamic = "force-dynamic";

const responder = (status: "ok" | "fora da janela") =>
  NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const r = await enviarResumoDiario();
    if (r !== "fora da janela") console.info("[agendado/resumo-diario]", r);
    return responder(r === "fora da janela" ? "fora da janela" : "ok");
  } catch (e) {
    console.error("[agendado/resumo-diario]", e);
    return responder("ok");
  }
}

const soLeitura = () =>
  NextResponse.json({ erro: "Método não permitido." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
export const POST = soLeitura;
export const PUT = soLeitura;
export const DELETE = soLeitura;
export const PATCH = soLeitura;
