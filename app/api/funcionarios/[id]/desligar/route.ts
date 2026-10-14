import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { desligarFuncionario } from "@/services/funcionariosService";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/funcionarios/[id]/desligar — { data: "AAAA-MM-DD", motivo }.
 * Substitui o "Excluir" do cadastro: grava o desligamento, tira da agenda os
 * blocos planejados a partir da data e abre a vaga no SGCP (ver o serviço).
 */
export async function POST(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    const atual = await (await getDataSource()).obter("funcionarios", id);
    if (!atual) throw new Error("Funcionário não encontrado.");
    if (!podeAlterarSede(sessao, atual.sede_id))
      throw new ErroPermissao("Supervisores só desligam funcionários das sedes que operam.");
    const dados = await req.json();
    return ok(await desligarFuncionario(id, dados, sessao.email, { nome: sessao.nome, email: sessao.email }));
  });
}
