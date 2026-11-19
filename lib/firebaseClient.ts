/**
 * Implementação do DataSource sobre o Firebase Firestore (banco definitivo).
 *
 * Cada tabela vira uma coleção; cada registro é um documento cujo ID é o
 * próprio campo `id`. Usa o firebase-admin (server-side) com service account —
 * o frontend continua sem acesso direto ao banco, tudo passa pelos serviços.
 *
 * Variáveis de ambiente necessárias (Console Firebase → Configurações do
 * projeto → Contas de serviço → Gerar nova chave privada):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { CondicaoConsulta, DataSource, OperacaoLote, OpcoesConsulta } from "./datasource";
import { obterAppAdmin } from "./firebaseAdmin";
import { exigirId, semUndefined } from "./semUndefined";
import { TABELAS_SO_DE_INCLUSAO, type MapaTabelas, type NomeTabela } from "./schema";

export class FirebaseDataSource implements DataSource {
  private db: Firestore;

  constructor() {
    this.db = getFirestore(obterAppAdmin());
  }

  async listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]> {
    const snap = await this.db.collection(tabela).get();
    return snap.docs.map((doc) => doc.data() as MapaTabelas[K]);
  }

  async consultar<K extends NomeTabela>(
    tabela: K,
    condicoes: CondicaoConsulta[],
    opcoes?: OpcoesConsulta,
  ): Promise<MapaTabelas[K][]> {
    // Condições sobre um único campo → índice automático (sem índice composto).
    let q: FirebaseFirestore.Query = this.db.collection(tabela);
    for (const c of condicoes) q = q.where(c.campo, c.op, c.valor);
    if (opcoes?.ordenarPor) q = q.orderBy(opcoes.ordenarPor, opcoes.decrescente ? "desc" : "asc");
    if (opcoes?.limite !== undefined) q = q.limit(opcoes.limite);
    const snap = await q.get();
    return snap.docs.map((doc) => doc.data() as MapaTabelas[K]);
  }

  async contar(tabela: NomeTabela, condicoes: CondicaoConsulta[]): Promise<number> {
    let q: FirebaseFirestore.Query = this.db.collection(tabela);
    for (const c of condicoes) q = q.where(c.campo, c.op, c.valor);
    return (await q.count().get()).data().count;
  }

  async obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null> {
    const doc = await this.db.collection(tabela).doc(id).get();
    return doc.exists ? (doc.data() as MapaTabelas[K]) : null;
  }

  async criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]> {
    const id = exigirId(tabela, registro);
    await this.db.collection(tabela).doc(id).set(semUndefined(registro));
    return registro;
  }

  async atualizar<K extends NomeTabela>(
    tabela: K,
    id: string,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K]> {
    const ref = this.db.collection(tabela).doc(id);
    // Transação garante leitura+escrita consistentes (o que o Sheets não dava).
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new Error(`Registro ${id} não encontrado em ${tabela}.`);
      const atualizado = { ...(doc.data() as MapaTabelas[K]), ...semUndefined(mudancas) };
      tx.set(ref, atualizado);
      return atualizado;
    });
  }

  async atualizarSe<K extends NomeTabela>(
    tabela: K,
    id: string,
    condicao: (atual: MapaTabelas[K]) => boolean,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K] | null> {
    const ref = this.db.collection(tabela).doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new Error(`Registro ${id} não encontrado em ${tabela}.`);
      if (!condicao(doc.data() as MapaTabelas[K])) return null;
      const atualizado = { ...(doc.data() as MapaTabelas[K]), ...semUndefined(mudancas) };
      tx.set(ref, atualizado);
      return atualizado;
    });
  }

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    await this.db.collection(tabela).doc(id).delete();
  }

  async excluirSe<K extends NomeTabela>(
    tabela: K,
    ids: string[],
    condicao: (atual: MapaTabelas[K]) => boolean,
  ): Promise<string[]> {
    const excluidos: string[] = [];
    for (let i = 0; i < ids.length; i += 400) {
      const refs = ids.slice(i, i + 400).map((id) => this.db.collection(tabela).doc(id));
      if (!refs.length) continue;
      excluidos.push(
        ...(await this.db.runTransaction(async (tx) => {
          const docs = await tx.getAll(...refs);
          const sai = docs.filter((d) => d.exists && condicao(d.data() as MapaTabelas[K]));
          for (const d of sai) tx.delete(d.ref);
          return sai.map((d) => d.id);
        })),
      );
    }
    return excluidos;
  }

  /**
   * `WriteBatch`: o Firestore aplica tudo ou nada. Dois detalhes que importam:
   *
   * 1. `batch.set()`/`update()` **validam o dado na hora de montar**, antes de
   *    qualquer commit. É por isso que este caminho teria evitado a importação
   *    pela metade da CESIU: o `undefined` estouraria com ZERO documentos
   *    gravados, em vez de 86 locais órfãos.
   * 2. O limite é de **500 escritas por lote**. Acima disso partimos em pedaços,
   *    e a atomicidade passa a valer por pedaço — nunca fica documento pela
   *    metade, mas pode faltar um pedaço inteiro. Quem chama recebe o erro e a
   *    operação é idempotente (id determinístico), então repetir completa.
   */
  async gravarLote(operacoes: OperacaoLote[]): Promise<void> {
    const LIMITE = 500;
    for (let i = 0; i < operacoes.length; i += LIMITE) {
      const lote = this.db.batch();
      for (const op of operacoes.slice(i, i + LIMITE)) {
        const ref = this.db.collection(op.tabela).doc(op.tipo === "criar" ? exigirId(op.tabela, op.registro) : op.id);
        // Tabela só de inclusão: `create` falha se o documento já existe — e o lote
        // inteiro com ele. Fecha a corrida de dois cliques no mesmo desligamento.
        if (op.tipo === "criar" && (op.exigirNovo || TABELAS_SO_DE_INCLUSAO.has(op.tabela))) lote.create(ref, semUndefined(op.registro));
        else if (op.tipo === "criar") lote.set(ref, semUndefined(op.registro));
        else if (op.tipo === "atualizar") lote.update(ref, semUndefined(op.mudancas));
        else lote.delete(ref);
      }
      await lote.commit();
    }
  }
}
