/**
 * App do Firebase Admin (server-side) compartilhado — usado pelo DataSource do
 * Firestore e pela verificação de token do login com Google. Inicializa uma
 * única vez (getApps) com a service account do .env.
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

export function obterAppAdmin(): App {
  const existente = getApps()[0];
  if (existente) return existente;

  // Emulador: credencial não existe e o SDK não usa nenhuma — quando
  // `FIRESTORE_EMULATOR_HOST` está definida, TODO o tráfego do Firestore vai
  // para o emulador, independentemente do que se passe aqui. Exigir service
  // account nesse caso só impediria o contrato de DataSource de rodar contra o
  // Firestore de verdade, que é o único jeito de provar que ele concorda com o
  // banco de memória.
  const emulador = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulador) {
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "orkestria-emulador" });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin exige FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no .env",
    );
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
