import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { duplicarDia } from "@/services/rotinasService";

/**
 * POST { data_origem, datas_destino: string[], sede_id } → copia o dia
 * inteiro para uma ou mais datas (conflitos no destino são pulados).
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { data_origem, datas_destino, sede_id } = await req.json();
    if (!data_origem || !Array.isArray(datas_destino) || datas_destino.length === 0 || !sede_id)
      return ok({ erro: "Informe data_origem, datas_destino[] e sede_id." }, 400);
    if (!podeAlterarSede(sessao, sede_id))
      throw new ErroPermissao("Supervisores só duplicam rotinas das sedes que operam.");
    return ok(await duplicarDia(data_origem, datas_destino, sede_id, sessao.id));
  });
}
