import { NextResponse } from "next/server";
import { montarSedesDaSessao } from "@/lib/permissions";
import { verificarSenha } from "@/lib/senha";
import { gravarSessao } from "@/lib/session";
import { codigoConfere, getUsuarioPorEmail } from "@/services/usuariosService";

/**
 * Login: e-mail cadastrado + senha. Cada usuário pode ter senha individual
 * (hash scrypt em `senha_hash`); quem ainda não definiu entra com o **código de
 * primeiro acesso** que o administrador gerou para ela — individual, de uso
 * único e com prazo. Definida a senha, só ela vale e o código é apagado.
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

  // Quem já tem senha entra por ela; quem não tem usa o código de primeiro
  // acesso, que é individual e vale uma vez só.
  const credencialCorreta = usuario
    ? usuario.senha_hash
      ? verificarSenha(senha, usuario.senha_hash)
      : codigoConfere(usuario, senha)
    : false;
  if (!usuario || !credencialCorreta) {
    return NextResponse.json(
      {
        erro: "E-mail, senha ou código incorretos. Se este é o seu primeiro acesso, use o código que o administrador enviou.",
      },
      { status: 401 },
    );
  }

  // Primeiro acesso: o código conferiu, mas nenhuma sessão é criada aqui — a
  // pessoa precisa definir a senha dela primeiro, e é
  // `/api/auth/primeiro-acesso` que valida tudo de novo.
  if (!usuario.senha_hash) {
    return NextResponse.json({ primeiro_acesso: true, nome: usuario.nome });
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
