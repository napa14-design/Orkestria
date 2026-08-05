import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { aplicarModelo } from "@/services/modelosService";

/** POST { nome, sede_id, datas: string[] } → aplica o modelo nas datas. */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { nome, sede_id, datas } = await req.json();
    if (!nome || !sede_id || !Array.isArray(datas) || datas.length === 0)
      return ok({ erro: "Informe nome, sede_id e datas[]." }, 400);
    if (!podeAlterarSede(sessao, sede_id))
      throw new ErroPermissao("Supervisores só aplicam modelos das sedes que operam.");
    return ok(await aplicarModelo(nome, sede_id, datas, sessao.id));
  });
}
