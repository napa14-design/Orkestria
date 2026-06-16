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
import type { CondicaoConsulta, DataSource } from "./datasource";
import { obterAppAdmin } from "./firebaseAdmin";
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
    await this.db.collection(tabela).doc(id).set(registro);
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
      const atualizado = { ...(doc.data() as MapaTabelas[K]), ...mudancas };
      tx.set(ref, atualizado);
      return atualizado;
    });
  }

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    await this.db.collection(tabela).doc(id).delete();
  }
}
