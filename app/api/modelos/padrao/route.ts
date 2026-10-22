import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { usarDiaComoPadrao } from "@/services/modelosService";

/**
 * POST { data_origem, sede_id, dias: number[] } → este dia passa a ser a rota
 * padrão da sede nesses dias da semana (0=dom … 6=sáb), substituindo a anterior.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { data_origem, sede_id, dias } = await req.json();
    if (typeof data_origem !== "string" || typeof sede_id !== "string" || !data_origem || !sede_id || !Array.isArray(dias))
      return ok({ erro: "Informe data_origem, sede_id e dias." }, 400);
    // Só inteiros de 0 a 6: `Number(null)` e `Number("")` viravam 0 (domingo) e
    // tiravam o domingo da rota antiga por causa de entrada lixo (segurança).
    if (dias.length > 7 || !dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      return ok({ erro: "dias deve ser uma lista de 0 (dom) a 6 (sáb)." }, 400);
    if (!podeAlterarSede(sessao, sede_id))
      throw new ErroPermissao("Coordenadores só gerenciam modelos das sedes que operam.");
    return ok(await usarDiaComoPadrao(data_origem, sede_id, dias, sessao.email), 201);
  });
}
