import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta, podeGerenciarCatalogo } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createFeriado, getFeriados } from "@/services/feriadosService";

/** GET /api/feriados [?sede=] — inclui sempre os globais (sede vazia). */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sedeId = limitarSedeConsulta(sessao, url.searchParams.get("sede") ?? undefined);
    return ok(await getFeriados({ sedeId }));
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    // Feriado fecha o dia de todas as sedes: cadastro global, só administrador.
    if (!podeGerenciarCatalogo(sessao)) throw new ErroPermissao();
    return ok(await createFeriado(await req.json(), sessao.email), 201);
  });
}
