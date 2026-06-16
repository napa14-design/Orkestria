import { comSessao, ok } from "@/lib/api";
import { definirSenhaUsuario } from "@/services/usuariosService";

/** Usuário define/troca a própria senha (usa o id da sessão). */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { senha } = (await req.json()) as { senha?: string };
    await definirSenhaUsuario(sessao.id, senha ?? "");
    return ok({ ok: true });
  });
}
