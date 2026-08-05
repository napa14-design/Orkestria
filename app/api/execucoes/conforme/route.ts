import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { registrarExecucao } from "@/services/execucoesService";

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { rotina_id } = (await req.json()) as { rotina_id?: string };
    const ds = await getDataSource();
    const rotina = rotina_id ? await ds.obter("rotinas_planejadas", rotina_id) : null;
    if (!rotina) throw new Error("Rotina planejada não encontrada.");
    if (!podeAlterarSede(sessao, rotina.sede_id))
      throw new ErroPermissao("Supervisores só registram execuções das sedes que operam.");

    return ok(
      await registrarExecucao(
        {
          rotina_id: rotina.id,
          data_execucao: rotina.data,
          status_realizado: "conforme_planejado",
          inicio_real: rotina.inicio_planejado,
          fim_real: rotina.fim_planejado,
          tempo_real_min: rotina.tempo_previsto_min,
          justificativa: "",
          observacao: "Confirmado na linha: realizado conforme o planejamento.",
          supervisor_id: sessao.id,
          epis_confirmados: "",
        },
        { confirmacaoRapida: true },
      ),
      201,
    );
  });
}
