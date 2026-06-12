import { comSessao, ok } from "@/lib/api";
import { ErroPermissao } from "@/services/erros";
import {
  createParametro,
  getParametros,
  resolverParametros,
} from "@/services/parametrosService";

export async function GET(req: Request) {
  return comSessao(async () => {
    const url = new URL(req.url);
    // ?resolvidos=1&sede=X → parâmetros já mesclados (global + sede)
    if (url.searchParams.get("resolvidos")) {
      const sede = url.searchParams.get("sede") ?? undefined;
      return ok(await resolverParametros(sede));
    }
    return ok(await getParametros());
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (sessao.perfil === "visualizador") throw new ErroPermissao();
    return ok(await createParametro(await req.json(), sessao.email), 201);
  });
}
