import { NextResponse } from "next/server";
import { recusaSeNaoForOChromos } from "@/lib/chaves";
import { lerDesde, TETO_BYTES } from "@/lib/eventosQuadro";
import { executarComUsuario } from "@/lib/contextoUsuario";
import { eventosDesde, expurgarUmaVezPorDia } from "@/services/eventosQuadroService";

/**
 * GET /api/chromos/eventos-quadro?desde=AAAA-MM-DD — os eventos de ASG (admissão,
 * desligamento, transferência) que o Chromos aplica no Quadro da Infra. Contrato
 * "Orkestria → Cromos (v1)" e emendas do `seguranca` (13/11/2026); regras em
 * `lib/eventosQuadro.ts`.
 *
 * Portão: `Authorization: Bearer <CHAVE_CROMOS>` (decisão do dono; risco aceito no
 * ADR-023), conferido ANTES de ler a query. `desde` estrito (400, nunca ajustado);
 * acima do teto, 413 (nunca lista cortada); só os campos do contrato. Toda resposta é
 * `no-store` e sem CORS — quem chama é servidor, não navegador.
 */
export const dynamic = "force-dynamic";

const responder = (corpo: unknown, status = 200) =>
  NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  // Sem a chave, FECHADO — e nada da query é lido antes daqui.
  const recusa = recusaSeNaoForOChromos(req.headers.get("authorization"));
  if (recusa) return responder({ erro: recusa.erro }, recusa.status);

  const pedido = lerDesde(new URL(req.url).searchParams);
  if ("erro" in pedido) return responder({ erro: pedido.erro }, 400);

  try {
    const r = await eventosDesde(pedido.desde);
    // Envelope exatamente `{ eventos }` (formato fixado pelo Chromos em 16/11/2026), com os
    // dois tetos de lá: 500 eventos e 512 KB. Passou de um deles: 413, nunca lista cortada.
    const corpo = "teto" in r ? null : { eventos: r.eventos };
    if (!corpo || Buffer.byteLength(JSON.stringify(corpo)) > TETO_BYTES)
      return responder({ erro: "Eventos demais nesta janela: peça um desde mais recente." }, 413);
    // Retenção de 90 dias de carona no feed (decisão do dono, 16/11/2026: sem segredo novo nem
    // cron): só com a chave conferida e a resposta 200 JÁ MONTADA, no máximo uma vez por dia.
    // Aguardado (função serverless pode morrer depois da resposta), mas falha só vai ao log —
    // nunca muda o que o Chromos recebe. O expurgo só toca o que tem mais de 90 dias; o feed
    // olha no máximo 60, então a resposta não depende dele.
    try {
      await executarComUsuario("chromos:expurgo-eventos-quadro", expurgarUmaVezPorDia);
    } catch (e) {
      console.error("[chromos/eventos-quadro] expurgo falhou", e);
    }
    return responder(corpo);
  } catch (e) {
    console.error("[chromos/eventos-quadro]", e);
    return responder({ erro: "Falha ao ler os eventos." }, 500);
  }
}

const soLeitura = () =>
  NextResponse.json({ erro: "Método não permitido." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
export const POST = soLeitura;
export const PUT = soLeitura;
export const DELETE = soLeitura;
export const PATCH = soLeitura;
