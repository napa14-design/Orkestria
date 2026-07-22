import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  deleteServicoEventual,
  updateServicoEventual,
} from "@/services/servicosEventuaisService";

type Ctx = { params: Promise<{ id: string }> };

async function exigirAcesso(check: (sedeId: string) => boolean, id: string) {
  const ds = await getDataSource();
  const atual = await ds.obter("servicos_eventuais", id);
  if (!atual) throw new Error("Registro não encontrado.");
  if (!check(atual.sede_id))
    throw new ErroPermissao("Supervisores só alteram eventuais da própria sede.");
}

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    const mudancas = await req.json();
    if (mudancas.sede_id && !podeAlterarSede(sessao, mudancas.sede_id))
      throw new ErroPermissao("Supervisores não podem mover registros para outra sede.");
    return ok(await updateServicoEventual(id, mudancas, sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    await deleteServicoEventual(id);
    return ok({ ok: true });
  });
}
