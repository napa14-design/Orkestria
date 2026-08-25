import { comSessao, ok } from "@/lib/api";
import { podeCriarNoCatalogo } from "@/lib/permissions";
import { createCategoria, getCategorias } from "@/services/categoriasService";
import { ErroPermissao } from "@/services/erros";

export async function GET() {
  return comSessao(async () => ok(await getCategorias()));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeCriarNoCatalogo(sessao))
      throw new ErroPermissao("Somente quem opera o sistema cria itens de catálogo.");
    return ok(await createCategoria(await req.json(), sessao.email), 201);
  });
}
