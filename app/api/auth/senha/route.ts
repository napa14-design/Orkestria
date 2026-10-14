import { comSessao, ok } from "@/lib/api";
import { trocarPropriaSenha } from "@/services/usuariosService";

/**
 * Usuário define/troca a própria senha (usa o id da sessão). Quem já tem senha
 * manda a atual junto — ver `trocarPropriaSenha`.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { senha, senhaAtual } = (await req.json()) as { senha?: string; senhaAtual?: string };
    await trocarPropriaSenha(sessao.id, senhaAtual ?? "", senha ?? "");
    return ok({ ok: true });
  });
}
