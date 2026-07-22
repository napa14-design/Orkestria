import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createSede, getSedes } from "@/services/sedesService";

export async function GET() {
  return comSessao(async (sessao) => {
    const sede = limitarSedeConsulta(sessao);
    const sedes = await getSedes();
    return ok(sede ? sedes.filter((item) => item.id === sede) : sedes);
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (sessao.perfil !== "administrador")
      throw new ErroPermissao("Apenas administradores cadastram sedes.");
    const dados = await req.json();
    return ok(await createSede(dados, sessao.email), 201);
  });
}
