/**
 * Migração de perfis (19/10/2026): todo usuário com perfil "supervisor" — o
 * antigo, que monta rotas e cadastros — passa a "coordenador". O nome
 * "supervisor" fica para o perfil novo, de chão.
 *
 * ⚠️ RODAR SÓ DEPOIS DO DEPLOY do código que conhece "coordenador". Antes disso,
 * a versão no ar trataria "coordenador" como perfil desconhecido — e a regra
 * antiga (`perfil !== "supervisor"` ⇒ todas as sedes) daria leitura de TODAS.
 * Pelo mesmo motivo, VOLTAR O DEPLOY EXIGE `--desfazer` ANTES: no código
 * antigo, os coordenadores leriam todas as sedes, e cada supervisor de chão
 * criado depois do deploy viraria quem monta rotas.
 *
 * Uso:
 *   node scripts/migrar-perfis-coordenador.mjs           # só lista
 *   node scripts/migrar-perfis-coordenador.mjs --gravar  # backup, grava e relê
 *   node scripts/migrar-perfis-coordenador.mjs --desfazer <backup.json> [--gravar]
 *     # devolve "supervisor" aos ids do backup e DESATIVA todo supervisor que não
 *     # está nele (os de chão, que o código antigo não sabe restringir). Desativar
 *     # não derruba sessão aberta (cookie de 12h): se havia supervisor de chão,
 *     # troque também o AUTH_SECRET na Vercel — todo mundo entra de novo.
 *
 * Quem migra precisa entrar de novo: o perfil vai assinado no cookie da sessão.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("✕ FIRESTORE_EMULATOR_HOST ligado — este script é para o banco real.");
  process.exit(1);
}

// ── lê o .env na mão (sem dependência de dotenv) ──────────────────────
const env = {};
for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !privateKey) {
  console.error("✕ FIREBASE_* ausentes no .env");
  process.exit(1);
}
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
});
const db = getFirestore();
const lerUsuarios = async () =>
  (await db.collection("usuarios").get()).docs.map((d) => ({ id: d.id, ...d.data() }));

const gravar = process.argv.includes("--gravar");
const CONHECIDOS = new Set(["administrador", "coordenador", "supervisor", "visualizador"]);

const usuarios = await lerUsuarios();
// Perfil fora dos conhecidos não se migra no escuro: alguém precisa olhar antes.
const estranhos = usuarios.filter((u) => !CONHECIDOS.has(u.perfil));
if (estranhos.length) {
  console.error(
    `✕ perfis desconhecidos no banco — nada feito: ${estranhos.map((u) => `${u.id}="${u.perfil}"`).join(", ")}`,
  );
  process.exit(1);
}

// ── desfazer (antes de voltar o deploy) ───────────────────────────────
const iDesfazer = process.argv.indexOf("--desfazer");
if (iDesfazer >= 0) {
  const arquivo = process.argv[iDesfazer + 1];
  if (!arquivo || arquivo.startsWith("--")) {
    console.error("✕ informe o backup: --desfazer <backup-perfis-….json>");
    process.exit(1);
  }
  const doBackup = new Set(JSON.parse(readFileSync(arquivo, "utf8")).map((b) => b.id));
  // Backup errado desativaria gente de verdade: todo id dele precisa existir e
  // ser coordenador (ou supervisor, se o desfazer já rodou uma vez).
  const invalidos = [...doBackup].filter((id) => {
    const u = usuarios.find((x) => x.id === id);
    return !u || (u.perfil !== "coordenador" && u.perfil !== "supervisor");
  });
  if (!doBackup.size || invalidos.length) {
    console.error(`✕ backup não confere com o banco — nada feito (${doBackup.size ? `ids sem par: ${invalidos.join(", ")}` : "vazio"}).`);
    process.exit(1);
  }
  // No código antigo, "supervisor" é quem monta rotas e qualquer outro perfil
  // não-admin lê todas as sedes. Então TODO coordenador volta a "supervisor"
  // (inclusive os criados depois do deploy), e todo supervisor de chão — o que
  // não veio do backup — é desativado. O backup é o que deixa rodar de novo sem
  // desativar quem acabou de voltar.
  const voltam = usuarios.filter((u) => u.perfil === "coordenador");
  const desativar = usuarios.filter((u) => u.perfil === "supervisor" && !doBackup.has(u.id) && u.ativo !== false);
  console.log(`coordenador → supervisor: ${voltam.length}`);
  for (const u of voltam) console.log(`  ${u.nome} · principal=${u.sede_id}${doBackup.has(u.id) ? "" : " · (criado depois da migração)"}`);
  console.log(`supervisores de chão a DESATIVAR: ${desativar.length}`);
  for (const u of desativar) console.log(`  ${u.nome} · principal=${u.sede_id}`);
  if (!gravar) {
    console.log("\n(só listagem — rode com --gravar e, só depois, volte o deploy)");
    process.exit(0);
  }
  const agora = new Date().toISOString();
  const lote = db.batch();
  for (const u of voltam) lote.update(db.doc(`usuarios/${u.id}`), { perfil: "supervisor", atualizado_em: agora });
  for (const u of desativar) lote.update(db.doc(`usuarios/${u.id}`), { ativo: false, atualizado_em: agora });
  await lote.commit();
  const depois = await lerUsuarios();
  const sobraCoord = depois.filter((u) => u.perfil === "coordenador").length;
  const sobraChao = depois.filter((u) => u.perfil === "supervisor" && !doBackup.has(u.id) && u.ativo !== false).length;
  console.log(`desfeito. coordenadores restantes: ${sobraCoord} · supervisores de chão ativos: ${sobraChao}`);
  process.exit(sobraCoord === 0 && sobraChao === 0 ? 0 : 1);
}

const contagem = usuarios.reduce((a, u) => ((a[u.perfil] = (a[u.perfil] || 0) + 1), a), {});
const alvo = usuarios.filter((u) => u.perfil === "supervisor");
console.log(`usuários: ${usuarios.length} · perfis: ${JSON.stringify(contagem)}`);
console.log(`a migrar supervisor → coordenador: ${alvo.length}`);
for (const u of alvo) console.log(`  ${u.nome} · principal=${u.sede_id} · ativo=${u.ativo}`);
if (!gravar) {
  console.log("\n(só listagem — rode com --gravar DEPOIS do deploy)");
  process.exit(0);
}
if (!alvo.length) {
  console.log("Nada a migrar.");
  process.exit(0);
}

const agora = new Date().toISOString();
// Backup fora do repositório (o repo é público).
const arquivoBackup = join(homedir(), "Downloads", `backup-perfis-${agora.replace(/[:.]/g, "-")}.json`);
writeFileSync(arquivoBackup, JSON.stringify(alvo.map((u) => ({ id: u.id, perfil: u.perfil })), null, 1));
console.log(`backup: ${arquivoBackup}`);

const lote = db.batch();
for (const u of alvo) lote.update(db.doc(`usuarios/${u.id}`), { perfil: "coordenador", atualizado_em: agora });
await lote.commit();

const depois = await lerUsuarios();
const conferidos = alvo.filter((u) => depois.find((d) => d.id === u.id)?.perfil === "coordenador").length;
const desconhecidos = depois.filter((u) => !CONHECIDOS.has(u.perfil)).length;
console.log(
  `gravado. conferidos: ${conferidos}/${alvo.length} · coordenadores no banco: ${depois.filter((u) => u.perfil === "coordenador").length} · desconhecidos: ${desconhecidos}`,
);
process.exit(conferidos === alvo.length && desconhecidos === 0 ? 0 : 1);
