import { NextResponse } from "next/server";
import { lerPeriodo } from "@/lib/resumoExecutivo";
import { recusaSeNaoForOChromos } from "@/lib/chaves";
import { resumoExecutivo } from "@/services/resumoExecutivoService";

/**
 * GET /api/chromos/resumo?de=AAAA-MM&ate=AAAA-MM — números da operação por sede
 * para o Chromos. Só leitura. Autentica por `Authorization: Bearer <CHAVE_CROMOS>`,
 * não por sessão (o `middleware.ts` deixa `/api/chromos/` passar sem cookie, e o
 * portão é este aqui). Definições em `lib/resumoExecutivo.ts`.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Sem a chave, FECHADO: token vazio não pode casar com cabeçalho vazio.
  const recusa = recusaSeNaoForOChromos(req.headers.get("authorization"));
  if (recusa) return NextResponse.json({ erro: recusa.erro }, { status: recusa.status });

  const periodo = lerPeriodo(new URL(req.url).searchParams, new Date());
  if ("erro" in periodo) return NextResponse.json({ erro: periodo.erro }, { status: 400 });

  try {
    return NextResponse.json(await resumoExecutivo(periodo.de, periodo.ate));
  } catch (e) {
    console.error("[chromos/resumo]", e);
    return NextResponse.json({ erro: "Falha ao montar o resumo." }, { status: 500 });
  }
}
