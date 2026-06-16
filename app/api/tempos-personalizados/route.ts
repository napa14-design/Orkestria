import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  createTempoPersonalizado,
  getTemposPersonalizados,
} from "@/services/temposPersonalizadosService";

export async function GET(req: Request) {
  return comSessao(async () => {
    const sede = new URL(req.url).searchParams.get("sede") ?? undefined;
    return ok(await getTemposPersonalizados(sede));
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    // a sede vem do funcionário — confere permissão sobre ela
    const ds = await getDataSource();
    const func = await ds.obter("funcionarios", dados.funcionario_id);
    if (func && !podeAlterarSede(sessao, func.sede_id))
      throw new ErroPermissao("Supervisores só definem tempos da própria sede.");
    return ok(await createTempoPersonalizado(dados, sessao.email), 201);
  });
}
