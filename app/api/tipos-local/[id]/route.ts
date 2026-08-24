import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { deleteTipoLocal, updateTipoLocal } from "@/services/tiposLocalService";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam o catálogo de tipos de local.");
    const { id } = await ctx.params;
    return ok(await updateTipoLocal(id, await req.json(), sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam o catálogo de tipos de local.");
    const { id } = await ctx.params;
    await deleteTipoLocal(id);
    return ok({ ok: true });
  });
}
