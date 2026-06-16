import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { createCategoria, getCategorias } from "@/services/categoriasService";
import { ErroPermissao } from "@/services/erros";

export async function GET() {
  return comSessao(async () => ok(await getCategorias()));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam o catálogo de categorias.");
    return ok(await createCategoria(await req.json(), sessao.email), 201);
  });
}
