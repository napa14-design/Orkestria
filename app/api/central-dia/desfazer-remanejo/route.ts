import { comSessao, ok } from "@/lib/api";
import { desfazerRemanejoAutomatico } from "@/services/centralDiaService";
import { ErroValidacao } from "@/services/erros";

/** POST { rotina_id } → desfaz o remanejo automático da tarefa crítica (10/11/2026). */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { rotina_id } = (await req.json()) as { rotina_id?: unknown };
    if (typeof rotina_id !== "string" || !rotina_id)
      throw new ErroValidacao([{ nivel: "erro", codigo: "FALTAM_CAMPOS", mensagem: "Informe a tarefa." }]);
    return ok(await desfazerRemanejoAutomatico(sessao, rotina_id));
  });
}
