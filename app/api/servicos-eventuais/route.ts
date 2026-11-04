import { comSessao, ok } from "@/lib/api";
import { diasDoPeriodo } from "@/lib/dateUtils";
import { leituraCompleta, limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  createServicoEventual,
  getServicosEventuais,
} from "@/services/servicosEventuaisService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sede = limitarSedeConsulta(
      sessao,
      url.searchParams.get("sede") ?? undefined,
    );
    const de = url.searchParams.get("de") ?? undefined;
    const ate = url.searchParams.get("ate") ?? undefined;
    // O supervisor só vê isto pelo mostrador da Rotina, que pede um dia ou uma semana.
    if (!leituraCompleta(sessao) && !diasDoPeriodo(de ?? "", ate ?? "", 7))
      return ok({ erro: "Informe um período de até 7 dias." }, 400);
    const lista = await getServicosEventuais(de, ate, sede);
    // Mínimo necessário (LGPD), como nas ausências: o supervisor abre a Rotina e
    // recebe isto para o mostrador, que só precisa de quem, quando e quanto. A
    // descrição e a observação são texto livre.
    return ok(
      leituraCompleta(sessao)
        ? lista
        : lista
            .filter((e) => e.funcionario_id)
            .map(({ id, sede_id, funcionario_id, data, inicio, fim, tempo_min }) => ({
              id, sede_id, funcionario_id, data, inicio, fim, tempo_min,
            })),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json().catch(() => null);
    if (!podeAlterarSede(sessao, dados?.sede_id))
      throw new ErroPermissao("Coordenadores só registram eventuais das sedes que operam.");
    return ok(await createServicoEventual({ ...dados, supervisor_id: sessao.id }, sessao.email), 201);
  });
}
