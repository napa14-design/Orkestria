/**
 * Confere se todo alvo citado na trilha do tutorial existe nas telas.
 *
 * Erro de alvo é a forma clássica de um tutorial apodrecer: alguém renomeia um
 * campo, o roteiro continua citando o nome antigo, e quem descobre é o usuário.
 * O holofote avisa em tempo de execução; este script antecipa para antes do
 * commit.
 *
 *     node scripts/conferir-trilha.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (!/node_modules|\.next|\.git/.test(p)) arquivos(p, acc);
    } else if (/\.tsx?$/.test(nome)) acc.push(p);
  }
  return acc;
}

const fontes = [...arquivos(path.join(RAIZ, "app")), ...arquivos(path.join(RAIZ, "components"))];
const conteudo = new Map(fontes.map((p) => [p, readFileSync(p, "utf8")]));

// Marcadores fixos escritos à mão no JSX.
const marcadores = new Set();
for (const texto of conteudo.values()) {
  for (const m of texto.matchAll(/data-tour="([^"]+)"/g)) marcadores.add(m[1]);
}

// A trilha é lida como texto: o script roda fora do bundler, sem alias "@/".
const trilha = readFileSync(path.join(RAIZ, "lib/tutorial/trilha.ts"), "utf8");
const etapas = [...trilha.matchAll(/id:\s*"([^"]+)",\s*\n\s*nome:[\s\S]*?rota:\s*"([^"]+)",([\s\S]*?)\n\s{2}\},/g)];

let problemas = 0;
for (const [, id, rota, corpo] of etapas) {
  const pagina = path.join(RAIZ, "app", "(app)", rota.slice(1), "page.tsx");
  const fonteDaPagina = conteudo.get(pagina) ?? "";
  for (const m of corpo.matchAll(/alvo:\s*"([^"]+)"/g)) {
    const alvo = m[1];
    if (alvo.startsWith("campo-")) {
      // Gerado pelo CrudManager a partir da chave do campo: confere se a chave
      // existe no formulário daquela tela.
      const chave = alvo.slice("campo-".length);
      if (!fonteDaPagina.includes(`key: "${chave}"`)) {
        console.error(`✗ etapa "${id}" (${rota}): campo "${chave}" não existe no formulário desta tela.`);
        problemas++;
      }
    } else if (!marcadores.has(alvo)) {
      console.error(`✗ etapa "${id}" (${rota}): não existe nenhum data-tour="${alvo}" no código.`);
      problemas++;
    }
  }
}

const total = etapas.length;
if (problemas) {
  console.error(`\n${problemas} alvo(s) quebrado(s) em ${total} etapas.`);
  process.exit(1);
}
console.log(`✓ ${total} etapas conferidas — todos os alvos existem.`);
