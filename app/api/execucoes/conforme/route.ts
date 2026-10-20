import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeRegistrarRealizado } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { episDaTarefa, registrarExecucao } from "@/services/execucoesService";

/**
 * POST /api/execucoes/conforme { rotina_id, declaro_epi? }
 *
 * "Foi feita como planejado" em um toque. Tarefa que exige EPI só passa com
 * `declaro_epi: true` — o toque É a declaração (decisão do dono, 20/10/2026,
 * para o supervisor de chão não preencher um formulário por tarefa), e os nomes
 * gravados são os do cadastro da tarefa, nunca uma lista vinda do cliente. Sem a
 * declaração, segue a regra antiga: o atalho não afirma uso de EPI. Vale para
 * todo perfil que registra o realizado (o coordenador já declara EPI pelo
 * formulário e pelo fechamento); a tela só oferece o toque ao supervisor.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeRegistrarRealizado(sessao)) throw new ErroPermissao();
    const { rotina_id, declaro_epi } = (await req.json()) as { rotina_id?: string; declaro_epi?: unknown };
    const ds = await getDataSource();
    const rotina = rotina_id ? await ds.obter("rotinas_planejadas", rotina_id) : null;
    if (!rotina) throw new Error("Rotina planejada não encontrada.");
    if (!podeAlterarSede(sessao, rotina.sede_id))
      throw new ErroPermissao("Só se registra execução das sedes que você opera.");

    const epis = declaro_epi === true ? await episDaTarefa(rotina.tarefa_id) : [];
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
          observacao:
            epis.length > 0
              ? "Confirmado na linha, com declaração de uso dos EPIs."
              : "Confirmado na linha: realizado conforme o planejamento.",
          supervisor_id: sessao.id,
          epis_confirmados: epis.join(", "),
        },
        // Com a declaração feita, o registro vale como o formulário completo.
        { perfil: sessao.perfil, confirmacaoRapida: epis.length === 0 },
      ),
      201,
    );
  });
}
