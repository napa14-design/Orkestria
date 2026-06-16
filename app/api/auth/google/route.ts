import { NextResponse } from "next/server";
import { authAdmin } from "@/lib/firebaseAdmin";
import { gravarSessao } from "@/lib/session";
import { getUsuarioPorEmail } from "@/services/usuariosService";

/**
 * Login com Google: o cliente faz o sign-in no popup e envia o ID token.
 * Aqui o token é verificado pelo Admin SDK; o e-mail precisa estar cadastrado
 * (e ativo) na tabela de usuários — só então a sessão é criada. Assim o Google
 * apenas comprova a identidade; quem define perfil/sede continua sendo o cadastro.
 */
export async function POST(req: Request) {
  const { idToken } = (await req.json()) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ erro: "Token ausente." }, { status: 400 });
  }

  let email: string | undefined;
  try {
    const decoded = await authAdmin().verifyIdToken(idToken);
    email = decoded.email?.toLowerCase();
  } catch {
    return NextResponse.json({ erro: "Não foi possível validar o login do Google." }, { status: 401 });
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
  });
  return NextResponse.json({ nome: usuario.nome, perfil: usuario.perfil, sede_id: usuario.sede_id });
}
