import { NextResponse } from "next/server";
import { montarSedesDaSessao } from "@/lib/permissions";
import { verificarSenha } from "@/lib/senha";
import { gravarSessao } from "@/lib/session";
import { getUsuarioPorEmail } from "@/services/usuariosService";

/**
 * Login: e-mail cadastrado + senha. Cada usuário pode ter senha individual
 * (hash scrypt em `senha_hash`); quem ainda não definiu usa a senha única
 * (ACCESS_PASSWORD) como bootstrap. Definida a senha individual, só ela vale.
 */
export async function POST(req: Request) {
  const { email, senha } = (await req.json()) as { email?: string; senha?: string };
  if (!email || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  let usuario;
  try {
    usuario = await getUsuarioPorEmail(email);
  } catch (e) {
    console.error("Login: falha ao consultar o cadastro de usuários:", e);
    return NextResponse.json(
      {
        erro: "Não foi possível acessar o cadastro de usuários agora (falha de conexão com o banco). Tente de novo em instantes; se continuar, avise o administrador.",
      },
      { status: 503 },
    );
  }

  const senhaCorreta = usuario
    ? usuario.senha_hash
      ? verificarSenha(senha, usuario.senha_hash)
      : senha === (process.env.ACCESS_PASSWORD ?? "mudar123")
    : false;
  if (!usuario || !senhaCorreta) {
    return NextResponse.json(
      { erro: "E-mail não cadastrado ou senha incorreta." },
      { status: 401 },
    );
  }

  await gravarSessao({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    sede_id: usuario.sede_id,
    sedes: montarSedesDaSessao(usuario.sede_id, usuario.sedes_extra),
  });
  return NextResponse.json({
    nome: usuario.nome,
    perfil: usuario.perfil,
    sede_id: usuario.sede_id,
  });
}
