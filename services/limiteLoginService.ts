/**
 * O contador do limite de tentativas da senha (ver `lib/limiteLogin.ts`). Mora em
 * `cache_resumo`: já está fora do histórico (sem uma linha imutável por chute) e fechada nas
 * Rules. Gravar é compare-and-swap pelo texto lido (`atualizarSe`), e o primeiro registro
 * nasce com `exigirNovo`: pedidos paralelos não passam do limite.
 */
import { NextResponse } from "next/server";
import { agoraISO, ehIdRepetido, getDataSource } from "@/lib/datasource";
import { decidirTentativa, idDoLimite, JANELA_LIMITE_MS } from "@/lib/limiteLogin";

export type Reserva = { liberado: true } | { liberado: false; ate: Date };

/** Reserva uma tentativa ANTES de conferir a senha. Banco fora do ar: lança (a rota responde 503). */
export async function reservarTentativa(email: string, agora: Date = new Date()): Promise<Reserva> {
  const ds = await getDataSource();
  const id = idDoLimite(email);
  for (let rodada = 0; rodada < 3; rodada++) {
    const atual = await ds.obter("cache_resumo", id);
    const lido = atual?.corpo ?? null;
    const d = decidirTentativa(lido, agora);
    if (!d.liberado) return d;
    const campos = {
      corpo: JSON.stringify(d.proximo),
      expira_em: new Date(Date.parse(d.proximo.desde) + JANELA_LIMITE_MS).toISOString(),
    };
    if (!atual) {
      try {
        await ds.gravarLote([{ tipo: "criar", tabela: "cache_resumo", exigirNovo: true, registro: { id, ...campos, criado_em: agoraISO() } }]);
        return { liberado: true };
      } catch (e) {
        if (!ehIdRepetido(e)) throw e;
        continue; // outro pedido criou no meio: relê e decide de novo
      }
    }
    if (await ds.atualizarSe("cache_resumo", id, (a) => a.corpo === lido, campos)) return { liberado: true };
  }
  // Perdeu três disputas seguidas: fecha em vez de abrir, sem conferir nada.
  return { liberado: false, ate: new Date(agora.getTime() + 1000) };
}

/** No sucesso, zera só o contador de quem entrou. Falhar aqui não impede o login. */
export async function liberarTentativas(email: string): Promise<void> {
  try {
    await (await getDataSource()).excluir("cache_resumo", idDoLimite(email));
  } catch (e) {
    console.error("[limite-login] não zerou o contador", e instanceof Error ? e.name : "");
  }
}

/** A mesma recusa para qualquer e-mail (existente ou não), sem ecoar o e-mail. */
export function respostaDeEspera(ate: Date) {
  const hora = ate.toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" });
  return NextResponse.json(
    { erro: `Muitas tentativas com este e-mail. Tente de novo depois das ${hora}, ou entre com o Google.` },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((ate.getTime() - Date.now()) / 1000))) } },
  );
}
