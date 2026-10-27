import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createFeriado, getFeriados } from "@/services/feriadosService";

/** GET /api/feriados [?sede=] — inclui sempre os globais (sede vazia). */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sedeId = limitarSedeConsulta(sessao, url.searchParams.get("sede") ?? undefined);
    return ok(await getFeriados({ sedeId }));
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    // Administrador e coordenador, inclusive o feriado de TODAS as sedes
    // (decisão do dono, 27/10/2026: o "Dia do Servidor Público" fechou a agenda
    // de sede que trabalhava e o coordenador não tinha como abrir). Quem mudou
    // fica no histórico de alterações.
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    return ok(await createFeriado(await req.json(), sessao.email), 201);
  });
}
