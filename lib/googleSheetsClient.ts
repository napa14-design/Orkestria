/**
 * Implementação do DataSource sobre a Google Sheets API v4.
 *
 * Cada aba da planilha é uma "tabela": linha 1 = cabeçalho (nomes das
 * colunas do SCHEMA), demais linhas = registros. Autenticação por service
 * account (a planilha deve ser compartilhada com o e-mail da conta).
 *
 * O frontend NUNCA chama este módulo — apenas as rotas de API via services.
 */
import { google, type sheets_v4 } from "googleapis";
import { type CondicaoConsulta, type DataSource, filtrarEmMemoria, type OperacaoLote } from "./datasource";
import {
  cabecalho,
  linhaParaObjeto,
  objetoParaLinha,
  type MapaTabelas,
  type NomeTabela,
  SCHEMA,
} from "./schema";

const CACHE_TTL_MS = 10_000; // leitura repetida da mesma aba em até 10s usa cache

interface CacheLeitura {
  expiraEm: number;
  registros: unknown[];
}

export class GoogleSheetsDataSource implements DataSource {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  private cache = new Map<NomeTabela, CacheLeitura>();
  private sheetIdPorTitulo: Map<string, number> | null = null;

  constructor() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const chave = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "";
    if (!email || !chave || !this.spreadsheetId) {
      throw new Error(
        "DATA_SOURCE=sheets exige GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY e GOOGLE_SHEETS_SPREADSHEET_ID no .env",
      );
    }
    const auth = new google.auth.JWT({
      email,
      key: chave,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  // ── Leitura ────────────────────────────────────────────────────────────

  async listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]> {
    const emCache = this.cache.get(tabela);
    if (emCache && emCache.expiraEm > Date.now()) {
      return emCache.registros as MapaTabelas[K][];
    }
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tabela}!A1:ZZ`,
    });
    const valores = (res.data.values ?? []) as string[][];
    if (valores.length === 0) return [];
    const [header, ...linhas] = valores;
    const registros = linhas
      .filter((l) => (l[0] ?? "") !== "") // ignora linhas sem id
      .map((l) => linhaParaObjeto(tabela, header, l));
    this.cache.set(tabela, { expiraEm: Date.now() + CACHE_TTL_MS, registros });
    return registros;
  }

  async consultar<K extends NomeTabela>(
    tabela: K,
    condicoes: CondicaoConsulta[],
  ): Promise<MapaTabelas[K][]> {
    // Sheets não tem consulta nativa: lista (com cache) e filtra em memória.
    const todos = (await this.listar(tabela)) as unknown as Array<Record<string, unknown>>;
    return filtrarEmMemoria(todos, condicoes) as unknown as MapaTabelas[K][];
  }

  async obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null> {
    const todos = await this.listar(tabela);
    return todos.find((r) => (r as { id: string }).id === id) ?? null;
  }

  // ── Escrita ────────────────────────────────────────────────────────────

  async criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${tabela}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [objetoParaLinha(tabela, registro)] },
    });
    this.cache.delete(tabela);
    return registro;
  }

  async atualizar<K extends NomeTabela>(
    tabela: K,
    id: string,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K]> {
    const indice = await this.indiceDaLinha(tabela, id);
    if (indice === -1) throw new Error(`Registro ${id} não encontrado em ${tabela}.`);
    const atual = await this.obter(tabela, id);
    const atualizado = { ...atual, ...mudancas } as MapaTabelas[K];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      // +2: linha 1 é o cabeçalho e o índice é 0-based
      range: `${tabela}!A${indice + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [objetoParaLinha(tabela, atualizado)] },
    });
    this.cache.delete(tabela);
    return atualizado;
  }

  /**
   * **Não é atômico** — a API do Sheets não oferece transação. Grava em sequência
   * e deixa o erro subir; um lote interrompido fica pela metade, e é impossível
   * fazer melhor por aqui. Está implementado para o contrato fechar e para que a
   * limitação fique escrita em vez de virar surpresa. O Sheets é a fonte
   * provisória: em produção o `DATA_SOURCE` é `firebase`.
   */
  async gravarLote(operacoes: OperacaoLote[]): Promise<void> {
    for (const op of operacoes) {
      if (op.tipo === "criar") await this.criar(op.tabela, op.registro);
      else if (op.tipo === "atualizar") await this.atualizar(op.tabela, op.id, op.mudancas);
      else await this.excluir(op.tabela, op.id);
    }
  }

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    const indice = await this.indiceDaLinha(tabela, id);
    if (indice === -1) return;
    const sheetId = await this.obterSheetId(tabela);
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: indice + 1, // 0-based incluindo cabeçalho
                endIndex: indice + 2,
              },
            },
          },
        ],
      },
    });
    this.cache.delete(tabela);
  }

  /** Cria as abas que faltam e escreve os cabeçalhos (usado pelo /api/setup). */
  async garantirEstrutura(): Promise<string[]> {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const existentes = new Set(
      (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
    );
    const criadas: string[] = [];
    const tabelas = Object.keys(SCHEMA) as NomeTabela[];

    const faltantes = tabelas.filter((t) => !existentes.has(t));
    if (faltantes.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: faltantes.map((titulo) => ({ addSheet: { properties: { title: titulo } } })),
        },
      });
      criadas.push(...faltantes);
    }

    for (const tabela of tabelas) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${tabela}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [cabecalho(tabela)] },
      });
    }
    this.sheetIdPorTitulo = null;
    this.cache.clear();
    return criadas;
  }

  // ── Auxiliares ─────────────────────────────────────────────────────────

  /** Índice 0-based do registro entre as linhas de dados (sem o cabeçalho). */
  private async indiceDaLinha(tabela: NomeTabela, id: string): Promise<number> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tabela}!A2:A`,
    });
    const ids = (res.data.values ?? []).map((l) => l[0] ?? "");
    return ids.findIndex((v) => v === id);
  }

  private async obterSheetId(titulo: string): Promise<number> {
    if (!this.sheetIdPorTitulo) {
      const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      this.sheetIdPorTitulo = new Map(
        (meta.data.sheets ?? []).map((s) => [
          s.properties?.title ?? "",
          s.properties?.sheetId ?? 0,
        ]),
      );
    }
    const sheetId = this.sheetIdPorTitulo.get(titulo);
    if (sheetId === undefined) throw new Error(`Aba "${titulo}" não encontrada na planilha.`);
    return sheetId;
  }
}
