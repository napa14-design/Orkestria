import { comSessao, ok } from "@/lib/api";
import { ErroPermissao } from "@/services/erros";

/**
 * POST /api/setup — cria as abas e cabeçalhos na planilha do Google Sheets.
 * Disponível apenas quando DATA_SOURCE=sheets e para administradores.
 */
export async function POST() {
  return comSessao(async (sessao) => {
    if (sessao.perfil !== "administrador")
      throw new ErroPermissao("Apenas administradores executam o setup.");
    if (process.env.DATA_SOURCE !== "sheets")
      return ok({ erro: "Setup só se aplica quando DATA_SOURCE=sheets." }, 400);
    const { GoogleSheetsDataSource } = await import("@/lib/googleSheetsClient");
    const ds = new GoogleSheetsDataSource();
    const criadas = await ds.garantirEstrutura();
    return ok({ ok: true, abas_criadas: criadas });
  });
}
