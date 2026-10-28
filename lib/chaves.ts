import { tokenConfere } from "@/lib/resumoExecutivo";

/**
 * AS CHAVES ENTRE SISTEMAS (28/10/2026) — uma por sistema que CHAMA.
 *
 * O Orkestria manda a dele (`CHAVE_ORKESTRIA`) ao Chromos (quadro) e ao SGCP
 * (vaga), e confere a do Chromos (`CHAVE_CROMOS`) no resumo. O mesmo valor tem
 * o mesmo nome em toda Vercel onde mora (só Production). Mapa no vault:
 * "Integrações e Segredos".
 *
 * ⚠️ RISCO ACEITO (Guilherme, 28/10/2026, ADR no vault): quem recebe guarda a
 * chave crua de quem chama.
 *
 * ⚠️ TROCA SEM QUEDA: `CHAVE_CROMOS_ANTERIOR` vale junto, mas SÓ com uma atual
 * válida; quando casa, sai no log. Abaixo de 32 caracteres a chave vale como
 * ausente. A do Chromos igual à do Orkestria: 503 — a própria chave do
 * Orkestria abriria o resumo.
 */
export const CHAVE_MINIMA = 32;

const valida = (v: string | undefined) => {
  const t = v?.trim() ?? "";
  return t.length >= CHAVE_MINIMA ? t : null;
};

/** A chave que o Orkestria manda, ou `null` sem ela ou curta: não chama. */
export function minhaChave(): string | null {
  return valida(process.env.CHAVE_ORKESTRIA);
}

/** O valor de `Authorization: Bearer <x>`; o esquema não diferencia maiúsculas (RFC 7235). */
function doCabecalho(autorizacao: string | null): string {
  const [tipo, valor, ...resto] = (autorizacao ?? "").split(" ");
  return tipo.toLowerCase() === "bearer" && valor && !resto.length ? valor : "";
}

/** A porta das rotas que o Chromos chama: `null` quando é ele, ou a recusa. */
export function recusaSeNaoForOChromos(autorizacao: string | null): { status: 401 | 503; erro: string } | null {
  const atual = valida(process.env.CHAVE_CROMOS);
  if (!atual) return { status: 503, erro: "Integração não configurada." };
  const anterior = valida(process.env.CHAVE_CROMOS_ANTERIOR);
  const aceitas = [atual, ...(anterior ? [anterior] : [])];

  const propria = valida(process.env.CHAVE_ORKESTRIA);
  const propriaEAnterior = [propria, valida(process.env.CHAVE_ORKESTRIA_ANTERIOR)].filter((c): c is string => !!c);
  if (aceitas.some((a) => propriaEAnterior.some((p) => tokenConfere(a, p)))) {
    console.error("[chaves] a chave do Chromos é igual à do Orkestria");
    return { status: 503, erro: "Integração mal configurada." };
  }

  // Confere as duas (sem parar na primeira): o tempo não diz se há anterior.
  const recebido = doCabecalho(autorizacao);
  const casou = aceitas.map((c) => tokenConfere(recebido, c));
  if (!casou.some(Boolean)) return { status: 401, erro: "Não autorizado." };
  if (!casou[0]) console.warn("[chaves] chamada com a CHAVE_CROMOS_ANTERIOR");
  return null;
}
