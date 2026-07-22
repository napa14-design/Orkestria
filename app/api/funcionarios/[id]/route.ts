import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { deleteFuncionario, updateFuncionario } from "@/services/funcionariosService";

type Ctx = { params: Promise<{ id: string }> };

async function exigirAcesso(sessaoSedeCheck: (sedeId: string) => boolean, id: string) {
  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  if (!sessaoSedeCheck(atual.sede_id))
    throw new ErroPermissao("Supervisores só alteram funcionários da própria sede.");
}

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    const mudancas = await req.json();
    if (mudancas.sede_id && !podeAlterarSede(sessao, mudancas.sede_id))
      throw new ErroPermissao("Supervisores não podem mover funcionários para outra sede.");
    return ok(await updateFuncionario(id, mudancas, sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    await deleteFuncionario(id);
    return ok({ ok: true });
  });
}
