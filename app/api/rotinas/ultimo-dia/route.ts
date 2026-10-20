import { comSessao, ok } from "@/lib/api";
import { somarDias } from "@/lib/dateUtils";
import { limitarSedeConsulta, podeEscrever } from "@/lib/permissions";
import { ultimoDiaComRotina } from "@/services/rotinasService";

/**
 * GET /api/rotinas/ultimo-dia?sede=X&antes=YYYY-MM-DD → { data, n } | null
 *
 * O dia mais recente (até 31 dias antes) com rotina na sede — a fonte do
 * "repetir o dia anterior" da Agenda, contada no servidor sem trazer as rotinas.
 */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    // Repetir o dia é montar a agenda: só quem escreve no planejado.
    if (!podeEscrever(sessao)) return ok(null);
    const url = new URL(req.url);
    const sede = limitarSedeConsulta(sessao, url.searchParams.get("sede") ?? undefined);
    const antes = url.searchParams.get("antes") ?? "";
    // Formato E data de verdade: "2026-13-45" passava na regex e custava 31
    // contagens que não casam nada (revisão de segurança, 20/10/2026).
    if (!sede || !/^\d{4}-\d{2}-\d{2}$/.test(antes) || somarDias(antes, 0) !== antes) return ok(null);
    return ok(await ultimoDiaComRotina(sede, antes));
  });
}
