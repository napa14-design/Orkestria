import { comSessao, ok } from "@/lib/api";
import { getCentralDia } from "@/services/centralDiaService";

export async function GET() {
  return comSessao(async (sessao) => ok(await getCentralDia(sessao)));
}
