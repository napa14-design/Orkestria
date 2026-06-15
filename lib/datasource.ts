/**
 * Abstração da fonte de dados — o ponto único de troca entre memória (demo),
 * Google Sheets (banco provisório) e Firebase/Firestore (banco definitivo).
 *
 * Os serviços (services/*) só conhecem esta interface; frontend e serviços
 * não mudam quando a fonte muda — apenas a variável DATA_SOURCE.
 */
import type { MapaTabelas, NomeTabela } from "./schema";

/**
 * Condição de consulta. Para o Firestore, use SEMPRE condições sobre UM ÚNICO
 * campo (igualdade, ou um intervalo >=/<= no mesmo campo) — assim só o índice
 * automático de campo único é usado, sem precisar criar índices compostos.
 * Filtros secundários (ex.: sede além da data) devem ser feitos em memória
 * sobre o resultado já reduzido.
 */
export type CondicaoConsulta = {
  campo: string;
  op: "==" | ">=" | "<=";
  valor: string | number | boolean;
};

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
