import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createAusencia, getAusencias } from "@/services/ausenciasService";

/** GET /api/ausencias?data=YYYY-MM-DD | ?de=&ate= [&sede=] */
export async function GET(req: Request) {
  return comSessao(async () => {
    const url = new URL(req.url);
    return ok(
      await getAusencias({
        data: url.searchParams.get("data") ?? undefined,
        de: url.searchParams.get("de") ?? undefined,
        ate: url.searchParams.get("ate") ?? undefined,
        sedeId: url.searchParams.get("sede") ?? undefined,
      }),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    // A sede vem do funcionário; valida permissão contra ela.
    const ds = await getDataSource();
    const funcionario = dados.funcionario_id
      ? await ds.obter("funcionarios", dados.funcionario_id)
      : null;
    if (funcionario && !podeAlterarSede(sessao, funcionario.sede_id))
      throw new ErroPermissao("Supervisores só registram ausências da própria sede.");
    return ok(await createAusencia(dados, sessao.email), 201);
  });
}
