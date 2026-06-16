import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  createServicoEventual,
  getServicosEventuais,
} from "@/services/servicosEventuaisService";

export async function GET(req: Request) {
  return comSessao(async () => {
    const url = new URL(req.url);
    return ok(
      await getServicosEventuais(
        url.searchParams.get("de") ?? undefined,
        url.searchParams.get("ate") ?? undefined,
        url.searchParams.get("sede") ?? undefined,
      ),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    if (!podeAlterarSede(sessao, dados.sede_id))
      throw new ErroPermissao("Supervisores só registram eventuais da própria sede.");
    return ok(await createServicoEventual({ ...dados, supervisor_id: sessao.id }, sessao.email), 201);
  });
}
