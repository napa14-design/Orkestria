/**
 * Hash de senha individual com scrypt (formato "saltHex:hashHex").
 * Usado pelo login por usuário. Nunca guardamos a senha em texto puro.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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
