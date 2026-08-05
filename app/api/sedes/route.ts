import { comSessao, ok } from "@/lib/api";
import { sedesPermitidas } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createSede, getSedes } from "@/services/sedesService";

export async function GET() {
  return comSessao(async (sessao) => {
    // Devolve TODAS as sedes do escopo (não só a principal): é esta lista que
    // alimenta o seletor de sede de quem opera mais de uma.
    const permitidas = sedesPermitidas(sessao);
    const sedes = await getSedes();
    return ok(permitidas ? sedes.filter((item) => permitidas.includes(item.id)) : sedes);
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
