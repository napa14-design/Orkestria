import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { aplicarImportacao } from "@/services/importacaoService";

/**
 * POST /api/importar/aplicar { sede_id, data, analise, salvar_padrao }
 * Cria locais/tarefas/funcionários/rotinas da planilha já analisada.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { sede_id, data, analise, salvar_padrao } = await req.json();
    if (!sede_id || !data || !analise) return ok({ erro: "Informe sede_id, data e a análise." }, 400);
    if (!podeAlterarSede(sessao, sede_id))
      throw new ErroPermissao("Supervisores só importam rotas da própria sede.");
    return ok(
      await aplicarImportacao(sede_id, data, analise, sessao.email, { salvarPadrao: !!salvar_padrao }),
    );
  });
}
