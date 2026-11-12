import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeRegistrarRealizado } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { confirmarDiaComoPlanejado } from "@/services/execucoesService";

/**
 * POST /api/execucoes/confirmar-dia { sede, data, declarar_epi?, rotinas? }
 *
 * `rotinas`: só estas (as que a pessoa marcou). Sem ele, o dia inteiro.
 *
 * Fecha o dia por exceção: confirma como planejado tudo o que já passou do horário
 * e ainda não tem registro. Não sobrescreve nada já decidido — os desvios se
 * registram antes, um a um, e isto fecha o resto.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeRegistrarRealizado(sessao)) throw new ErroPermissao();
    const { sede, data, declarar_epi, rotinas } = (await req.json()) as {
      sede?: string;
      data?: string;
      declarar_epi?: boolean;
      rotinas?: unknown;
    };
    if (!sede || !data) return ok({ erro: "Informe sede e data." }, 400);
    // Lista vazia confirmaria nada; lista que não é de textos, ou enorme, é recusada
    // em vez de virar "o dia inteiro" por engano.
    const somente =
      rotinas === undefined
        ? undefined
        : Array.isArray(rotinas) && rotinas.length > 0 && rotinas.length <= 1000 && rotinas.every((r) => typeof r === "string")
          ? (rotinas as string[])
          : null;
    if (somente === null) return ok({ erro: "Lista de tarefas inválida." }, 400);
    if (!podeAlterarSede(sessao, sede))
      throw new ErroPermissao("Só se fecha o dia das sedes que você opera.");

    return ok(
      await confirmarDiaComoPlanejado(
        { sedeId: sede, data, declararEpi: !!declarar_epi, ...(somente ? { somente } : {}) },
        sessao.id,
        sessao.perfil,
      ),
    );
  });
}
