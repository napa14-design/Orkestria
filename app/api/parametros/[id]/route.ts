import { comSessao, ok } from "@/lib/api";
import { podeEditarParametro } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { getParametroPorId, updateParametro } from "@/services/parametrosService";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    const { id } = await ctx.params;
    const atual = await getParametroPorId(id);
    if (!atual) throw new Error("Parâmetro não encontrado.");
    if (!podeEditarParametro(sessao, atual.editavel_por_supervisor, atual.sede_id))
      throw new ErroPermissao("Este parâmetro não é editável pelo seu perfil.");
    return ok(await updateParametro(id, await req.json(), sessao.email));
  });
}
