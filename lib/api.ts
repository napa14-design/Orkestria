/** Helpers das rotas de API: sessão obrigatória + tradução de erros em HTTP. */
import { NextResponse } from "next/server";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { executarComUsuario } from "./contextoUsuario";
import { getDataSource } from "./datasource";
import { sessaoDoCadastro, type SessaoUsuario } from "./permissions";
import { gravarSessao, limparSessao, obterSessao, RECONFERIR_S, type MetaSessao } from "./session";

export async function comSessao(
  fn: (sessao: SessaoUsuario) => Promise<Response>,
): Promise<Response> {
  const lida = await obterSessao();
  if (!lida) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  let sessao: SessaoUsuario = lida;
  // Reconferência + renovação (ver lib/session.ts). A assinatura, o prazo e o
  // teto já foram conferidos em `verificarToken` — cookie forjado não chega a
  // custar leitura.
  const meta = lida as SessaoUsuario & Partial<MetaSessao>;
  // ⚠️ Sessão sem `iat` pularia a reconferência. Hoje só existe em teste que
  // simula `obterSessao` (o `verificarToken` recusa cookie real sem ele); em
  // produção, se um dia surgir outra fonte de sessão, isto fecha em vez de abrir.
  if (typeof meta.iat !== "number" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ erro: "Sua sessão terminou. Entre de novo." }, { status: 401 });
  }
  const agoraS = Math.floor(Date.now() / 1000);
  if (typeof meta.iat === "number" && agoraS - meta.iat >= RECONFERIR_S) {
    let usuario;
    try {
      usuario = await (await getDataSource()).obter("usuarios", lida.id);
    } catch (e) {
      // Falha FECHANDO, sem apagar o cookie: seguir com o token velho tiraria a
      // reconferência de todo mundo enquanto o banco estiver fora; 503 (e não
      // 401) porque o cliente manda para o login em qualquer 401.
      console.error("[sessao] não consegui reconferir o cadastro", e);
      return NextResponse.json(
        { erro: "Não foi possível conferir seu acesso agora (falha de conexão com o banco). Tente de novo em instantes." },
        { status: 503 },
      );
    }
    // Desativado, apagado, perfil desconhecido, e-mail trocado ou senha trocada
    // em outro aparelho (`versao_sessao`): a sessão acaba aqui.
    const nova =
      usuario && usuario.email === lida.email && (usuario.versao_sessao ?? 0) === meta.sv
        ? sessaoDoCadastro(usuario)
        : null;
    if (!nova) {
      await limparSessao();
      return NextResponse.json({ erro: "Sua sessão terminou. Entre de novo." }, { status: 401 });
    }
    // O teto (`auth_em`) passa adiante: renovar nunca reinicia o relógio do login.
    await gravarSessao(nova, { auth_em: meta.auth_em, sv: meta.sv });
    // Esta requisição já usa o cadastro de agora: perfil rebaixado dá 403 aqui.
    sessao = { ...nova, iat: agoraS, auth_em: meta.auth_em, sv: meta.sv } as SessaoUsuario;
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
