import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { somarDias, hojeISO } from "@/lib/dateUtils";
import { acessaTodasAsSedes } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";

/**
 * GET /api/historico[?tabela=X][&dias=30][&limite=500] — mais recentes primeiro.
 *
 * Nunca lê a coleção inteira por padrão (é a que mais cresce): sem filtro de
 * tabela, restringe por janela de dias em `criado_em` (campo único → índice
 * automático, sem índice composto). `dias=0` = tudo (fallback explícito/pesado).
 * Filtro por tabela usa o índice de `tabela` (também campo único).
 */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    // O histórico legado não registra sede. Até o passo de auditoria adicionar
    // esse escopo, não é seguro expor registros globais a supervisores.
    // Lista positiva: só quem já alcança todas as sedes (o histórico não guarda sede).
    if (!acessaTodasAsSedes(sessao))
      throw new ErroPermissao("O histórico por sede ainda não está disponível para o seu perfil.");
    const url = new URL(req.url);
    const tabela = url.searchParams.get("tabela");
    const dias = Number(url.searchParams.get("dias") ?? 30);
    // Inteiro positivo, sempre: negativo ou fracionário dava erro no Firestore e
    // outro resultado na memória (revisão de segurança, 20/10/2026).
    const pedido = Math.trunc(Number(url.searchParams.get("limite")));
    const limite = pedido > 0 ? Math.min(2000, pedido) : 500;
    const ds = await getDataSource();

    // Ordenar e limitar no banco: lia ~6 mil registros (30 dias) para mostrar
    // 500 — e cada um é leitura cobrada (levantamento, 20/10/2026). Só por
    // `criado_em`, o mesmo campo do intervalo: índice automático, nada a publicar.
    const maisRecentes = { ordenarPor: "criado_em", decrescente: true, limite };
    let base;
    if (tabela) {
      // Só os mais recentes, ordenados no banco — a tabela de rotinas sozinha
      // passa de 20 mil linhas de histórico, e cada uma é leitura cobrada
      // (levantamento, 22/10/2026). Pede o índice composto (tabela + criado_em)
      // de firestore.indexes.json: ⚠️ enquanto ele não estiver publicado, o
      // Firestore recusa a consulta e cai no jeito antigo (lê a tabela toda).
      try {
        base = await ds.consultar("historico", [{ campo: "tabela", op: "==", valor: tabela }], maisRecentes);
      } catch (e) {
        console.warn("[historico] índice tabela+criado_em indisponível, lendo sem ordenar", e);
        base = await ds.consultar("historico", [{ campo: "tabela", op: "==", valor: tabela }]);
      }
    } else if (dias > 0) {
      // janela de tempo: criado_em >= (hoje − dias) — ISO compara como string
      const desde = `${somarDias(hojeISO(), -dias)}T00:00:00.000Z`;
      base = await ds.consultar("historico", [{ campo: "criado_em", op: ">=", valor: desde }], maisRecentes);
    } else {
      base = await ds.consultar("historico", [], maisRecentes); // "tudo" — os mais recentes
    }
    base.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    return ok(base.slice(0, limite));
  });
}
