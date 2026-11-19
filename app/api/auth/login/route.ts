import { NextResponse } from "next/server";
import { sessaoDoCadastro } from "@/lib/permissions";
import { gravarSessao } from "@/lib/session";
import { liberarTentativas, reservarTentativa, respostaDeEspera } from "@/services/limiteLoginService";
import { credencialConfere, getUsuarioPorEmail } from "@/services/usuariosService";

/**
 * Login: e-mail cadastrado + senha. Cada usuário pode ter senha individual
 * (hash scrypt em `senha_hash`); quem ainda não definiu entra com o **código de
 * primeiro acesso** que o administrador gerou para ela — individual, de uso
 * único e com prazo. Definida a senha, só ela vale e o código é apagado.
 *
 * Limite de tentativas por e-mail (`lib/limiteLogin.ts`): a vaga é reservada ANTES de ler
 * o cadastro e de conferir; travado, responde 429 sem conferir nada.
 */
export async function POST(req: Request) {
  const { email, senha } = (await req.json()) as { email?: unknown; senha?: unknown };
  if (typeof email !== "string" || typeof senha !== "string" || !email.trim() || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  let usuario;
  try {
    const reserva = await reservarTentativa(email);
    if (!reserva.liberado) return respostaDeEspera(reserva.ate);
    usuario = await getUsuarioPorEmail(email);
  } catch (e) {
    // Sem o e-mail no log (pode vir no erro do banco).
    console.error("Login: falha ao consultar o cadastro de usuários:", e instanceof Error ? e.name : "");
    return NextResponse.json(
      {
        erro: "Não foi possível acessar o cadastro de usuários agora (falha de conexão com o banco). Tente de novo em instantes; se continuar, avise o administrador.",
      },
      { status: 503 },
    );
  }

  // Quem já tem senha entra por ela; quem não tem usa o código de primeiro
  // acesso, que é individual e vale uma vez só. Um scrypt em todo caso, exista a conta ou não.
  const credencialCorreta = credencialConfere(usuario, senha);
  if (!usuario || !credencialCorreta) {
    return NextResponse.json(
      {
        erro: "E-mail, senha ou código incorretos. Se este é o seu primeiro acesso, use o código que você recebeu.",
      },
      { status: 401 },
    );
  }

  await liberarTentativas(email);
  // Primeiro acesso: o código conferiu, mas nenhuma sessão é criada aqui — a
  // pessoa precisa definir a senha dela primeiro, e é
  // `/api/auth/primeiro-acesso` que valida tudo de novo.
  if (!usuario.senha_hash) {
    return NextResponse.json({ primeiro_acesso: true, nome: usuario.nome });
  }
  const sessao = sessaoDoCadastro(usuario);
  if (!sessao) {
    return NextResponse.json({ erro: "Seu perfil de acesso está inválido. Avise o administrador." }, { status: 403 });
  }

  await gravarSessao(sessao, { sv: usuario.versao_sessao ?? 0 });
  return NextResponse.json({
    nome: usuario.nome,
    perfil: usuario.perfil,
    sede_id: usuario.sede_id,
  });
}
