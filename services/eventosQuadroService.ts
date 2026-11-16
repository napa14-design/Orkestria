/**
 * O feed de eventos do Quadro para o Chromos (`GET /api/chromos/eventos-quadro`). Só
 * leitura; as regras estão em `lib/eventosQuadro.ts`.
 */
import { getDataSource } from "@/lib/datasource";
import { hojeISO } from "@/lib/dateUtils";
import { ehAsg, paraOFeed, TETO_EVENTOS } from "@/lib/eventosQuadro";
import { HistoricoDataSource } from "@/lib/historico";

/**
 * Retenção de 90 dias. Passa pelo método explícito do decorator — o único que exclui
 * evento — e nunca por `excluir`, que segue recusando.
 */
export async function expurgarEventosAntigos(): Promise<number> {
  const ds = await getDataSource();
  if (!(ds instanceof HistoricoDataSource)) throw new Error("Expurgo sem o decorator de histórico.");
  return ds.expurgarEventosQuadroAntigos();
}

/**
 * O dia (Fortaleza) do último expurgo NESTA instância. Sem segredo novo nem cron (decisão do
 * dono, 16/11/2026), o expurgo pega carona no feed, que o Chromos lê uma vez por dia. Guardado
 * em memória do módulo, o mais simples: cada instância serverless fria pode rodar de novo no
 * mesmo dia — e não faz mal, porque o expurgo é idempotente e só lê os eventos já vencidos.
 */
let ultimoExpurgo: string | null = null;

/**
 * No máximo uma vez por dia (por instância). Marca o dia ANTES de rodar: uma falha não vira
 * nova tentativa a cada pedido. Quem chama trata o erro — o feed nunca muda por causa dele.
 */
export async function expurgarUmaVezPorDia(): Promise<number | null> {
  const hoje = hojeISO();
  if (ultimoExpurgo === hoje) return null;
  ultimoExpurgo = hoje;
  return expurgarEventosAntigos();
}

/** Costura de teste: esquece o dia do último expurgo. */
export function esquecerExpurgo(): void {
  ultimoExpurgo = null;
}

const TIPOS: ReadonlySet<string> = new Set(["admissao", "desligamento", "transferencia"]);

/**
 * Os eventos com `registradoEm >= desde`, em ordem de gravação. `registradoEm` é o
 * instante em UTC e `desde` é dia de Fortaleza (UTC−3): o dia local D começa às 03:00Z
 * de D, que é ">= D" na comparação de texto — então a janela sai igual ou MAIOR que o
 * pedido, nunca menor (o Chromos não duplica: o id do evento é estável).
 *
 * Acima do teto: `{ teto: true }` — quem chama responde 413, nunca a lista cortada. O
 * teto conta antes do filtro de ASG (lê-se `TETO + 1` do banco; é o custo máximo).
 */
export async function eventosDesde(desde: string): Promise<{ eventos: Record<string, string>[] } | { teto: true }> {
  const ds = await getDataSource();
  // Campo único (>= e ordem no mesmo campo): o índice automático do Firestore serve.
  const lidos = await ds.consultar("eventos_quadro", [{ campo: "registradoEm", op: ">=", valor: desde }], {
    ordenarPor: "registradoEm",
    limite: TETO_EVENTOS + 1,
  });
  if (lidos.length > TETO_EVENTOS) return { teto: true };
  return { eventos: lidos.filter((e) => TIPOS.has(e.tipo) && ehAsg(e.funcao)).map(paraOFeed) };
}
