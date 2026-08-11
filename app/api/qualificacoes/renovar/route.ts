import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { aplicarRenovacao, planejarRenovacao } from "@/services/qualificacoesService";

/**
 * POST /api/qualificacoes/renovar
 * { funcionario_ids[], requisito_ids[], validade, aplicar?, esperado? }
 *
 * Sem `aplicar`, devolve **só o plano** — nada é escrito. Com `aplicar: true`, o
 * plano é **recalculado** e comparado a `esperado` (o que a pessoa viu na prévia);
 * se a base mudou no meio, para e manda revisar.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const corpo = (await req.json()) as {
      funcionario_ids?: string[];
      requisito_ids?: string[];
      validade?: string;
      aplicar?: boolean;
      esperado?: number;
    };
    const funcionarioIds = corpo.funcionario_ids ?? [];

    // Mesma regra de sede do lote: nem prévia de gente que não é da sua sede.
    const ds = await getDataSource();
    const funcionarios = await Promise.all(funcionarioIds.map((id) => ds.obter("funcionarios", id)));
    for (const funcionario of funcionarios) {
      if (funcionario && !podeAlterarSede(sessao, funcionario.sede_id))
        throw new ErroPermissao(
          `Supervisores só renovam qualificações das sedes que operam — ${funcionario.nome} é de outra sede.`,
        );
    }

    const entrada = {
      funcionarioIds,
      requisitoIds: corpo.requisito_ids ?? [],
      validade: corpo.validade ?? "",
    };
    if (!corpo.aplicar) return ok({ plano: await planejarRenovacao(entrada) });
    return ok(await aplicarRenovacao({ ...entrada, esperado: corpo.esperado }, sessao.email));
  });
}
