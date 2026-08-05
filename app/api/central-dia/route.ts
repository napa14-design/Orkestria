import { comSessao, ok } from "@/lib/api";
import { getCentralDia } from "@/services/centralDiaService";

export async function GET(req: Request) {
  const sede = new URL(req.url).searchParams.get("sede") ?? undefined;
  // A sede pedida é só um pedido: `limitarSedeConsulta` recusa o que estiver
  // fora do escopo e volta para a sede principal.
  return comSessao(async (sessao) => ok(await getCentralDia(sessao, sede)));
}
