import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { diasDoPeriodo } from "@/lib/dateUtils";
import { leituraCompleta, limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { remanejarCriticasDeAusentes } from "@/services/centralDiaService";
import {
  createServicoEventual,
  diasDoLancamento,
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
    // descrição e a observação são texto livre. `libera_rota` (sim/não) entra para o
    // Acompanhamento dele oferecer "Feita por…" no horário do empréstimo: sem ele, o
    // servidor recusava o "Feita" e o botão certo não aparecia (auditoria, 23/11/2026).
    return ok(
      leituraCompleta(sessao)
        ? lista
        : lista
            .filter((e) => e.funcionario_id)
            .map(({ id, sede_id, funcionario_id, data, inicio, fim, tempo_min, libera_rota }) => ({
              id, sede_id, funcionario_id, data, inicio, fim, tempo_min, ...(libera_rota === true ? { libera_rota: true } : {}),
            })),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const corpo = await req.json().catch(() => null);
    if (!podeAlterarSede(sessao, corpo?.sede_id))
      throw new ErroPermissao("Coordenadores só registram eventuais das sedes que operam.");
    // `ate`: só no empréstimo, um lançamento por dia de trabalho (23/11/2026).
    const { ate, ...dados } = corpo ?? {};
    const dias = await diasDoLancamento(dados, ate);
    const criados = [];
    for (const data of dias) criados.push(await createServicoEventual({ ...dados, data, supervisor_id: sessao.id }, sessao.email));
    // Empréstimo: as críticas que caem na janela passam sozinhas, como na falta. Uma falha aqui
    // não desfaz o lançamento (já salvo): a Central ainda mostra o que ficou sem dono.
    const remanejos: string[] = [];
    if (dados.libera_rota === true)
      for (const data of dias) {
        try {
          // Só onde a pessoa já tem agenda: os outros dias remanejam quando forem gerados.
          const temAgenda = await (await getDataSource()).contar("rotinas_planejadas", [
            { campo: "funcionario_id", op: "==", valor: String(dados.funcionario_id) },
            { campo: "data", op: "==", valor: data },
          ]);
          if (!temAgenda) continue;
          remanejos.push(...(await remanejarCriticasDeAusentes(dados.sede_id, data, sessao)).map((r) => r.texto));
        } catch (e) {
          console.error("Empréstimo: remanejo automático falhou", data, e instanceof Error ? e.name : "");
        }
      }
    return ok({ ...criados[0], dias: criados.length, remanejos }, 201);
  });
}
