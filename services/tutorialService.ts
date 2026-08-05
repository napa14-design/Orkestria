import { agoraISO, getDataSource } from "@/lib/datasource";

/**
 * Progresso da trilha de aprendizado.
 *
 * Mora numa coluna de `usuarios` (`tutorial_concluido`, ids separados por
 * vírgula) em vez de tabela própria: vem junto com o usuário que já é lido no
 * login, não cria coleção nem índice novo, e são poucas escritas na vida — uma
 * por etapa concluída.
 */

function lerLista(csv?: string): string[] {
  if (!csv) return [];
  return csv.split(",").map((id) => id.trim()).filter(Boolean);
}

export async function getEtapasConcluidas(usuarioId: string): Promise<string[]> {
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", usuarioId);
  return lerLista(usuario?.tutorial_concluido);
}

/** Marca a etapa como concluída. Repetir não duplica nem dá erro. */
export async function concluirEtapa(usuarioId: string, etapaId: string): Promise<string[]> {
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", usuarioId);
  if (!usuario) throw new Error("Usuário não encontrado.");
  const atuais = lerLista(usuario.tutorial_concluido);
  if (atuais.includes(etapaId)) return atuais;
  const proximas = [...atuais, etapaId];
  await ds.atualizar("usuarios", usuarioId, {
    tutorial_concluido: proximas.join(","),
    atualizado_em: agoraISO(),
  });
  return proximas;
}
