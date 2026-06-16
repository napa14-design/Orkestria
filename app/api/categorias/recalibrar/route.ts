import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { recalibrarCategoria } from "@/services/categoriasService";
import { ErroPermissao } from "@/services/erros";

/** POST { categoria_id, fator } — aplica o fator ao tempo base de todas as tarefas da categoria. */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores recalibram categorias.");
    const { categoria_id, fator } = (await req.json()) as { categoria_id?: string; fator?: number };
    if (!categoria_id) throw new Error("Informe a categoria.");
    return ok(await recalibrarCategoria(categoria_id, Number(fator), sessao.email));
  });
}
