import { NextResponse } from "next/server";
import { comSessao } from "@/lib/api";
import { limitarSedeConsulta, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { divergenciasDaSede, QuadroIndisponivel } from "@/services/quadroInfraService";

/**
 * GET /api/quadro-infra/divergencias?sede=<id> — o cadastro daqui contra o
 * Quadro da Infra do Chromos, UMA sede por vez (`lib/quadroInfra.ts`).
 *
 * ⚠️ Fora de `/api/chromos/`: aquele prefixo passa no `middleware.ts` sem
 * sessão (é a porta do Chromos para dentro). Esta é rota de pessoa.
 */
export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    // Lista POSITIVA (administrador e coordenador): `sedesPermitidas` devolve
    // "todas" também para o visualizador, e ele não cuida de cadastro.
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const pedida = new URL(req.url).searchParams.get("sede") || undefined;
    const sedeId = limitarSedeConsulta(sessao, pedida);
    if (!sedeId || sedeId === "geral")
      return NextResponse.json({ erro: "Escolha uma sede." }, { status: 400, headers: SEM_CACHE });
    try {
      return NextResponse.json(await divergenciasDaSede(sedeId), { headers: SEM_CACHE });
    } catch (e) {
      if (e instanceof QuadroIndisponivel)
        return NextResponse.json(
          { erro: e.message, configurado: e.configurado },
          { status: 503, headers: SEM_CACHE },
        );
      throw e;
    }
  });
}
