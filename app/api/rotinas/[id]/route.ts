import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { deleteRotina, updateRotina } from "@/services/rotinasService";

type Ctx = { params: Promise<{ id: string }> };

async function exigirAcesso(check: (sedeId: string) => boolean, id: string) {
  const ds = await getDataSource();
  const atual = await ds.obter("rotinas_planejadas", id);
  if (!atual) throw new Error("Rotina não encontrada.");
  if (!check(atual.sede_id))
    throw new ErroPermissao("Supervisores só alteram rotinas das sedes que operam.");
}

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    const mudancas = await req.json();
    if (mudancas.funcionario_id) {
      const ds = await getDataSource();
      const destino = await ds.obter("funcionarios", mudancas.funcionario_id);
      if (destino && !podeAlterarSede(sessao, destino.sede_id))
        throw new ErroPermissao("Remanejo entre sedes é restrito ao administrador.");
    }
    return ok(await updateRotina(id, mudancas));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    await deleteRotina(id);
    return ok({ ok: true });
  });
}
