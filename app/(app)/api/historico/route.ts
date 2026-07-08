import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { somarDias, hojeISO } from "@/lib/dateUtils";

/**
 * GET /api/historico[?tabela=X][&dias=30][&limite=500] — mais recentes primeiro.
 *
 * Nunca lê a coleção inteira por padrão (é a que mais cresce): sem filtro de
 * tabela, restringe por janela de dias em `criado_em` (campo único → índice
 * automático, sem índice composto). `dias=0` = tudo (fallback explícito/pesado).
 * Filtro por tabela usa o índice de `tabela` (também campo único).
 */
export async function GET(req: Request) {
  return comSessao(async () => {
    const url = new URL(req.url);
    const tabela = url.searchParams.get("tabela");
    const dias = Number(url.searchParams.get("dias") ?? 30);
    const limite = Math.min(2000, Number(url.searchParams.get("limite")) || 500);
    const ds = await getDataSource();

    let base;
    if (tabela) {
      base = await ds.consultar("historico", [{ campo: "tabela", op: "==", valor: tabela }]);
    } else if (dias > 0) {
      // janela de tempo: criado_em >= (hoje − dias) — ISO compara como string
      const desde = `${somarDias(hojeISO(), -dias)}T00:00:00.000Z`;
      base = await ds.consultar("historico", [{ campo: "criado_em", op: ">=", valor: desde }]);
    } else {
      base = await ds.listar("historico"); // "tudo" — escolha explícita
    }
    base.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    return ok(base.slice(0, limite));
  });
}
