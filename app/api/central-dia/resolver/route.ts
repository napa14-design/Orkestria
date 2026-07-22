import { comSessao, ok } from "@/lib/api";
import { resolverProximaExcecao } from "@/services/centralDiaService";
import { ErroValidacao } from "@/services/erros";

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { rotina_id, funcionario_id } = (await req.json()) as {
      rotina_id?: string;
      funcionario_id?: string;
    };
    if (!rotina_id || !funcionario_id)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "FALTAM_CAMPOS",
          mensagem: "A proposta de alocação está incompleta.",
        },
      ]);
    return ok(await resolverProximaExcecao(sessao, rotina_id, funcionario_id));
  });
}
