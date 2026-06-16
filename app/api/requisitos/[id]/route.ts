import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { deleteRequisito, updateRequisito } from "@/services/requisitosService";
import { ErroPermissao } from "@/services/erros";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam o catálogo de requisitos.");
    const { id } = await ctx.params;
    return ok(await updateRequisito(id, await req.json(), sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam o catálogo de requisitos.");
    const { id } = await ctx.params;
    await deleteRequisito(id);
    return ok({ ok: true });
  });
}
