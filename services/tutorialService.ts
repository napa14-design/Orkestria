import { agoraISO, getDataSource } from "@/lib/datasource";
import {
  type EstadoTutorial,
  escreverEstado,
  HORAS_ADIAMENTO,
} from "@/lib/tutorial/estado";

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

export async function getProgressoTutorial(
  usuarioId: string,
): Promise<{ concluidas: string[]; estado: string }> {
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", usuarioId);
  return {
    concluidas: lerLista(usuario?.tutorial_concluido),
    estado: usuario?.tutorial_estado ?? "",
  };
}

/**
 * Registra a resposta ao convite.
 *
 * `ver` liga os holofotes; `adiar` cala tudo por um dia e o convite volta;
 * `pular` não pergunta mais — a volta é pela trilha, quando ela quiser.
 */
export async function responderConvite(
  usuarioId: string,
  acao: "ver" | "adiar" | "pular" | "retomar",
): Promise<string> {
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", usuarioId);
  if (!usuario) throw new Error("Usuário não encontrado.");
  const estado: EstadoTutorial =
    acao === "adiar"
      ? { tipo: "adiado", ate: new Date(Date.now() + HORAS_ADIAMENTO * 3600_000).toISOString() }
      : acao === "pular"
        ? { tipo: "pulado" }
        : { tipo: "ativo" };
  const bruto = escreverEstado(estado);
  await ds.atualizar("usuarios", usuarioId, {
    tutorial_estado: bruto,
    atualizado_em: agoraISO(),
  });
  return bruto;
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
