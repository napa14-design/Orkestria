import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createFuncionario, getFuncionarios } from "@/services/funcionariosService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const solicitada = new URL(req.url).searchParams.get("sede") ?? undefined;
    const sedeId = limitarSedeConsulta(sessao, solicitada);
    return ok(await getFuncionarios(sedeId));
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    if (!podeAlterarSede(sessao, dados.sede_id))
      throw new ErroPermissao("Supervisores só cadastram funcionários das sedes que operam.");
    return ok(await createFuncionario(dados, sessao.email), 201);
  });
}
