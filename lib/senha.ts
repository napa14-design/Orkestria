/**
 * Senhas e códigos de primeiro acesso.
 *
 * Tudo é guardado como hash scrypt ("saltHex:hashHex") — nem a senha nem o
 * código existem em texto puro no banco. Não há nenhum segredo compartilhado
 * entre usuários: cada pessoa tem o seu código, usado uma única vez.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { MIN_SENHA } from "./sessionConstants";

/** Dias de validade do código de primeiro acesso. */
export const DIAS_VALIDADE_CODIGO = 14;

/**
 * Alfabeto sem os caracteres que se confundem ao ditar ou copiar à mão:
 * sem O/0, sem I/1/L, sem U (vira V na escrita apressada).
 */
export const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/**
 * Gera o código de primeiro acesso no formato `K7M-4QP-92X`.
 *
 * Os grupos de três existem para a pessoa conseguir ditar por telefone. São 9
 * caracteres de 30 possíveis (~44 bits) — muito para adivinhar, curto para
 * transcrever.
 */
export function gerarCodigoAcesso(): string {
  const n = ALFABETO_CODIGO.length;
  // 256 não é múltiplo de 30: usar `byte % 30` direto faria os 16 primeiros
  // caracteres saírem ~12% mais que os outros. Descartar os bytes acima do
  // último múltiplo inteiro deixa o sorteio uniforme.
  const limite = Math.floor(256 / n) * n;
  const letras: string[] = [];
  while (letras.length < 9) {
    for (const b of randomBytes(9)) {
      if (b >= limite) continue;
      letras.push(ALFABETO_CODIGO[b % n]);
      if (letras.length === 9) break;
    }
  }
  return `${letras.slice(0, 3).join("")}-${letras.slice(3, 6).join("")}-${letras.slice(6, 9).join("")}`;
}

/**
 * Normaliza o código digitado: caixa alta e sem separadores.
 *
 * Sem isto, "k7m 4qp92x" seria recusado por um motivo que a pessoa não tem como
 * adivinhar — e ela culparia o sistema, com razão.
 */
export function normalizarCodigo(codigo: string): string {
  return (codigo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Recusa senha pessoal fraca ou inútil. Devolve a mensagem do problema, ou
 * `null` quando está boa.
 *
 * `proibida` é o código de primeiro acesso: repetir ele daria a sensação de ter
 * criado uma senha sem ter criado nada, e o código já passou por outras mãos.
 */
export function problemaNaSenha(nova: string, proibida?: string): string | null {
  const senha = nova ?? "";
  if (senha.length < MIN_SENHA)
    return `A senha precisa ter ao menos ${MIN_SENHA} caracteres.`;
  if (senha.trim().length === 0) return "A senha não pode ser só espaços.";
  // Medido em 20/08: uma verificação custa ~56 ms de scrypt, e o login não tem
  // freio de tentativas. Com isso, varrer TODAS as senhas só de dígitos leva
  // 15,6 h em série — 19 minutos com 50 requisições em paralelo. Não é teoria:
  // é o tamanho do espaço vezes o custo por tentativa.
  if (/^\d+$/u.test(senha))
    return "Não use uma senha só de números — ela é curta demais para o computador, mesmo parecendo longa para você.";
  // "aaaaaaaaaa" passa em qualquer regra de tamanho e não vale nada.
  if (new Set(senha).size === 1)
    return "Não repita o mesmo caractere — misture letras e números.";
  if (proibida && normalizarCodigo(senha) === normalizarCodigo(proibida))
    return "Escolha uma senha diferente do código que você recebeu — ele já passou por outras mãos.";
  return null;
}

export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verificarSenha(senha: string, armazenado: string | undefined | null): boolean {
  if (!armazenado || !armazenado.includes(":")) return false;
  const [saltHex, hashHex] = armazenado.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const esperado = Buffer.from(hashHex, "hex");
    // Buffer vazio aceitaria QUALQUER senha: com hash de 0 byte, o scrypt
    // devolve 0 byte e `timingSafeEqual(vazio, vazio)` é verdadeiro. Bastava
    // um `senha_hash` valendo ":" — ou hex ilegível — para virar porta aberta.
    if (salt.length === 0 || esperado.length === 0) return false;
    const calc = scryptSync(senha, salt, esperado.length);
    return esperado.length === calc.length && timingSafeEqual(esperado, calc);
  } catch {
    return false;
  }
}
