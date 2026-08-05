import { comSessao, ok } from "@/lib/api";
import {
  concluirEtapa,
  getProgressoTutorial,
  responderConvite,
} from "@/services/tutorialService";

/** Progresso e estado do tutorial de quem está na sessão. */
export async function GET() {
  return comSessao(async (sessao) => ok(await getProgressoTutorial(sessao.id)));
}

/**
 * Duas coisas: concluir uma etapa (`etapa`) ou responder ao convite (`acao`).
 *
 * Sempre para o usuário da **sessão**, nunca para um id vindo do corpo:
 * progresso de aprendizado é de quem está usando.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { etapa, acao } = (await req.json()) as {
      etapa?: string;
      acao?: "ver" | "adiar" | "pular" | "retomar";
    };
    if (acao) await responderConvite(sessao.id, acao);
    else if (etapa) await concluirEtapa(sessao.id, etapa);
    return ok(await getProgressoTutorial(sessao.id));
  });
}
