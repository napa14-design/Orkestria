/**
 * Garante que o banco Firestore "(default)" existe no projeto Firebase.
 * Lê as credenciais do .env. Se o banco não existir, cria em
 * southamerica-east1 (São Paulo) no modo nativo e aguarda ficar pronto.
 *
 * Uso: node scripts/firestore-setup.mjs
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

// ── lê o .env na mão (sem dependência de dotenv) ──────────────────────
const env = {};
for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("✕ FIREBASE_* ausentes no .env");
  process.exit(1);
}

const credentials = { client_email: clientEmail, private_key: privateKey };

async function tokenAcesso() {
  const auth = new GoogleAuth({
    credentials,
    projectId,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const cliente = await auth.getClient();
  const { token } = await cliente.getAccessToken();
  return token;
}

/** Ativa a API do Firestore no projeto (idempotente). */
async function ativarApiFirestore() {
  const token = await tokenAcesso();
  const res = await fetch(
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/firestore.googleapis.com:enable`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.ok) {
    console.log("✓ Cloud Firestore API ativada.");
    // propagação leva alguns segundos
    await new Promise((r) => setTimeout(r, 15000));
    return true;
  }
  const corpo = await res.json().catch(() => ({}));
  console.error(
    `✕ Não consegui ativar a API (HTTP ${res.status}): ${corpo?.error?.message ?? ""}`,
  );
  console.error(
    `   Ative manualmente (1 clique): https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=${projectId}`,
  );
  return false;
}

async function bancoExiste() {
  try {
    const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, `t${Date.now()}`);
    await getFirestore(app).listCollections();
    return true;
  } catch (e) {
    if (e.code === 5 || /NOT_FOUND|does not exist/i.test(String(e.message))) return false;
    // API desativada → tenta ativar e repete uma vez
    if (e.code === 7 && /SERVICE_DISABLED|has not been used/i.test(String(e.details ?? e.message))) {
      console.log("API do Firestore desativada — tentando ativar…");
      if (!(await ativarApiFirestore())) process.exit(1);
      return bancoExiste();
    }
    throw e;
  }
}

async function criarBanco() {
  const token = await tokenAcesso();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "FIRESTORE_NATIVE", locationId: "southamerica-east1" }),
    },
  );
  const corpo = await res.json();
  if (!res.ok) {
    console.error("✕ Falha ao criar o banco:", JSON.stringify(corpo, null, 2));
    process.exit(1);
  }
  console.log("⏳ Banco solicitado, aguardando ficar pronto…");
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (await bancoExiste()) return;
  }
  console.error("✕ Tempo esgotado aguardando o banco.");
  process.exit(1);
}

if (await bancoExiste()) {
  console.log(`✓ Firestore "(default)" já existe no projeto ${projectId}.`);
} else {
  console.log(`Banco não existe em ${projectId} — criando em southamerica-east1…`);
  await criarBanco();
  console.log("✓ Firestore criado e pronto.");
}
