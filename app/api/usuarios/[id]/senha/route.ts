import { comSessao, ok } from "@/lib/api";
import { podeGerenciarUsuarios } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { definirSenhaUsuario } from "@/services/usuariosService";

type Ctx = { params: Promise<{ id: string }> };

/** Admin define a senha individual de um usuário. */
export async function POST(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao("Apenas administradores definem a senha de outros usuários.");
    const { id } = await ctx.params;
    const { senha } = (await req.json()) as { senha?: string };
    await definirSenhaUsuario(id, senha ?? "");
    return ok({ ok: true });
  });
}
