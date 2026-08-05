import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createLocal, getLocais } from "@/services/locaisService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const solicitada = new URL(req.url).searchParams.get("sede") ?? undefined;
    const sedeId = limitarSedeConsulta(sessao, solicitada);
    return ok(await getLocais(sedeId));
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    if (!podeAlterarSede(sessao, dados.sede_id))
      throw new ErroPermissao("Supervisores só cadastram locais das sedes que operam.");
    return ok(await createLocal(dados, sessao.email), 201);
  });
}
