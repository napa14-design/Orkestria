import { NextResponse } from "next/server";
import { obterAppAdmin } from "@/lib/firebaseAdmin";
import { montarSedesDaSessao } from "@/lib/permissions";
import { gravarSessao } from "@/lib/session";
import { getUsuarioPorEmail } from "@/services/usuariosService";

/**
 * Login com Google: o cliente faz o sign-in no popup e envia o ID token.
 * Aqui o token é verificado pelo Admin SDK; o e-mail precisa estar cadastrado
 * (e ativo) na tabela de usuários — só então a sessão é criada. Assim o Google
 * apenas comprova a identidade; quem define perfil/sede continua sendo o cadastro.
 *
 * `firebase-admin/auth` entra por import dinâmico **com catch próprio**, e não
 * por import estático no topo. Não é preferência de estilo: em produção o módulo
 * não carrega na função serverless da Vercel, e a forma do import decide o que
 * a gente consegue ver. Estático = o módulo quebra antes do handler existir e a
 * rota devolve 500 de corpo vazio, sem dizer nada. Dinâmico aqui dentro = o erro
 * cai neste catch, vira 503 (defeito do servidor, não credencial errada) e o
 * **código** dele chega à tela, que é o que permite consertar a causa.
 */
export async function POST(req: Request) {
  const { idToken } = (await req.json()) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ erro: "Token ausente." }, { status: 400 });
  }

  // Erro do servidor (módulo que não carrega, credencial ausente) ≠ erro de quem
  // entra. O `import type` é só tipo: não carrega nada em runtime.
  let auth: import("firebase-admin/auth").Auth;
  try {
    const { getAuth } = await import("firebase-admin/auth");
    auth = getAuth(obterAppAdmin());
  } catch (e) {
    console.error("Login Google: verificação indisponível no servidor:", e);
    return NextResponse.json(
      {
        erro: `A verificação do login com Google está indisponível no servidor: ${detalheDoErro(e)}. Entre com e-mail e senha e avise o administrador.`,
      },
      { status: 503 },
    );
  }

  let email: string | undefined;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    email = decoded.email?.toLowerCase();
  } catch (e) {
    console.error("Login Google: token recusado na verificação:", e);
    return NextResponse.json(
      { erro: `Não foi possível validar o login do Google (${codigoDoErro(e)}).` },
      { status: 401 },
    );
  }
  if (!email) {
    return NextResponse.json({ erro: "A conta Google não tem e-mail." }, { status: 401 });
  }

  const usuario = await getUsuarioPorEmail(email);
  if (!usuario) {
    return NextResponse.json(
      { erro: `O e-mail ${email} não está cadastrado como usuário do sistema.` },
      { status: 403 },
    );
  }

  await gravarSessao({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    sede_id: usuario.sede_id,
    // Mesmo escopo do login por senha: quem opera mais de uma sede precisa da
    // lista aqui também, senão entrar pelo Google reduziria o acesso à principal.
    sedes: montarSedesDaSessao(usuario.sede_id, usuario.sedes_extra),
  });
  return NextResponse.json({ nome: usuario.nome, perfil: usuario.perfil, sede_id: usuario.sede_id });
}

/**
 * Código curto do erro, para a pessoa conseguir repassar ao administrador o que
 * apareceu na tela. São códigos do próprio Firebase (`auth/id-token-expired`,
 * `auth/argument-error`) ou o nome do erro de runtime — nada de dado nosso.
 */
function codigoDoErro(e: unknown): string {
  const codigo = (e as { code?: unknown } | null)?.code;
  if (typeof codigo === "string" && codigo) return codigo;
  return e instanceof Error ? e.name : "desconhecido";
}

/**
 * Código **e** um trecho da mensagem — só no 503, que é falha nossa de servidor.
 * `ERR_REQUIRE_ESM` e `MODULE_NOT_FOUND` sozinhos não dizem qual módulo caiu, e
 * é justamente o nome do módulo que aponta o conserto. Corta em 140 caracteres
 * porque isto vai para a tela; o erro inteiro fica no log da função.
 */
function detalheDoErro(e: unknown): string {
  const mensagem = e instanceof Error ? e.message.replace(/\s+/gu, " ").slice(0, 140) : "";
  return mensagem ? `${codigoDoErro(e)} — ${mensagem}` : codigoDoErro(e);
}
