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
import type { CondicaoConsulta, DataSource, OperacaoLote } from "./datasource";
import { obterAppAdmin } from "./firebaseAdmin";
import { semUndefined } from "./semUndefined";
import type { MapaTabelas, NomeTabela } from "./schema";

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
  ): Promise<MapaTabelas[K][]> {
    // Condições sobre um único campo → índice automático (sem índice composto).
    let q: FirebaseFirestore.Query = this.db.collection(tabela);
    for (const c of condicoes) q = q.where(c.campo, c.op, c.valor);
    const snap = await q.get();
    return snap.docs.map((doc) => doc.data() as MapaTabelas[K]);
  }

  async obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null> {
    const doc = await this.db.collection(tabela).doc(id).get();
    return doc.exists ? (doc.data() as MapaTabelas[K]) : null;
  }

  async criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]> {
    const { id } = registro as { id: string };
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

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    await this.db.collection(tabela).doc(id).delete();
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
        const ref = this.db.collection(op.tabela).doc(op.tipo === "criar" ? (op.registro as { id: string }).id : op.id);
        if (op.tipo === "criar") lote.set(ref, semUndefined(op.registro));
        else if (op.tipo === "atualizar") lote.update(ref, semUndefined(op.mudancas));
        else lote.delete(ref);
      }
      await lote.commit();
    }
  }
}
