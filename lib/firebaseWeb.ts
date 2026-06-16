/**
 * Inicialização do Firebase no CLIENTE (somente para autenticação com Google).
 * Estes valores são públicos por natureza — o SDK web os envia ao navegador; a
 * segurança vem das regras de Auth e dos domínios autorizados no console, não
 * do segredo da apiKey. O acesso ao banco continua só pelo servidor (Admin SDK).
 */
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyASqqoNUwHMS5bKS8hfjNUJD5HeRi0ryQA",
  authDomain: "ociosidade-88ce4.firebaseapp.com",
  projectId: "ociosidade-88ce4",
  storageBucket: "ociosidade-88ce4.firebasestorage.app",
  messagingSenderId: "1097672974732",
  appId: "1:1097672974732:web:15153a94ef5f772597f6a9",
};

function appWeb() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/** Abre o popup do Google e devolve o ID token para o servidor verificar. */
export async function loginGoogleObterToken(): Promise<string> {
  const auth = getAuth(appWeb());
  auth.useDeviceLanguage();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user.getIdToken();
}
