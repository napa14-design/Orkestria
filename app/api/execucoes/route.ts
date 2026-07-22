import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { getExecucoes, registrarExecucao } from "@/services/execucoesService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sede = limitarSedeConsulta(
      sessao,
      url.searchParams.get("sede") ?? undefined,
    );
    return ok(
      await getExecucoes(
        url.searchParams.get("de") ?? undefined,
        url.searchParams.get("ate") ?? undefined,
        sede,
      ),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    return ok(await registrarExecucao({ ...dados, supervisor_id: sessao.id }), 201);
  });
}
