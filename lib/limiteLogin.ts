/**
 * Limite de tentativas da senha (revisão externa, Consulta 7, 18/11/2026: o login aceitava
 * tentativa ilimitada). Desenho e casos de ataque do revisor de segurança, antes do código.
 *
 * - Por e-mail (normalizado), contando também e-mail que não existe: a resposta de quem está
 *   no limite é a mesma para conta real e inventada. Por IP não: as unidades saem por um NAT
 *   só, e um colega travaria a sede inteira.
 * - Conta TENTATIVAS, não falhas: a vaga é reservada antes de conferir. Contar a falha depois
 *   deixa 50 pedidos paralelos lerem n=0 e conferirem 50 senhas.
 * - Janela fixa a partir da 1ª tentativa; tentativa durante a trava não grava nada, então a
 *   trava dura no máximo uma janela — limite do quanto alguém trava um colega de propósito.
 *   A saída da vítima é o login com o Google, que não passa por aqui.
 *
 * ⚠️ Não cobre força bruta lenta (5 a cada 15 min por conta) nem pulverização entre contas.
 */
import { createHash } from "node:crypto";

export const LIMITE_TENTATIVAS = 5;
export const JANELA_LIMITE_MS = 15 * 60 * 1000;
/** Corpo com `desde` no futuro (relógio torto ou documento adulterado) não trava além disso. */
const FOLGA_RELOGIO_MS = 60 * 1000;

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Id do contador em `cache_resumo`: o hash, para o e-mail não ficar gravado em claro. */
export function idDoLimite(email: string): string {
  return `login_${createHash("sha256").update(normalizarEmail(email)).digest("hex")}`;
}

export type EstadoLimite = { n: number; desde: string };
export type Decisao = { liberado: true; proximo: EstadoLimite } | { liberado: false; ate: Date };

/** Pura: a partir do que está gravado (ou nada), libera e diz o próximo estado, ou recusa até quando. */
export function decidirTentativa(corpo: string | null, agora: Date): Decisao {
  const t = agora.getTime();
  let e: Partial<EstadoLimite> | null = null;
  try {
    e = corpo ? (JSON.parse(corpo) as Partial<EstadoLimite>) : null;
  } catch {
    e = null;
  }
  const desde = typeof e?.desde === "string" ? Date.parse(e.desde) : NaN;
  const n = Number.isInteger(e?.n) && (e!.n as number) >= 0 ? (e!.n as number) : NaN;
  if (!Number.isFinite(desde) || !Number.isFinite(n) || desde > t + FOLGA_RELOGIO_MS || t >= desde + JANELA_LIMITE_MS)
    return { liberado: true, proximo: { n: 1, desde: agora.toISOString() } };
  if (n >= LIMITE_TENTATIVAS) return { liberado: false, ate: new Date(desde + JANELA_LIMITE_MS) };
  return { liberado: true, proximo: { n: n + 1, desde: e!.desde as string } };
}
