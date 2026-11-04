import { comSessao, ok } from "@/lib/api";
import { leituraCompleta, limitarSedeConsulta, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createFeriado, getFeriados } from "@/services/feriadosService";

/** GET /api/feriados [?sede=] — inclui sempre os globais (sede vazia). */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sedeId = limitarSedeConsulta(sessao, url.searchParams.get("sede") ?? undefined);
    const feriados = await getFeriados({ sedeId });
    // Mínimo necessário: a Semana do supervisor agora chama esta rota, e o feriado
    // global traria o e-mail de quem o criou, às vezes de outra sede.
    return ok(
      leituraCompleta(sessao)
        ? feriados
        : feriados.map(({ id, sede_id, nome, data_inicio, data_fim, ativo }) => ({ id, sede_id, nome, data_inicio, data_fim, ativo })),
    );
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
