import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { TipoLocalCatalogo } from "@/types";
import { ErroValidacao } from "./erros";

type DadosTipoLocal = Omit<
  TipoLocalCatalogo,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

/**
 * O fator é o que dá sentido ao tipo — sem ele, criar um tipo seria criar um
 * rótulo com cara de configuração. Fora da faixa 0,1–5 é quase certamente
 * engano de digitação (0 zeraria o tempo; 50 multiplicaria por cinquenta).
 */
function validar(dados: Partial<DadosTipoLocal>) {
  if (!dados.nome || !dados.nome.trim())
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TIPO_LOCAL_SEM_NOME", mensagem: "Informe o nome do tipo." },
    ]);
  const f = dados.fator_intensidade;
  if (f !== undefined && f !== null && (!Number.isFinite(f) || f <= 0 || f > 5))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "TIPO_LOCAL_FATOR_INVALIDO",
        mensagem:
          "A intensidade precisa ficar entre 0,1 e 5 (0,8 leve · 1,0 normal · 1,5 densa). Deixe vazio para 1,0.",
      },
    ]);
}

/**
 * EPI padrão entra em toda tarefa nova do tipo: requisito que não é EPI é recusado. Devolve
 * a lista limpa para gravar. Id que sumiu do catálogo cai calado: a tela reenvia a lista
 * inteira e não mostra o apagado, então recusá-lo travaria o tipo para sempre.
 */
async function normalizarEpisPadrao(episPadrao: unknown): Promise<string | undefined> {
  if (episPadrao === undefined || episPadrao === null) return undefined;
  const recusa = () =>
    new ErroValidacao([{ nivel: "erro", codigo: "TIPO_LOCAL_EPI_INVALIDO", mensagem: "Escolha os EPIs padrão na lista do catálogo." }]);
  if (typeof episPadrao !== "string") throw recusa();
  const ids = [...new Set(episPadrao.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return "";
  const catalogo = new Map((await (await getDataSource()).listar("requisitos")).map((r) => [r.id, r]));
  if (ids.some((id) => catalogo.has(id) && catalogo.get(id)!.tipo !== "epi")) throw recusa();
  return ids.filter((id) => catalogo.has(id)).join(",");
}

export async function getTiposLocal(): Promise<TipoLocalCatalogo[]> {
  const ds = await getDataSource();
  return ds.listar("tipos_local");
}

export async function createTipoLocal(
  dados: DadosTipoLocal,
  autor: string,
): Promise<TipoLocalCatalogo> {
  validar(dados);
  const epis_padrao = await normalizarEpisPadrao(dados.epis_padrao);
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("tipos_local", {
    ...dados,
    ...(epis_padrao !== undefined ? { epis_padrao } : {}),
    id: novoId(), // depois do spread: id do corpo não sobrescreve registro alheio
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateTipoLocal(
  id: string,
  mudancas: Partial<DadosTipoLocal>,
  autor: string,
): Promise<TipoLocalCatalogo> {
  const ds = await getDataSource();
  const atual = await ds.obter("tipos_local", id);
  if (!atual) throw new Error("Tipo de local não encontrado.");
  validar({ ...atual, ...mudancas });
  const epis_padrao = await normalizarEpisPadrao(mudancas.epis_padrao);
  return ds.atualizar("tipos_local", id, {
    ...mudancas,
    ...(epis_padrao !== undefined ? { epis_padrao } : {}),
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/**
 * Bloqueado quando há locais usando o tipo — excluir deixaria `tipo_local`
 * apontando para nada, e o local cairia em 1,0 sem ninguém saber por quê.
 * Inativar tira da lista de escolha e preserva quem já usa.
 */
export async function deleteTipoLocal(id: string): Promise<void> {
  const ds = await getDataSource();
  const locais = await ds.consultar("locais", [{ campo: "tipo_local", op: "==", valor: id }]);
  if (locais.length > 0)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSSUI_LOCAIS",
        mensagem: `${locais.length} local(is) usam este tipo. Excluir deixaria a intensidade deles sem origem — use "Editar" e marque como Inativo.`,
      },
    ]);
  await ds.excluir("tipos_local", id);
}

/**
 * Mapa `tipo → fator` para quem calcula tempo. Uma leitura da coleção (12–20
 * documentos) por operação de cálculo — o mesmo custo que `resolverParametros`
 * já paga. Sem isto, um tipo criado pelo usuário cairia em 1,0 em silêncio, que
 * era exatamente a objeção contra deixar criar tipo.
 */
export async function mapaFatorDoTipo(): Promise<ReadonlyMap<string, number>> {
  const tipos = await getTiposLocal();
  return new Map(
    tipos
      .filter((t) => Number(t.fator_intensidade) > 0)
      .map((t) => [t.id, Number(t.fator_intensidade)] as const),
  );
}

/** Um item do catálogo, para a rota decidir permissão antes de deixar mexer. */
export async function getTipoLocalPorId(id: string): Promise<TipoLocalCatalogo | null> {
  const ds = await getDataSource();
  return ds.obter("tipos_local", id);
}
