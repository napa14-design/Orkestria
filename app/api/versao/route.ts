import { NextResponse } from "next/server";
import { comSessao } from "@/lib/api";

/**
 * GET → { versao } do deploy que está no ar. A aba aberta compara com a versão
 * dela para saber se precisa recarregar. Com sessão (não é rota pública). Quase
 * sempre sem banco: a sessão é o cookie assinado. Uma vez por hora a chamada
 * relê o cadastro para renovar a sessão (lib/api.ts) — e, como a aba visível
 * pergunta isto a cada 5 min, "inatividade" passa a ser "nenhuma aba visível".
 */
export async function GET() {
  return comSessao(async () =>
    NextResponse.json({ versao: process.env.NEXT_PUBLIC_VERSAO ?? "" }, { headers: { "Cache-Control": "no-store" } }),
  );
}
