import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { deleteLocal, updateLocal } from "@/services/locaisService";

type Ctx = { params: Promise<{ id: string }> };

async function exigirAcesso(check: (sedeId: string) => boolean, id: string) {
  const ds = await getDataSource();
  const atual = await ds.obter("locais", id);
  if (!atual) throw new Error("Local não encontrado.");
  if (!check(atual.sede_id))
    throw new ErroPermissao("Supervisores só alteram locais das sedes que operam.");
}

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    const mudancas = await req.json();
    if (mudancas.sede_id && !podeAlterarSede(sessao, mudancas.sede_id))
      throw new ErroPermissao("Supervisores não podem mover locais para outra sede.");
    return ok(await updateLocal(id, mudancas, sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    await deleteLocal(id);
    return ok({ ok: true });
  });
}
