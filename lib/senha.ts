/**
 * Hash de senha individual com scrypt (formato "saltHex:hashHex").
 * Usado pelo login por usuário. Nunca guardamos a senha em texto puro.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { MIN_SENHA } from "./sessionConstants";

/** A senha única de primeiro acesso, compartilhada e definida no ambiente. */
export function senhaCompartilhada(): string {
  return process.env.ACCESS_PASSWORD ?? "mudar123";
}

/**
 * Recusa senha pessoal fraca ou inútil. Devolve a mensagem do problema, ou
 * `null` quando está boa.
 *
 * Repetir a senha compartilhada é o caso que mais importa: passaria a sensação
 * de ter trocado sem trocar nada, e ela é conhecida por todo mundo.
 */
export function problemaNaSenha(nova: string): string | null {
  const senha = nova ?? "";
  if (senha.length < MIN_SENHA)
    return `A senha precisa ter ao menos ${MIN_SENHA} caracteres.`;
  if (senha.trim().length === 0) return "A senha não pode ser só espaços.";
  if (senha === senhaCompartilhada())
    return "Escolha uma senha diferente da senha de primeiro acesso — essa é conhecida por todos.";
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
  try {
    const salt = Buffer.from(saltHex, "hex");
    const esperado = Buffer.from(hashHex, "hex");
    const calc = scryptSync(senha, salt, esperado.length);
    return esperado.length === calc.length && timingSafeEqual(esperado, calc);
  } catch {
    return false;
  }
}
