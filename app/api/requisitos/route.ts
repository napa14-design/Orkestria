import { comSessao, ok } from "@/lib/api";
import { podeCriarNoCatalogo } from "@/lib/permissions";
import { createRequisito, getRequisitos } from "@/services/requisitosService";
import { ErroPermissao } from "@/services/erros";

export async function GET() {
  return comSessao(async () => ok(await getRequisitos()));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeCriarNoCatalogo(sessao))
      throw new ErroPermissao("Somente quem opera o sistema cria itens de catálogo.");
    return ok(await createRequisito(await req.json(), sessao.email), 201);
  });
}
