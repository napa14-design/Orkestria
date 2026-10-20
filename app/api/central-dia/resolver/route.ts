import { comSessao, ok } from "@/lib/api";
import { resolverProximaExcecao } from "@/services/centralDiaService";
import { ErroValidacao } from "@/services/erros";

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { rotina_id, funcionario_id, cedidas, sede } = (await req.json()) as {
      rotina_id?: string;
      funcionario_id?: string;
      /** Na troca por prioridade: ids dos blocos que a pessoa viu que seriam cedidos. */
      cedidas?: unknown;
      sede?: unknown;
    };
    if (!rotina_id || !funcionario_id)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "FALTAM_CAMPOS",
          mensagem: "A proposta de alocação está incompleta.",
        },
      ]);
    const cedidasIds = Array.isArray(cedidas) ? cedidas.filter((c): c is string => typeof c === "string") : [];
    return ok(
      await resolverProximaExcecao(
        sessao,
        rotina_id,
        funcionario_id,
        cedidasIds,
        typeof sede === "string" ? sede : undefined,
      ),
    );
  });
}
