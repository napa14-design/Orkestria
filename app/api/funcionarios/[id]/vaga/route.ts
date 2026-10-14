import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { abrirVagaNoSgcp } from "@/services/funcionariosService";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/funcionarios/[id]/vaga — tenta de novo abrir no SGCP a vaga de quem
 * foi desligado (o SGCP estava fora do ar, ou a sede ainda não existia lá).
 */
export async function POST(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    const atual = await (await getDataSource()).obter("funcionarios", id);
    if (!atual) throw new Error("Funcionário não encontrado.");
    if (!podeAlterarSede(sessao, atual.sede_id))
      throw new ErroPermissao("Supervisores só mexem em funcionários das sedes que operam.");
    return ok(await abrirVagaNoSgcp(id, { nome: sessao.nome, email: sessao.email }));
  });
}
