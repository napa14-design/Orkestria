/**
 * Sessão do MVP: cookie httpOnly assinado com HMAC-SHA256.
 *
 * A identidade vem do e-mail cadastrado na tabela de usuários, que define
 * perfil e sedes; a credencial é a senha pessoal, o código de primeiro acesso
 * ou o Google (Firebase Auth).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SessaoUsuario } from "./permissions";
import { COOKIE_SESSAO } from "./sessionConstants";

export { COOKIE_SESSAO };
const MAX_IDADE_S = 60 * 60 * 12; // 12 horas

/** O que vai assinado no cookie: a sessão mais o instante em que ela caduca. */
type SessaoComExpiracao = SessaoUsuario & { exp: number };

/** Valor de fallback — está no código, logo é público. Só serve em dev. */
const SEGREDO_DEV = "segredo-dev-inseguro";

function segredo(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s !== SEGREDO_DEV) return s;
  // Falha FECHANDO. Sem `AUTH_SECRET` em produção, todo cookie seria assinado
  // com uma string que está neste arquivo, no GitHub — qualquer pessoa forjaria
  // sessão de administrador, e nada no sistema acusaria. Aplicação fora do ar é
  // recuperável; sessão forjada não é nem detectável.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET não está definida. O sistema recusa assinar sessão com o segredo de desenvolvimento — defina a variável no ambiente antes de subir.",
    );
  }
  return SEGREDO_DEV;
}

function assinar(payload: string): string {
  return createHmac("sha256", segredo()).update(payload).digest("base64url");
}

export function criarTokenSessao(sessao: SessaoUsuario, agoraMs = Date.now()): string {
  // A validade vai DENTRO do payload, assinada. O `maxAge` do cookie é só uma
  // dica ao navegador: um token copiado (log, captura de tela, máquina
  // compartilhada) continuaria valendo para sempre se a expiração morasse só lá.
  const corpo: SessaoComExpiracao = { ...sessao, exp: Math.floor(agoraMs / 1000) + MAX_IDADE_S };
  const payload = Buffer.from(JSON.stringify(corpo), "utf8").toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

export function verificarToken(
  token: string | undefined,
  agoraMs = Date.now(),
): SessaoUsuario | null {
  if (!token) return null;
  const [payload, assinatura] = token.split(".");
  if (!payload || !assinatura) return null;
  const esperada = assinar(payload);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let dados: SessaoComExpiracao;
  try {
    dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessaoComExpiracao;
  } catch {
    return null;
  }
  // Sem `exp` = cookie emitido antes desta trava existir. Recusa: quem estiver
  // com sessão aberta entra de novo uma vez, e ninguém fica com token eterno.
  if (typeof dados.exp !== "number" || dados.exp * 1000 <= agoraMs) return null;
  return dados;
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
