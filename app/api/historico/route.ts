import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";

/** GET /api/historico[?tabela=X][&limite=300] — mais recentes primeiro. */
export async function GET(req: Request) {
  return comSessao(async () => {
    const url = new URL(req.url);
    const tabela = url.searchParams.get("tabela");
    const limite = Math.min(1000, Number(url.searchParams.get("limite")) || 300);
    const ds = await getDataSource();
    const todos = await ds.listar("historico");
    const filtrados = tabela ? todos.filter((h) => h.tabela === tabela) : todos;
    filtrados.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    return ok(filtrados.slice(0, limite));
  });
}
