import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { gerarDiaDaRotaPadrao } from "@/services/modelosService";

/** POST { sede, data } → gera o dia a partir da rota padrão da sede (idempotente). */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { sede, data } = await req.json();
    if (!sede || !data) return ok({ erro: "Informe sede e data." }, 400);
    if (!podeAlterarSede(sessao, sede))
      throw new ErroPermissao("Supervisores só geram a rotina da própria sede.");
    return ok(await gerarDiaDaRotaPadrao(sede, data, sessao.id));
  });
}
