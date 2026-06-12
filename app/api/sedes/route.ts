import { comSessao, ok } from "@/lib/api";
import { ErroPermissao } from "@/services/erros";
import { createSede, getSedes } from "@/services/sedesService";

export async function GET() {
  return comSessao(async () => ok(await getSedes()));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (sessao.perfil !== "administrador")
      throw new ErroPermissao("Apenas administradores cadastram sedes.");
    const dados = await req.json();
    return ok(await createSede(dados, sessao.email), 201);
  });
}
