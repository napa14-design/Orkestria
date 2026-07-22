import { comSessao, ok } from "@/lib/api";
import { podeGerenciarUsuarios } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { deleteUsuario, updateUsuario } from "@/services/usuariosService";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam usuários.");
    const { id } = await ctx.params;
    const mudancas = await req.json();
    if (id === sessao.id && mudancas.ativo === false)
      return ok({ erro: "Você não pode inativar o próprio usuário." }, 400);
    return ok(await updateUsuario(id, mudancas));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam usuários.");
    const { id } = await ctx.params;
    if (id === sessao.id)
      return ok({ erro: "Você não pode excluir o próprio usuário." }, 400);
    await deleteUsuario(id);
    return ok({ ok: true });
  });
}
