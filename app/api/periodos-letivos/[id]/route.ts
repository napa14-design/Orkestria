import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  deletePeriodoLetivo,
  updatePeriodoLetivo,
} from "@/services/periodosLetivosService";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    return ok(await updatePeriodoLetivo(id, await req.json(), sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await deletePeriodoLetivo(id);
    return ok({ ok: true });
  });
}
