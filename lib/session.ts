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

/**
 * Sessão que RENOVA com o uso (pedido do dono, 22/10/2026: "o Orkestria não
 * mantém conectado?" — eram 12 h fixas). Três prazos:
 * - inatividade: sem nenhuma chamada por 7 dias, cai;
 * - teto: 7 dias desde o LOGIN, use quanto usar (decisão do dono) — a renovação
 *   nunca reinicia este relógio. Sem teto, um cookie copiado se renovaria para
 *   sempre (revisão de segurança);
 * - reconferência: passada 1 h desde a emissão, a próxima chamada relê o
 *   cadastro (`comSessao`) — desativar, rebaixar o perfil ou tirar uma sede vale
 *   em até 1 h, e não só no próximo login.
 */
const INATIVIDADE_S = 7 * 24 * 60 * 60;
const TETO_S = 7 * 24 * 60 * 60;
export const RECONFERIR_S = 60 * 60;
/** Relógio adiantado de servidor para servidor não pode recusar um token recém-emitido. */
const FOLGA_RELOGIO_S = 5 * 60;

/**
 * Metadados assinados junto com a sessão: `iat` (emitido em), `auth_em` (login
 * que originou a cadeia de renovações), `sv` (versão de sessão do cadastro —
 * trocar a senha ou gerar código novo a incrementa e derruba as outras) e `exp`.
 */
export interface MetaSessao {
  iat: number;
  auth_em: number;
  sv: number;
  exp: number;
}

/** O que vai assinado no cookie. */
export type SessaoComMeta = SessaoUsuario & MetaSessao;

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

/**
 * `auth_em` ausente = login novo (o teto começa agora). A renovação passa o do
 * token antigo e o teto não anda.
 */
export function criarTokenSessao(
  sessao: SessaoUsuario,
  agoraMs = Date.now(),
  meta: { auth_em?: number; sv?: number } = {},
): string {
  // A validade vai DENTRO do payload, assinada. O `maxAge` do cookie é só uma
  // dica ao navegador: um token copiado (log, captura de tela, máquina
  // compartilhada) continuaria valendo para sempre se a expiração morasse só lá.
  const iat = Math.floor(agoraMs / 1000);
  const auth_em = meta.auth_em ?? iat;
  // Só os campos da sessão: metadados velhos de um token anterior não vazam.
  const { id, nome, email, perfil, sede_id, sedes } = sessao;
  const corpo: SessaoComMeta = {
    id, nome, email, perfil, sede_id, sedes,
    iat,
    auth_em,
    sv: meta.sv ?? 0,
    exp: Math.min(iat + INATIVIDADE_S, auth_em + TETO_S),
  };
  const payload = Buffer.from(JSON.stringify(corpo), "utf8").toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

export function verificarToken(
  token: string | undefined,
  agoraMs = Date.now(),
): SessaoComMeta | null {
  if (!token) return null;
  const [payload, assinatura] = token.split(".");
  if (!payload || !assinatura) return null;
  const esperada = assinar(payload);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let dados: SessaoComMeta;
  try {
    dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessaoComMeta;
  } catch {
    return null;
  }
  // Sem algum dos metadados = cookie de um formato anterior (o de 12 h não tem
  // `iat`, `auth_em` nem `sv`). Recusa: quem estiver com sessão aberta entra de
  // novo uma vez, e ninguém fica com token que pula a reconferência.
  const agoraS = agoraMs / 1000;
  if (
    typeof dados.exp !== "number" ||
    typeof dados.iat !== "number" ||
    typeof dados.auth_em !== "number" ||
    typeof dados.sv !== "number"
  )
    return null;
  if (dados.exp <= agoraS) return null;
  // O teto vale por si, mesmo com `exp` lá na frente.
  if (dados.auth_em + TETO_S <= agoraS) return null;
  // Emitido "no futuro" pularia a reconferência para sempre.
  if (dados.iat > agoraS + FOLGA_RELOGIO_S) return null;
  return dados;
}

/** Lê e valida a sessão do cookie da requisição atual (rotas/server components). */
export async function obterSessao(): Promise<SessaoComMeta | null> {
  const jar = await cookies();
  return verificarToken(jar.get(COOKIE_SESSAO)?.value);
}

/**
 * Grava o cookie. Login: `{ sv }` do cadastro (o teto começa agora). Renovação:
 * `{ auth_em, sv }` do token antigo.
 */
export async function gravarSessao(
  sessao: SessaoUsuario,
  meta: { auth_em?: number; sv?: number } = {},
  agoraMs = Date.now(),
): Promise<void> {
  const jar = await cookies();
  const token = criarTokenSessao(sessao, agoraMs, meta);
  const exp = verificarToken(token, agoraMs)?.exp ?? 0;
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    // Em produção, sempre `secure` — o sistema está na Vercel, atrás de HTTPS, e
    // esquecer a variável não pode mandar o cookie de sessão em texto aberto
    // (auditoria, 14/10/2026). `localhost` é contexto seguro para o navegador,
    // então `next start` local continua logando. Fora de produção, COOKIE_SECURE.
    secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
    maxAge: Math.max(0, exp - Math.floor(agoraMs / 1000)),
    path: "/",
  });
}

export async function limparSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SESSAO);
}
