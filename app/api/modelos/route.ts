import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { excluirModelo, getModelos, salvarModelo } from "@/services/modelosService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const solicitada = new URL(req.url).searchParams.get("sede") ?? undefined;
    const sede = limitarSedeConsulta(sessao, solicitada);
    return ok(await getModelos(sede));
  });
}

/** POST { nome, data_origem, sede_id, padrao?, com_duracao?, evento?, dias_semana? } → salva o dia como modelo. */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { nome, data_origem, sede_id, padrao, com_duracao, evento, dias_semana, substitui } =
      await req.json();
    if (!nome || !data_origem || !sede_id)
      return ok({ erro: "Informe nome, data_origem e sede_id." }, 400);
    if (!podeAlterarSede(sessao, sede_id))
      throw new ErroPermissao("Supervisores só gerenciam modelos das sedes que operam.");
    return ok(
      await salvarModelo(nome, data_origem, sede_id, sessao.email, {
        padrao: !!padrao,
        comDuracao: !!com_duracao,
        evento: !!evento,
        diasSemana: typeof dias_semana === "string" ? dias_semana : "",
        substitui: !!substitui,
      }),
      201,
    );
  });
}

/** DELETE ?nome=X&sede=Y → exclui o modelo. */
export async function DELETE(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const url = new URL(req.url);
    const nome = url.searchParams.get("nome");
    const sede = url.searchParams.get("sede");
    if (!nome || !sede) return ok({ erro: "Informe ?nome= e ?sede=." }, 400);
    if (!podeAlterarSede(sessao, sede))
      throw new ErroPermissao("Supervisores só gerenciam modelos das sedes que operam.");
    return ok({ removidos: await excluirModelo(nome, sede) });
  });
}
