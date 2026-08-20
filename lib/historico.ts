/**
 * Decorator de histórico: envolve qualquer DataSource e registra toda
 * escrita (criar/atualizar/excluir) na tabela `historico`, com o usuário da
 * requisição atual (lib/contextoUsuario.ts).
 *
 * Ponto único de auditoria — nenhum serviço ou rota precisa logar nada.
 * DECISÃO DE ARQUITETURA: o log é aguardado e tentado novamente em falhas
 * transitórias. Isso acrescenta uma escrita ao caminho crítico, inclusive nos
 * lotes, mas evita perder auditoria quando uma requisição serverless termina.
 * A otimização futura correta é batch/BulkWriter com dado + log, não voltar a
 * fire-and-forget. Fontes que não oferecem transação conjunta ainda não têm
 * atomicidade perfeita, mas a requisição não termina antes da auditoria.
 */
import { usuarioAtual } from "./contextoUsuario";
import type { CondicaoConsulta, DataSource, OperacaoLote } from "./datasource";
import type { MapaTabelas, NomeTabela } from "./schema";

/** Campos usados como "nome" do registro no resumo, na ordem de preferência. */
const CAMPOS_NOME = [
  "nome",
  "nome_tarefa",
  "nome_local",
  "nome_sede",
  "nome_modelo",
  "chave",
  "email",
] as const;

function nomeDoRegistro(registro: Record<string, unknown>): string {
  for (const campo of CAMPOS_NOME) {
    const v = registro[campo];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

export class HistoricoDataSource implements DataSource {
  constructor(private interno: DataSource) {}

  listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]> {
    return this.interno.listar(tabela);
  }

  consultar<K extends NomeTabela>(
    tabela: K,
    condicoes: CondicaoConsulta[],
  ): Promise<MapaTabelas[K][]> {
    return this.interno.consultar(tabela, condicoes);
  }

  obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null> {
    return this.interno.obter(tabela, id);
  }

  async criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]> {
    const resultado = await this.interno.criar(tabela, registro);
    await this.logar(
      tabela,
      (registro as { id: string }).id,
      "criar",
      nomeDoRegistro(registro as unknown as Record<string, unknown>),
    );
    return resultado;
  }

  async atualizar<K extends NomeTabela>(
    tabela: K,
    id: string,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K]> {
    const resultado = await this.interno.atualizar(tabela, id, mudancas);
    const campos = Object.keys(mudancas)
      .filter((c) => !["atualizado_por", "atualizado_em"].includes(c))
      .join(", ");
    await this.logar(tabela, id, "atualizar", campos);
    return resultado;
  }

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    await this.interno.excluir(tabela, id);
    await this.logar(tabela, id, "excluir", "");
  }

  /**
   * O ponto alto do decorator: os registros de auditoria entram **no mesmo
   * lote** que o dado. Antes, cada escrita gerava um log separado — se o log
   * falhasse, o dado ficava sem rastro; se o dado falhasse no meio, os logs já
   * gravados descreviam escritas que não aconteceram.
   *
   * É exatamente a "otimização futura correta" que o comentário do topo deste
   * arquivo previa: batch com dado + log, em vez de voltar a fire-and-forget.
   */
  async gravarLote(operacoes: OperacaoLote[]): Promise<void> {
    const agora = new Date().toISOString();
    const usuario = usuarioAtual();
    const logs: OperacaoLote[] = [];
    for (const op of operacoes) {
      if (op.tabela === "historico") continue; // sem recursão
      const registroId = op.tipo === "criar" ? (op.registro as { id: string }).id : op.id;
      const resumo =
        op.tipo === "criar"
          ? nomeDoRegistro(op.registro as unknown as Record<string, unknown>)
          : op.tipo === "atualizar"
            ? Object.keys(op.mudancas)
                .filter((c) => !["atualizado_por", "atualizado_em"].includes(c))
                .join(", ")
            : "";
      logs.push({
        tipo: "criar",
        tabela: "historico",
        registro: {
          id: crypto.randomUUID(),
          tabela: op.tabela,
          registro_id: registroId,
          acao: op.tipo,
          resumo,
          usuario,
          criado_em: agora,
        } as MapaTabelas["historico"],
      });
    }
    await this.interno.gravarLote([...operacoes, ...logs]);
  }

  private async logar(
    tabela: NomeTabela,
    registroId: string,
    acao: "criar" | "atualizar" | "excluir",
    resumo: string,
  ): Promise<void> {
    if (tabela === "historico") return; // sem recursão
    const registro = {
      id: crypto.randomUUID(),
      tabela,
      registro_id: registroId,
      acao,
      resumo,
      usuario: usuarioAtual(),
      criado_em: new Date().toISOString(),
    };
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        await this.interno.criar("historico", registro);
        return;
      } catch (erro) {
        if (tentativa === 3) {
          console.error("[historico] falhou após 3 tentativas", erro);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, tentativa * 40));
      }
    }
  }
}
