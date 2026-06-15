/**
 * Decorator de histórico: envolve qualquer DataSource e registra toda
 * escrita (criar/atualizar/excluir) na tabela `historico`, com o usuário da
 * requisição atual (lib/contextoUsuario.ts).
 *
 * Ponto único de auditoria — nenhum serviço ou rota precisa logar nada.
 * O log é gravado em segundo plano para não atrasar a operação principal.
 */
import { usuarioAtual } from "./contextoUsuario";
import type { CondicaoConsulta, DataSource } from "./datasource";
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
    this.logar(
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
    this.logar(tabela, id, "atualizar", campos);
    return resultado;
  }

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    await this.interno.excluir(tabela, id);
    this.logar(tabela, id, "excluir", "");
  }

  private logar(
    tabela: NomeTabela,
    registroId: string,
    acao: "criar" | "atualizar" | "excluir",
    resumo: string,
  ): void {
    if (tabela === "historico") return; // sem recursão
    void this.interno
      .criar("historico", {
        id: crypto.randomUUID(),
        tabela,
        registro_id: registroId,
        acao,
        resumo,
        usuario: usuarioAtual(),
        criado_em: new Date().toISOString(),
      })
      .catch((e) => console.error("[historico]", e));
  }
}
