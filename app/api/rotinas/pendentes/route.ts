import { comSessao, ok } from "@/lib/api";
import { hojeISO } from "@/lib/dateUtils";
import { limitarSedeConsulta } from "@/lib/permissions";
import { diasComPendencia } from "@/services/rotinasService";

/**
 * GET /api/rotinas/pendentes?sede=X → [[data, quantidade], …]
 *
 * Dias da última semana com blocos ainda sem registro (o aviso do
 * Acompanhamento), já contados no servidor — sem trazer as rotinas.
 */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const sede = limitarSedeConsulta(sessao, new URL(req.url).searchParams.get("sede") ?? undefined);
    // Sem sede (visão "todas"): o aviso é por sede, como a própria tela.
    if (!sede) return ok([]);
    return ok(await diasComPendencia(sede, hojeISO()));
  });
}
