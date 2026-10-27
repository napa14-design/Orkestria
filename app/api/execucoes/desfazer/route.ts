import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeRegistrarRealizado } from "@/lib/permissions";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { desfazerRegistro } from "@/services/execucoesService";

/**
 * POST /api/execucoes/desfazer { rotina_id } — desmarca o realizado: apaga o
 * registro e a tarefa volta a "planejada" (ver o serviço). Quem registra pode
 * desfazer, nas sedes que opera; as travas de perfil ficam no serviço.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeRegistrarRealizado(sessao)) throw new ErroPermissao();
    const { rotina_id } = (await req.json().catch(() => ({}))) as { rotina_id?: unknown };
    if (typeof rotina_id !== "string" || !rotina_id)
      throw new ErroValidacao([{ nivel: "erro", codigo: "FALTAM_CAMPOS", mensagem: "Qual tarefa desmarcar?" }]);
    const rotina = await (await getDataSource()).obter("rotinas_planejadas", rotina_id);
    if (!rotina) throw new Error("Rotina planejada não encontrada.");
    if (!podeAlterarSede(sessao, rotina.sede_id))
      throw new ErroPermissao("Só se desmarca execução das sedes que você opera.");
    return ok(await desfazerRegistro(rotina_id, { perfil: sessao.perfil, usuarioId: sessao.id }));
  });
}
