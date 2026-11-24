import { comSessao, ok } from "@/lib/api";
import { dataReal } from "@/lib/dateUtils";
import { leituraCompleta, limitarSedeConsulta } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { getRemanejosDoDia } from "@/services/remanejosDoDiaService";

/**
 * GET /api/remanejos?data=YYYY-MM-DD&sede=ID — quem está fora no dia e o que foi feito de cada
 * tarefa dele. Só quem já lê as ausências inteiras (administrador, coordenador, gerência), e cada um
 * no escopo dele; o supervisor não. Não devolve o tipo nem a observação da ausência.
 */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    if (!leituraCompleta(sessao)) throw new ErroPermissao();
    const url = new URL(req.url);
    const data = url.searchParams.get("data") ?? "";
    // Uma sede por vez: sem sede no pedido, quem vê todas não recebe "todas".
    const sede = limitarSedeConsulta(sessao, url.searchParams.get("sede") ?? undefined);
    if (!sede || sede === "geral" || !dataReal(data)) return ok({ erro: "Informe a sede e a data." }, 400);
    return ok(await getRemanejosDoDia(sede, data));
  });
}
