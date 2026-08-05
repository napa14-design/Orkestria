import { NextResponse } from "next/server";
import { montarSedesDaSessao } from "@/lib/permissions";
import { problemaNaSenha } from "@/lib/senha";
import { gravarSessao } from "@/lib/session";
import {
  codigoConfere,
  definirSenhaUsuario,
  getUsuarioPorEmail,
} from "@/services/usuariosService";

/**
 * Primeiro acesso: a pessoa cria a própria senha e entra.
 *
 * A prova de identidade é o **código de primeiro acesso** — individual, gerado
 * pelo administrador e válido por alguns dias. Sem essa prova qualquer um
 * digitaria o e-mail de outra pessoa e tomaria a conta, então ele é conferido
 * aqui de novo: esta rota não confia em ter passado pela tela de login.
 *
 * Só vale para quem **ainda não tem** senha própria. Quem já definiu não passa
 * por aqui — nem para trocar de senha, nem para recuperar. Nesse caso o
 * administrador gera um código novo e a pessoa volta a este fluxo.
 */
export async function POST(req: Request) {
  const { email, senha_atual, nova_senha } = (await req.json()) as {
    email?: string;
    senha_atual?: string;
    nova_senha?: string;
  };
  if (!email || !senha_atual || !nova_senha) {
    return NextResponse.json(
      { erro: "Informe o e-mail, o código de primeiro acesso e a nova senha." },
      { status: 400 },
    );
  }

  let usuario;
  try {
    usuario = await getUsuarioPorEmail(email);
  } catch (e) {
    console.error("Primeiro acesso: falha ao consultar o cadastro de usuários:", e);
    return NextResponse.json(
      {
        erro: "Não foi possível acessar o cadastro de usuários agora (falha de conexão com o banco). Tente de novo em instantes.",
      },
      { status: 503 },
    );
  }

  // Mensagem única para e-mail inexistente, código errado, código vencido e
  // conta que já tem senha: qualquer diferença entre elas contaria a estranhos
  // quais e-mails existem e quais contas estão abertas para primeiro acesso.
  if (!usuario || !codigoConfere(usuario, senha_atual)) {
    return NextResponse.json(
      {
        erro: "Não foi possível concluir o primeiro acesso. Confira o código recebido — se ele venceu, peça um novo ao administrador.",
      },
      { status: 401 },
    );
  }

  const problema = problemaNaSenha(nova_senha, senha_atual);
  if (problema) return NextResponse.json({ erro: problema }, { status: 400 });

  // `definirSenhaUsuario` apaga o código junto, então ele não serve duas vezes.
  await definirSenhaUsuario(usuario.id, nova_senha, senha_atual);
  await gravarSessao({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    sede_id: usuario.sede_id,
    sedes: montarSedesDaSessao(usuario.sede_id, usuario.sedes_extra),
  });
  return NextResponse.json({ nome: usuario.nome, perfil: usuario.perfil });
}
