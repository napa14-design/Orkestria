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
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { DataSource } from "./datasource";
import type { MapaTabelas, NomeTabela } from "./schema";

function obterApp(): App {
  const existente = getApps()[0];
  if (existente) return existente;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "DATA_SOURCE=firebase exige FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no .env",
    );
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export class FirebaseDataSource implements DataSource {
  private db: Firestore;

  constructor() {
    this.db = getFirestore(obterApp());
  }

  async listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]> {
    const snap = await this.db.collection(tabela).get();
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
