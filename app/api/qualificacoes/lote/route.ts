import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { criarQualificacoesEmLote } from "@/services/qualificacoesService";

/**
 * POST /api/qualificacoes/lote
 * { funcionario_ids[], requisito_ids[], validade?, nivel?, observacao? }
 *
 * Lança o produto pessoas × capacitações numa chamada. Par que já existe é contado
 * e deixado como está — renovar validade é editar, não relançar em lote.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const corpo = (await req.json()) as {
      funcionario_ids?: string[];
      requisito_ids?: string[];
      validade?: string;
      nivel?: string;
      observacao?: string;
    };
    const funcionarioIds = corpo.funcionario_ids ?? [];

    // Mesma regra do caminho unitário, aplicada a TODA pessoa do lote: supervisor
    // não qualifica gente de sede que não opera.
    const ds = await getDataSource();
    const funcionarios = await Promise.all(
      funcionarioIds.map((id) => ds.obter("funcionarios", id)),
    );
    for (const funcionario of funcionarios) {
      if (funcionario && !podeAlterarSede(sessao, funcionario.sede_id))
        throw new ErroPermissao(
          `Supervisores só definem qualificações das sedes que operam — ${funcionario.nome} é de outra sede.`,
        );
    }

    return ok(
      await criarQualificacoesEmLote(
        {
          funcionarioIds,
          requisitoIds: corpo.requisito_ids ?? [],
          validade: corpo.validade,
          nivel: corpo.nivel,
          observacao: corpo.observacao,
        },
        sessao.email,
      ),
    );
  });
}
