/**
 * Abstração da fonte de dados — o ponto único de troca entre memória (demo),
 * Google Sheets (banco provisório) e Firebase/Firestore (banco definitivo).
 *
 * Os serviços (services/*) só conhecem esta interface; frontend e serviços
 * não mudam quando a fonte muda — apenas a variável DATA_SOURCE.
 */
import type { MapaTabelas, NomeTabela } from "./schema";

/**
 * Condição de consulta.
 *
 * Regra geral: prefira condições sobre UM ÚNICO campo (igualdade, ou um
 * intervalo >=/<= no mesmo campo) — o Firestore resolve com o índice automático
 * de campo único, sem configurar nada.
 *
 * EXCEÇÃO deliberada (caminho quente): as consultas por **sede + data** nas
 * coleções que crescem sem limite no tempo (`rotinas_planejadas`,
 * `execucoes_realizadas`) combinam `sede_id ==` com `data`/`data_execucao`.
 * Sem isso, ver a agenda de UMA sede leria o dia das 17 (≈17× leituras). Esses
 * dois casos têm índice composto declarado em `firestore.indexes.json` — ao
 * adicionar uma nova consulta multi-campo, adicione o índice correspondente lá.
 */
export type CondicaoConsulta = {
  campo: string;
  op: "==" | ">=" | "<=";
  valor: string | number | boolean;
};

/**
 * Uma escrita dentro de um lote atômico. Ver `DataSource.gravarLote`.
 *
 * O tipo é frouxo de propósito (`NomeTabela` genérico em vez de `K` amarrado):
 * um lote mistura tabelas — é justamente isso que permite gravar o dado e o
 * registro de auditoria no MESMO commit.
 */
export type OperacaoLote =
  | { tipo: "criar"; tabela: NomeTabela; registro: MapaTabelas[NomeTabela] }
  | { tipo: "atualizar"; tabela: NomeTabela; id: string; mudancas: Partial<MapaTabelas[NomeTabela]> }
  | { tipo: "excluir"; tabela: NomeTabela; id: string };

export interface DataSource {
  listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]>;
  /** Consulta filtrada no servidor (Firestore: where). Reduz leituras. */
  consultar<K extends NomeTabela>(
    tabela: K,
    condicoes: CondicaoConsulta[],
  ): Promise<MapaTabelas[K][]>;
  obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null>;
  criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]>;
  atualizar<K extends NomeTabela>(
    tabela: K,
    id: string,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K]>;
  excluir(tabela: NomeTabela, id: string): Promise<void>;
  /**
   * Grava várias escritas como UMA operação.
   *
   * Existe porque `Promise.all` de escritas soltas deixa estado pela metade
   * quando uma falha — e não é hipótese: em 18/08 a importação da CESIU parou
   * com **86 locais criados e nenhuma tarefa**, porque um campo `undefined`
   * derrubou a gravação no meio.
   *
   * Garantia por implementação:
   *  - **Firestore**: `WriteBatch` — atômico de verdade. O limite do Firestore é
   *    de 500 escritas por lote, então lotes maiores são partidos em pedaços
   *    atômicos entre si (all-or-nothing por pedaço, não no conjunto).
   *  - **memória**: tira uma cópia antes e desfaz tudo se qualquer uma falhar.
   *  - **Sheets**: **não é atômico** — a API não oferece transação. Grava em
   *    sequência e propaga o erro; está aqui para o contrato fechar.
   */
  gravarLote(operacoes: OperacaoLote[]): Promise<void>;
}

/** Aplica as condições em memória (usado por memory e Sheets). */
export function filtrarEmMemoria<T extends Record<string, unknown>>(
  registros: T[],
  condicoes: CondicaoConsulta[],
): T[] {
  return registros.filter((r) =>
    condicoes.every((c) => {
      const v = r[c.campo] as string | number | boolean;
      if (c.op === "==") return v === c.valor;
      if (c.op === ">=") return v >= c.valor;
      return v <= c.valor;
    }),
  );
}

let instancia: DataSource | null = null;

/** Singleton do datasource, escolhido por DATA_SOURCE (memory | sheets | firebase). */
export async function getDataSource(): Promise<DataSource> {
  if (instancia) return instancia;
  const modo = process.env.DATA_SOURCE ?? "memory";
  let bruto: DataSource;
  if (modo === "firebase") {
    const { FirebaseDataSource } = await import("./firebaseClient");
    bruto = new FirebaseDataSource();
  } else if (modo === "sheets") {
    const { GoogleSheetsDataSource } = await import("./googleSheetsClient");
    bruto = new GoogleSheetsDataSource();
  } else {
    const { MemoryDataSource } = await import("./memoryStore");
    bruto = new MemoryDataSource();
  }
  // Toda escrita passa pelo log de alterações (tabela `historico`).
  const { HistoricoDataSource } = await import("./historico");
  instancia = new HistoricoDataSource(bruto);
  return instancia;
}

export function novoId(): string {
  return crypto.randomUUID();
}

export function agoraISO(): string {
  return new Date().toISOString();
}
