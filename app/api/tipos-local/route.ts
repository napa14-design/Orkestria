import { comSessao, ok } from "@/lib/api";
import { podeCriarNoCatalogo } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createTipoLocal, getTiposLocal } from "@/services/tiposLocalService";

/** Leitura para qualquer sessão: todo cadastro de local precisa da lista. */
export async function GET() {
  return comSessao(async () => ok(await getTiposLocal()));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeCriarNoCatalogo(sessao))
      throw new ErroPermissao("Somente quem opera o sistema cria itens de catálogo.");
    return ok(await createTipoLocal(await req.json(), sessao.email), 201);
  });
}
