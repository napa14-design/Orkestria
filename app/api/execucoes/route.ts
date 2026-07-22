import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
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
    const ds = await getDataSource();
    const rotina = dados.rotina_id
      ? await ds.obter("rotinas_planejadas", dados.rotina_id)
      : null;
    if (rotina && !podeAlterarSede(sessao, rotina.sede_id))
      throw new ErroPermissao("Supervisores só registram execuções da própria sede.");
    return ok(await registrarExecucao({ ...dados, supervisor_id: sessao.id }), 201);
  });
}
