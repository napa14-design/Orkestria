import { comSessao, ok } from "@/lib/api";
import { podeEditarItemDoCatalogo } from "@/lib/permissions";
import {
  getRequisitoPorId, deleteRequisito, updateRequisito } from "@/services/requisitosService";
import { ErroPermissao } from "@/services/erros";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    const { id } = await ctx.params;
    // Item compartilhado por 18 sedes: administrador sempre; supervisor só o
    // que ele mesmo criou (para poder consertar o próprio erro de digitação).
    if (!podeEditarItemDoCatalogo(sessao, await getRequisitoPorId(id)))
      throw new ErroPermissao(
        "Este item do catálogo é compartilhado por todas as sedes — só um administrador altera. Você pode editar os que você mesmo criou.",
      );
    return ok(await updateRequisito(id, await req.json(), sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    const { id } = await ctx.params;
    // Item compartilhado por 18 sedes: administrador sempre; supervisor só o
    // que ele mesmo criou (para poder consertar o próprio erro de digitação).
    if (!podeEditarItemDoCatalogo(sessao, await getRequisitoPorId(id)))
      throw new ErroPermissao(
        "Este item do catálogo é compartilhado por todas as sedes — só um administrador altera. Você pode editar os que você mesmo criou.",
      );
    await deleteRequisito(id);
    return ok({ ok: true });
  });
}
