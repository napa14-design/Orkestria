import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { limparDia, type EscopoLimpeza } from "@/services/rotinasService";

/**
 * POST /api/rotinas/limpar { sede, data, escopo }
 *
 * O caminho de volta do "Gerar o dia". `escopo: "geradas"` (padrão) remove só
 * o que a máquina criou; `"todas"` limpa o dia inteiro. Bloco com realizado
 * registrado nunca sai — a regra está no serviço, não aqui, porque vale para
 * qualquer caminho que chame a limpeza.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { sede, data, escopo } = await req.json();
    if (!sede || !data) return ok({ erro: "Informe a sede e a data." }, 400);
    if (!podeAlterarSede(sessao, sede))
      throw new ErroPermissao("Supervisores só limpam o dia das sedes que operam.");
    const alcance: EscopoLimpeza = escopo === "todas" ? "todas" : "geradas";
    return ok(await limparDia(sede, data, alcance, sessao.email));
  });
}
