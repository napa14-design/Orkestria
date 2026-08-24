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
    if (!podeEditarParametro(sessao, atual))
      throw new ErroPermissao("Este parâmetro não é editável pelo seu perfil.");
    const mudancas = await req.json();
    if (
      sessao.perfil === "supervisor" &&
      ((mudancas.sede_id !== undefined && mudancas.sede_id !== atual.sede_id) ||
        (mudancas.chave !== undefined && mudancas.chave !== atual.chave) ||
        (mudancas.tipo !== undefined && mudancas.tipo !== atual.tipo) ||
        (mudancas.editavel_por_supervisor !== undefined &&
          mudancas.editavel_por_supervisor !== atual.editavel_por_supervisor))
    )
      throw new ErroPermissao(
        "Supervisores alteram o valor do parâmetro, não seu escopo ou regra de permissão.",
      );
    return ok(await updateParametro(id, mudancas, sessao.email));
  });
}
