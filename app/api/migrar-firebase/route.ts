import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { SCHEMA, type NomeTabela } from "@/lib/schema";
import { ErroPermissao } from "@/services/erros";

/**
 * POST /api/migrar-firebase — copia TODOS os dados da fonte atual
 * (DATA_SOURCE=sheets ou memory) para o Firestore. Admin apenas.
 *
 * Fluxo: rodar com a fonte antiga ativa → chamar este endpoint → conferir as
 * contagens → trocar DATA_SOURCE=firebase no .env → reiniciar.
 * Idempotente: documentos têm o mesmo id, então rodar de novo sobrescreve.
 */
export async function POST() {
  return comSessao(async (sessao) => {
    if (sessao.perfil !== "administrador")
      throw new ErroPermissao("Apenas administradores executam a migração.");
    if (process.env.DATA_SOURCE === "firebase")
      return ok(
        { erro: "DATA_SOURCE já é firebase — rode a migração com a fonte antiga ativa." },
        400,
      );

    const { FirebaseDataSource } = await import("@/lib/firebaseClient");
    const origem = await getDataSource();
    const destino = new FirebaseDataSource();

    const tabelas = Object.keys(SCHEMA) as NomeTabela[];
    const contagens: Record<string, number> = {};
    for (const tabela of tabelas) {
      const registros = await origem.listar(tabela);
      for (const registro of registros) {
        await destino.criar(tabela, registro);
      }
      contagens[tabela] = registros.length;
    }
    return ok({
      ok: true,
      origem: process.env.DATA_SOURCE ?? "memory",
      migrados: contagens,
      proximo_passo: "Defina DATA_SOURCE=firebase no .env e reinicie o servidor.",
    });
  });
}
