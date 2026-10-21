import { NextResponse } from "next/server";
import { comSessao } from "@/lib/api";

/**
 * GET → { versao } do deploy que está no ar. A aba aberta compara com a versão
 * dela para saber se precisa recarregar. Com sessão (não é rota pública), e sem
 * banco: a sessão é o cookie assinado, então não custa leitura no Firestore.
 */
export async function GET() {
  return comSessao(async () =>
    NextResponse.json({ versao: process.env.NEXT_PUBLIC_VERSAO ?? "" }, { headers: { "Cache-Control": "no-store" } }),
  );
}
