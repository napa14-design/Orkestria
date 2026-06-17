import { comSessao, ok } from "@/lib/api";
import { podeGerenciarCatalogo } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  createPeriodoLetivo,
  getPeriodosLetivos,
} from "@/services/periodosLetivosService";

/** GET /api/periodos-letivos [?sede=] */
export async function GET(req: Request) {
  return comSessao(async () => {
    const url = new URL(req.url);
    return ok(
      await getPeriodosLetivos({
        sedeId: url.searchParams.get("sede") ?? undefined,
      }),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    // Calendário acadêmico é cadastro global por sede: só administrador.
    if (!podeGerenciarCatalogo(sessao)) throw new ErroPermissao();
    return ok(await createPeriodoLetivo(await req.json(), sessao.email), 201);
  });
}
