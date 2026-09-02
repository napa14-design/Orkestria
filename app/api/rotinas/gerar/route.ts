import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { gerarDiaDaRotaPadrao, gerarPeriodoDaRotaPadrao } from "@/services/modelosService";

/** Teto de datas por chamada: a visão semanal manda 7; 31 cobre um mês. */
const MAX_DATAS = 31;

/**
 * POST { sede, data } → gera UM dia da rota padrão da sede (idempotente).
 * POST { sede, datas: [] } → gera VÁRIOS, cada data resolvida pelo dia da
 * semana dela. É o "gerar a semana" da visão semanal.
 *
 * Uma rota só para os dois casos: é a mesma operação e a mesma permissão, e
 * dois endpoints para isso divergiriam na primeira mudança de regra.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { sede, data, datas } = (await req.json()) as {
      sede?: string;
      data?: string;
      datas?: string[];
    };
    if (!sede) return ok({ erro: "Informe a sede." }, 400);
    if (!podeAlterarSede(sessao, sede))
      throw new ErroPermissao("Supervisores só geram a rotina das sedes que operam.");

    if (Array.isArray(datas)) {
      // Datas repetidas gerariam o mesmo dia duas vezes na mesma chamada — a
      // segunda passada não criaria nada, mas o relatório sairia estranho.
      const limpas = [...new Set(datas.filter((d) => typeof d === "string" && d))].sort();
      if (limpas.length === 0) return ok({ erro: "Informe ao menos uma data." }, 400);
      if (limpas.length > MAX_DATAS)
        return ok({ erro: `No máximo ${MAX_DATAS} dias por vez.` }, 400);
      return ok(await gerarPeriodoDaRotaPadrao(sede, limpas, sessao.id));
    }

    if (!data) return ok({ erro: "Informe sede e data." }, 400);
    return ok(await gerarDiaDaRotaPadrao(sede, data, sessao.id));
  });
}
