/** Helpers das rotas de API: sessão obrigatória + tradução de erros em HTTP. */
import { NextResponse } from "next/server";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { executarComUsuario } from "./contextoUsuario";
import type { SessaoUsuario } from "./permissions";
import { obterSessao } from "./session";

export async function comSessao(
  fn: (sessao: SessaoUsuario) => Promise<Response>,
): Promise<Response> {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  try {
    // O e-mail fica disponível para o log de alterações (lib/historico.ts).
    return await executarComUsuario(sessao.email, () => fn(sessao));
  } catch (e) {
    if (e instanceof ErroValidacao) {
      return NextResponse.json(
        { erro: e.message, alertas: e.alertas },
        { status: 422 },
      );
    }
    if (e instanceof ErroPermissao) {
      return NextResponse.json({ erro: e.message }, { status: 403 });
    }
    const mensagem = e instanceof Error ? e.message : "Erro interno.";
    console.error("[api]", e);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

export function ok(dados: unknown, status = 200): Response {
  return NextResponse.json(dados, { status });
}
