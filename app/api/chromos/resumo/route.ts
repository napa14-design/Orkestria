import { NextResponse } from "next/server";
import { lerPeriodo, tokenConfere } from "@/lib/resumoExecutivo";
import { resumoExecutivo } from "@/services/resumoExecutivoService";

/**
 * GET /api/chromos/resumo?de=AAAA-MM&ate=AAAA-MM — números da operação por sede
 * para o Chromos. Só leitura. Autentica por `Authorization: Bearer <ORKESTRIA_TOKEN>`,
 * não por sessão (o `middleware.ts` deixa `/api/chromos/` passar sem cookie, e o
 * portão é este aqui). Definições em `lib/resumoExecutivo.ts`.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Sem a variável, FECHADO: token vazio não pode casar com cabeçalho vazio.
  const esperado = process.env.ORKESTRIA_TOKEN;
  if (!esperado) return NextResponse.json({ erro: "Integração não configurada." }, { status: 503 });

  const header = req.headers.get("authorization") ?? "";
  const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!tokenConfere(recebido, esperado))
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const periodo = lerPeriodo(new URL(req.url).searchParams, new Date());
  if ("erro" in periodo) return NextResponse.json({ erro: periodo.erro }, { status: 400 });

  try {
    return NextResponse.json(await resumoExecutivo(periodo.de, periodo.ate));
  } catch (e) {
    console.error("[chromos/resumo]", e);
    return NextResponse.json({ erro: "Falha ao montar o resumo." }, { status: 500 });
  }
}
