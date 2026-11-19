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
 * Ordenar e limitar NO BANCO — no Firestore, cada documento devolvido é uma
 * leitura cobrada; ler 6 mil para mostrar 500 custava 6 mil (o Histórico,
 * levantamento de 20/10/2026). Ordene pelo MESMO campo das condições de
 * intervalo: assim o índice automático de campo único serve, sem índice composto.
 */
export type OpcoesConsulta = {
  ordenarPor?: string;
  decrescente?: boolean;
  limite?: number;
};

/**
 * Ordena e corta em memória (memory e Sheets) com a mesma semântica do
 * Firestore — inclusive esta: o `orderBy` dele deixa de fora o documento que
 * não tem o campo.
 */
export function ordenarELimitar<T extends Record<string, unknown>>(registros: T[], opcoes?: OpcoesConsulta): T[] {
  let r = registros;
  if (opcoes?.ordenarPor) {
    const campo = opcoes.ordenarPor;
    const sinal = opcoes.decrescente ? -1 : 1;
    r = r.filter((x) => x[campo] !== undefined && x[campo] !== null).sort((a, b) => {
      const va = a[campo] as string | number;
      const vb = b[campo] as string | number;
      return va < vb ? -sinal : va > vb ? sinal : 0;
    });
  }
  return opcoes?.limite !== undefined ? r.slice(0, opcoes.limite) : r;
}

/**
 * Uma escrita dentro de um lote atômico. Ver `DataSource.gravarLote`.
 *
 * O tipo é frouxo de propósito (`NomeTabela` genérico em vez de `K` amarrado):
 * um lote mistura tabelas — é justamente isso que permite gravar o dado e o
 * registro de auditoria no MESMO commit.
 */
export type OperacaoLote =
  /**
   * `exigirNovo`: o lote inteiro falha se o id já existe (`create` do Firestore, não `set`).
   * Para registro de id determinístico que dois pedidos simultâneos podem tentar criar.
   * Nas tabelas só de inclusão vale sempre.
   */
  | { tipo: "criar"; tabela: NomeTabela; registro: MapaTabelas[NomeTabela]; exigirNovo?: boolean }
  | { tipo: "atualizar"; tabela: NomeTabela; id: string; mudancas: Partial<MapaTabelas[NomeTabela]> }
  /**
   * `seAinda`: o lote inteiro é recusado com `LoteMudou` se o registro não existe mais ou a
   * condição não vale para o que está gravado ANTES do lote. É o `excluirSe` dentro de um
   * lote: o desligamento lia "só planejado" e excluía, junto com a ficha, o bloco que alguém
   * confirmara no meio, deixando a execução órfã (auditoria, 19/11/2026). Recusa em vez de
   * pular para o histórico do decorator, que vai no mesmo lote, não registrar o que não saiu.
   */
  | { tipo: "excluir"; tabela: NomeTabela; id: string; seAinda?: (atual: MapaTabelas[NomeTabela]) => boolean };

/** Um `excluir` com `seAinda` achou o registro mudado ou já excluído: NADA do lote foi gravado. */
export class LoteMudou extends Error {
  constructor(
    readonly tabela: string,
    readonly id: string,
  ) {
    super(`Registro ${id} mudou em ${tabela} enquanto o lote era montado; nada foi gravado.`);
    this.name = "LoteMudou";
  }
}

/**
 * Id repetido numa criação com `exigirNovo`: a conferência do decorator e a da memória
 * ("já existe em"), ou o ALREADY_EXISTS (código 6) do Firestore.
 */
export function ehIdRepetido(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /já existe em/.test(msg) || /ALREADY_EXISTS/.test(msg) || (e as { code?: unknown } | null)?.code === 6;
}

export interface DataSource {
  listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]>;
  /** Consulta filtrada no servidor (Firestore: where). Reduz leituras. */
  consultar<K extends NomeTabela>(
    tabela: K,
    condicoes: CondicaoConsulta[],
    opcoes?: OpcoesConsulta,
  ): Promise<MapaTabelas[K][]>;
  /**
   * Quantos registros casam — sem ler os registros. No Firestore é a agregação
   * `count()`: 1 leitura por até mil entradas, em vez de 1 por documento. Com só
   * igualdades nas condições, o Firestore junta os índices de campo único e não
   * pede índice composto (conferido na produção em 20/10/2026).
   */
  contar(tabela: NomeTabela, condicoes: CondicaoConsulta[]): Promise<number>;
  obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null>;
  criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]>;
  atualizar<K extends NomeTabela>(
    tabela: K,
    id: string,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K]>;
  /**
   * Atualiza só se `condicao` ainda valer para o que está gravado, lendo e escrevendo
   * como uma operação; se não valer, devolve `null` sem gravar. Existe para o que não
   * pode ser escrito por cima de uma mudança feita no meio do caminho: entre conferir uma
   * conta e gravar o código dela, um colega podia promovê-la (revisão de segurança, 06/11/2026).
   */
  atualizarSe<K extends NomeTabela>(
    tabela: K,
    id: string,
    condicao: (atual: MapaTabelas[K]) => boolean,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K] | null>;
  excluir(tabela: NomeTabela, id: string): Promise<void>;
  /**
   * Exclui, dos `ids`, só os que existem e em que `condicao` ainda vale para o que está
   * gravado, lendo e excluindo como uma operação; devolve os ids excluídos. Existe para
   * apagar com base numa leitura anterior sem passar por cima do que mudou no meio: o
   * "Limpar o dia" lia "sem realizado" e excluía o bloco que alguém acabara de confirmar,
   * deixando a execução órfã (revisão externa, Consulta 7, 18/11/2026).
   * Firestore: transação por pedaço de até 400 ids. Sheets: não é atômico.
   */
  excluirSe<K extends NomeTabela>(
    tabela: K,
    ids: string[],
    condicao: (atual: MapaTabelas[K]) => boolean,
  ): Promise<string[]>;
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
   *
   * Com `seAinda` num `excluir`: Firestore faz o pedaço numa transação (lê os condicionados,
   * confere, grava); memória confere antes de gravar; Sheets confere e grava sem trava.
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
  // Variável esquecida não pode virar banco em memória calado: as escritas
  // sumiriam sem erro e o Chromos leria zeros (auditoria, 14/10/2026). Na Vercel
  // só valem os bancos de verdade; fora dela, `memory` explícito continua (é
  // como a tela é testada em `next start` local).
  const modo = process.env.DATA_SOURCE ?? (process.env.NODE_ENV === "production" ? "" : "memory");
  if (process.env.VERCEL && modo !== "firebase" && modo !== "sheets")
    throw new Error(`DATA_SOURCE="${modo}" não é permitido na Vercel — use "firebase" (ou "sheets").`);
  if (!modo) throw new Error("DATA_SOURCE não definido. Use \"firebase\", \"sheets\" ou, para testes locais, \"memory\".");
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
