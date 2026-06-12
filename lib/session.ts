/**
 * Sessão do MVP: cookie httpOnly assinado com HMAC-SHA256.
 *
 * Login simples — senha única (ACCESS_PASSWORD) + e-mail cadastrado na
 * tabela de usuários, que define perfil e sede. Na Fase 3 (Firebase),
 * substituir por Firebase Authentication sem alterar o restante do sistema.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SessaoUsuario } from "./permissions";
import { COOKIE_SESSAO } from "./sessionConstants";

export { COOKIE_SESSAO };
const MAX_IDADE_S = 60 * 60 * 12; // 12 horas

function segredo(): string {
  return process.env.AUTH_SECRET ?? "segredo-dev-inseguro";
}

function assinar(payload: string): string {
  return createHmac("sha256", segredo()).update(payload).digest("base64url");
}

export function criarTokenSessao(sessao: SessaoUsuario): string {
  const payload = Buffer.from(JSON.stringify(sessao), "utf8").toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

export function verificarToken(token: string | undefined): SessaoUsuario | null {
  if (!token) return null;
  const [payload, assinatura] = token.split(".");
  if (!payload || !assinatura) return null;
  const esperada = assinar(payload);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessaoUsuario;
  } catch {
    return null;
  }
}

/** Lê e valida a sessão do cookie da requisição atual (rotas/server components). */
export async function obterSessao(): Promise<SessaoUsuario | null> {
  const jar = await cookies();
  return verificarToken(jar.get(COOKIE_SESSAO)?.value);
}

export async function gravarSessao(sessao: SessaoUsuario): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, criarTokenSessao(sessao), {
    httpOnly: true,
    sameSite: "lax",
    // Ative COOKIE_SECURE=true ao publicar atrás de HTTPS. O padrão é false
    // porque o MVP costuma rodar em HTTP na rede interna.
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: MAX_IDADE_S,
    path: "/",
  });
}

export async function limparSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SESSAO);
}
