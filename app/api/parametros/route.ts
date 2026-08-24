import { comSessao, ok } from "@/lib/api";
import {
  CHAVES_SO_ADMINISTRADOR,
  limitarSedeConsulta,
  podeAlterarSede,
} from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  createParametro,
  getParametros,
  resolverParametros,
} from "@/services/parametrosService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sede = limitarSedeConsulta(
      sessao,
      url.searchParams.get("sede") ?? undefined,
    );
    // ?resolvidos=1&sede=X → parâmetros já mesclados (global + sede)
    if (url.searchParams.get("resolvidos")) {
      return ok(await resolverParametros(sede));
    }
    const parametros = await getParametros();
    return ok(
      sede
        ? parametros.filter((item) => item.sede_id === "geral" || item.sede_id === sede)
        : parametros,
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (sessao.perfil === "visualizador") throw new ErroPermissao();
    const dados = await req.json();
    if (
      sessao.perfil === "supervisor" &&
      (!dados.editavel_por_supervisor ||
        !podeAlterarSede(sessao, dados.sede_id) ||
        // Sem isto, travar o PUT seria teatro: bastava CRIAR um
        // `ocupacao_alta` da própria sede, que sobrescreve o geral.
        CHAVES_SO_ADMINISTRADOR.has(dados.chave))
    )
      throw new ErroPermissao(
        "Supervisores só criam parâmetros editáveis no escopo das sedes que operam, e nunca os limites de ocupação.",
      );
    return ok(await createParametro(dados, sessao.email), 201);
  });
}
