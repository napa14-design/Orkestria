import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { createRequisito, getRequisitos } from "@/services/requisitosService";
import { ErroPermissao } from "@/services/erros";

export async function GET() {
  return comSessao(async () => ok(await getRequisitos()));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarCatalogo(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam o catálogo de requisitos.");
    return ok(await createRequisito(await req.json(), sessao.email), 201);
  });
}
