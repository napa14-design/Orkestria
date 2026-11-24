import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { mudarFuncao, transferirFuncionario, transferirParaSetor } from "@/services/funcionariosService";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/funcionarios/[id]/transferir — { sede_id, data: "AAAA-MM-DD", abrirVaga? }.
 * Encerra a ficha na sede de origem (motivo "Transferência") e cria a ficha na
 * sede de destino — ver o serviço.
 *
 * Quem transfere precisa operar as DUAS sedes: a ficha nova nasce no destino, e
 * coordenador só cria cadastro nas sedes que opera. Entre sedes de coordenadores
 * diferentes, quem faz é o administrador.
 *
 * Com { setor, data, abrirVaga? } a pessoa vai para fora das sedes (ex.: cantina):
 * não nasce ficha em lugar nenhum, então basta operar a sede de origem.
 *
 * Com { funcao, data } a pessoa fica na sede e só a função muda (24/11/2026).
 */
export async function POST(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    const atual = await (await getDataSource()).obter("funcionarios", id);
    if (!atual) throw new Error("Funcionário não encontrado.");
    const dados = (await req.json().catch(() => ({}))) as { sede_id?: unknown; setor?: unknown; funcao?: unknown; data?: unknown; abrirVaga?: unknown };
    if (!podeAlterarSede(sessao, atual.sede_id))
      throw new ErroPermissao("Coordenadores só transferem funcionários das sedes que operam.");
    if (dados.funcao !== undefined) return ok(await mudarFuncao(id, dados, sessao.email));
    if (dados.setor !== undefined)
      return ok(await transferirParaSetor(id, dados, sessao.email, { nome: sessao.nome, email: sessao.email }));
    if (typeof dados.sede_id !== "string" || !podeAlterarSede(sessao, dados.sede_id))
      throw new ErroPermissao(
        "Você não opera a sede de destino: peça ao coordenador de lá ou ao administrador para fazer a transferência.",
      );
    return ok(await transferirFuncionario(id, dados, sessao.email, { nome: sessao.nome, email: sessao.email }));
  });
}
