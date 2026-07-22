import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { replicarTarefaParaLocais } from "@/services/tarefasService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await params;
    const ds = await getDataSource();
    const tarefa = await ds.obter("tarefas", id);
    if (!tarefa) throw new Error("Tarefa não encontrada.");
    if (!podeAlterarSede(sessao, tarefa.sede_id))
      throw new ErroPermissao("Você só pode replicar tarefas da própria sede.");

    const corpo = (await req.json()) as { locais_ids?: unknown };
    if (
      !Array.isArray(corpo.locais_ids) ||
      corpo.locais_ids.length === 0 ||
      corpo.locais_ids.some((item) => typeof item !== "string")
    ) {
      throw new ErroValidacao([
        { nivel: "erro", codigo: "DESTINOS_INVALIDOS", mensagem: "Selecione ao menos um local de destino." },
      ]);
    }

    const resultado = await replicarTarefaParaLocais(id, corpo.locais_ids, sessao.email);
    return ok({
      criadas: resultado.criadas.length,
      ignoradas: resultado.ignoradas,
      tarefas: resultado.criadas,
    }, 201);
  });
}
