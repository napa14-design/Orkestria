import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { desligarFuncionario, sairDoPosto } from "@/services/funcionariosService";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/funcionarios/[id]/desligar — `tipo` obrigatório (13/11/2026):
 *  - { tipo: "saiu_da_empresa", data: "AAAA-MM-DD", motivo, abrirVaga?, extinguirPosto? }:
 *    grava o desligamento, tira da agenda os blocos planejados a partir da data, grava o
 *    evento do Quadro (ASG) no mesmo lote e abre a vaga no SGCP (ver o serviço);
 *  - { tipo: "saiu_do_posto", data: "AAAA-MM-DD" }: a pessoa fica na sede, sem rota; a
 *    rota vira posto vago. Sem evento e sem vaga.
 */
export async function POST(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    const atual = await (await getDataSource()).obter("funcionarios", id);
    if (!atual) throw new Error("Funcionário não encontrado.");
    if (!podeAlterarSede(sessao, atual.sede_id))
      throw new ErroPermissao("Coordenadores só desligam funcionários das sedes que operam.");
    const dados = (await req.json().catch(() => ({}))) ?? {};
    if (dados.tipo === "saiu_do_posto") return ok(await sairDoPosto(id, dados, sessao.email));
    return ok(await desligarFuncionario(id, dados, sessao.email, { nome: sessao.nome, email: sessao.email }));
  });
}
