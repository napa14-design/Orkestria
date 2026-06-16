/**
 * App do Firebase Admin (server-side) compartilhado — usado pelo DataSource do
 * Firestore e pela verificação de token do login com Google. Inicializa uma
 * única vez (getApps) com a service account do .env.
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

export function obterAppAdmin(): App {
  const existente = getApps()[0];
  if (existente) return existente;

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

export function authAdmin(): Auth {
  return getAuth(obterAppAdmin());
}
