import { getAuth } from "firebase-admin/auth";
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
 * O import de `firebase-admin/auth` é estático e mora **nesta rota**: só ela
 * carrega jwks-rsa/jose, e o resto do sistema (Firestore, login por senha) segue
 * sem essa cadeia. Era um `await import()` dentro do try — o que somava dois
 * problemas: import dinâmico é o que o rastreio de arquivos da Vercel tem mais
 * chance de não levar para a função, e uma falha em carregar o módulo saía como
 * "token inválido", culpando a pessoa por um defeito do servidor.
 */
export async function POST(req: Request) {
  const { idToken } = (await req.json()) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ erro: "Token ausente." }, { status: 400 });
  }

  // Erro do servidor (credencial ausente, módulo quebrado) ≠ erro de quem entra.
  let auth: ReturnType<typeof getAuth>;
  try {
    auth = getAuth(obterAppAdmin());
  } catch (e) {
    console.error("Login Google: verificação indisponível no servidor:", e);
    return NextResponse.json(
      {
        erro: `A verificação do login com Google está indisponível no servidor (${codigoDoErro(e)}). Entre com e-mail e senha e avise o administrador.`,
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
