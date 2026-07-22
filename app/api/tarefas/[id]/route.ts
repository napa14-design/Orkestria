import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { deleteTarefa, updateTarefa } from "@/services/tarefasService";

type Ctx = { params: Promise<{ id: string }> };

async function exigirAcesso(check: (sedeId: string) => boolean, id: string) {
  const ds = await getDataSource();
  const atual = await ds.obter("tarefas", id);
  if (!atual) throw new Error("Tarefa não encontrada.");
  if (!check(atual.sede_id))
    throw new ErroPermissao("Supervisores só alteram tarefas da própria sede.");
}

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    const mudancas = await req.json();
    if (mudancas.local_id) {
      const ds = await getDataSource();
      const destino = await ds.obter("locais", mudancas.local_id);
      if (destino && !podeAlterarSede(sessao, destino.sede_id))
        throw new ErroPermissao("Supervisores não podem mover tarefas para outra sede.");
    }
    return ok(await updateTarefa(id, mudancas, sessao.email));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    await deleteTarefa(id);
    return ok({ ok: true });
  });
}
