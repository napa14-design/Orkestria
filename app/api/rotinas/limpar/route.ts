import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { limparDia, limparPeriodo, type EscopoLimpeza } from "@/services/rotinasService";

/** Mesmo teto do gerar: a visão semanal manda 7; 31 cobre um mês. */
const MAX_DATAS = 31;

/**
 * POST { sede, data, escopo } → desfaz UM dia.
 * POST { sede, datas: [], escopo } → desfaz VÁRIOS (o "desfazer a semana").
 *
 * `escopo: "geradas"` (padrão) remove só o que a máquina criou; `"todas"` limpa
 * o dia inteiro. Bloco com realizado registrado nunca sai — a regra está no
 * serviço, não aqui, porque vale para qualquer caminho que chame a limpeza.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { sede, data, datas, escopo } = (await req.json()) as {
      sede?: string;
      data?: string;
      datas?: string[];
      escopo?: string;
    };
    if (!sede) return ok({ erro: "Informe a sede." }, 400);
    if (!podeAlterarSede(sessao, sede))
      throw new ErroPermissao("Supervisores só limpam o dia das sedes que operam.");
    const alcance: EscopoLimpeza = escopo === "todas" ? "todas" : "geradas";

    if (Array.isArray(datas)) {
      const limpas = [...new Set(datas.filter((d) => typeof d === "string" && d))].sort();
      if (limpas.length === 0) return ok({ erro: "Informe ao menos uma data." }, 400);
      if (limpas.length > MAX_DATAS)
        return ok({ erro: `No máximo ${MAX_DATAS} dias por vez.` }, 400);
      return ok(await limparPeriodo(sede, limpas, alcance, sessao.email));
    }

    if (!data) return ok({ erro: "Informe a sede e a data." }, 400);
    return ok(await limparDia(sede, data, alcance, sessao.email));
  });
}
