import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { aplicarKitTarefasLocal } from "@/services/tarefasService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await params;
    const ds = await getDataSource();
    const local = await ds.obter("locais", id);
    if (!local) throw new Error("Local não encontrado.");
    if (!podeAlterarSede(sessao, local.sede_id))
      throw new ErroPermissao("Você só pode preparar locais da própria sede.");

    const corpo = (await req.json()) as { itens?: unknown };
    if (
      !Array.isArray(corpo.itens) ||
      corpo.itens.length === 0 ||
      corpo.itens.some((item) => typeof item !== "string")
    ) {
      throw new ErroValidacao([
        { nivel: "erro", codigo: "KIT_INVALIDO", mensagem: "Selecione ao menos uma tarefa válida do kit." },
      ]);
    }
    const resultado = await aplicarKitTarefasLocal(id, corpo.itens, sessao.email);
    return ok({
      criadas: resultado.criadas.length,
      ignoradas: resultado.ignoradas,
      tarefas: resultado.criadas,
    }, 201);
  });
}
