import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { confirmarDiaComoPlanejado } from "@/services/execucoesService";

/**
 * POST /api/execucoes/confirmar-dia { sede, data, declarar_epi? }
 *
 * Fecha o dia por exceção: confirma como planejado tudo o que já passou do horário
 * e ainda não tem registro. Não sobrescreve nada já decidido — os desvios se
 * registram antes, um a um, e isto fecha o resto.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { sede, data, declarar_epi } = (await req.json()) as {
      sede?: string;
      data?: string;
      declarar_epi?: boolean;
    };
    if (!sede || !data) return ok({ erro: "Informe sede e data." }, 400);
    if (!podeAlterarSede(sessao, sede))
      throw new ErroPermissao("Supervisores só fecham o dia das sedes que operam.");

    return ok(
      await confirmarDiaComoPlanejado(
        { sedeId: sede, data, declararEpi: !!declarar_epi },
        sessao.id,
      ),
    );
  });
}
