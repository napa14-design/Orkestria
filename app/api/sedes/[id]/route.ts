import { comSessao, ok } from "@/lib/api";
import { ErroPermissao } from "@/services/erros";
import { deleteSede, updateSede } from "@/services/sedesService";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (sessao.perfil !== "administrador")
      throw new ErroPermissao("Apenas administradores editam sedes.");
    const { id } = await ctx.params;
    return ok(await updateSede(id, await req.json(), sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (sessao.perfil !== "administrador")
      throw new ErroPermissao("Apenas administradores excluem sedes.");
    const { id } = await ctx.params;
    await deleteSede(id);
    return ok({ ok: true });
  });
}
