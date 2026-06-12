import { NextResponse } from "next/server";
import { gravarSessao } from "@/lib/session";
import { getUsuarioPorEmail } from "@/services/usuariosService";

/**
 * Login do MVP: senha única (ACCESS_PASSWORD) + e-mail cadastrado na tabela
 * de usuários, que define perfil e sede da sessão.
 */
export async function POST(req: Request) {
  const { email, senha } = (await req.json()) as { email?: string; senha?: string };
  if (!email || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  const senhaCorreta = senha === (process.env.ACCESS_PASSWORD ?? "mudar123");
  const usuario = senhaCorreta ? await getUsuarioPorEmail(email) : null;
  if (!usuario) {
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
  });
  return NextResponse.json({
    nome: usuario.nome,
    perfil: usuario.perfil,
    sede_id: usuario.sede_id,
  });
}
