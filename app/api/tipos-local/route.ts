import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createTipoLocal, getTiposLocal } from "@/services/tiposLocalService";

/** Leitura para qualquer sessão: todo cadastro de local precisa da lista. */
export async function GET() {
  return comSessao(async () => ok(await getTiposLocal()));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam o catálogo de tipos de local.");
    return ok(await createTipoLocal(await req.json(), sessao.email), 201);
  });
}
