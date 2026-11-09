import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { trocarTarefasDoDia } from "@/services/rotinasService";

/**
 * POST { data, sede_id, a, b, confirmar?, forcar?, rota?, assinatura? } → troca as tarefas do dia
 * entre duas pessoas da sede. Sem `confirmar`, só devolve a proposta para a tela mostrar.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const corpo = await req.json().catch(() => null);
    const sedeId = typeof corpo?.sede_id === "string" ? corpo.sede_id : "";
    if (!sedeId || !podeAlterarSede(sessao, sedeId))
      throw new ErroPermissao("Coordenadores só trocam tarefas nas sedes que operam.");
    return ok(
      await trocarTarefasDoDia({
        data: corpo.data,
        sedeId,
        aId: corpo.a,
        bId: corpo.b,
        confirmar: corpo.confirmar === true,
        forcar: corpo.forcar === true,
        rota: corpo.rota === true,
        assinatura: corpo.assinatura,
      }),
    );
  });
}
