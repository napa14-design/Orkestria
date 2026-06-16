/**
 * App do Firebase Admin (server-side) compartilhado — usado pelo DataSource do
 * Firestore e pela verificação de token do login com Google. Inicializa uma
 * única vez (getApps) com a service account do .env.
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

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

/**
 * Auth do Admin — import dinâmico de propósito: só quem verifica token (login
 * Google) carrega `firebase-admin/auth` e suas deps (jwks-rsa/jose). O caminho
 * do Firestore/login por senha não toca nessa cadeia.
 */
export async function authAdmin() {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(obterAppAdmin());
}
