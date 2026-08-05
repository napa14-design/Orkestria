import { comSessao, ok } from "@/lib/api";
import { concluirEtapa, getEtapasConcluidas } from "@/services/tutorialService";

/** Etapas que a pessoa da sessão já concluiu. */
export async function GET() {
  return comSessao(async (sessao) => ok({ concluidas: await getEtapasConcluidas(sessao.id) }));
}

/**
 * Marca uma etapa como concluída — sempre para o usuário da **sessão**, nunca
 * para um id vindo do corpo: progresso de aprendizado é de quem está usando.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { etapa } = (await req.json()) as { etapa?: string };
    if (!etapa) return ok({ concluidas: await getEtapasConcluidas(sessao.id) });
    return ok({ concluidas: await concluirEtapa(sessao.id, etapa) });
  });
}
