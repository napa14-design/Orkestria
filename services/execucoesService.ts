/**
 * Serviço de execuções realizadas (Fase 2).
 *
 * A estrutura completa (tipos, aba no Sheets, API) já existe no MVP para que
 * a Fase 2 seja apenas a construção da tela de acompanhamento.
 */
import { cobraDesvio, exigeJustificativa } from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { ExecucaoRealizada, StatusRealizado, StatusRotina } from "@/types";
import { ErroValidacao } from "./erros";
import { resolverParametros } from "./parametrosService";

const STATUS_ROTINA_POR_EXECUCAO: Record<StatusRealizado, StatusRotina> = {
  conforme_planejado: "realizada",
  com_atraso: "realizada",
  parcial: "realizada",
  nao_realizada: "nao_realizada",
  remanejada: "remanejada",
  cancelada: "cancelada",
};

export async function getExecucoes(
  de?: string,
  ate?: string,
  sedeId?: string,
): Promise<ExecucaoRealizada[]> {
  const ds = await getDataSource();
  // Com sede: composta (sede_id + intervalo em data_execucao) → lê só as
  // execuções daquela sede (índice composto em firestore.indexes.json). Sem
  // sede: range só em data_execucao.
  const cond = [];
  if (sedeId) cond.push({ campo: "sede_id", op: "==" as const, valor: sedeId });
  if (de) cond.push({ campo: "data_execucao", op: ">=" as const, valor: de });
  if (ate) cond.push({ campo: "data_execucao", op: "<=" as const, valor: ate });
  return cond.length
    ? ds.consultar("execucoes_realizadas", cond)
    : ds.listar("execucoes_realizadas");
}

export async function registrarExecucao(
  // sede_id é preenchida aqui a partir da rotina (o cliente não envia).
  dados: Omit<ExecucaoRealizada, "id" | "sede_id" | "criado_em" | "atualizado_em">,
  opcoes?: { confirmacaoRapida?: boolean },
): Promise<ExecucaoRealizada> {
  const ds = await getDataSource();
  const rotina = await ds.obter("rotinas_planejadas", dados.rotina_id);
  if (!rotina) throw new Error("Rotina planejada não encontrada.");
  const comSede = { ...dados, sede_id: rotina.sede_id };

  const parametros = await resolverParametros(rotina.sede_id);
  // Tarefa com "tempo é referência" não cobra desvio (execução varia muito).
  const tarefa = await ds.obter("tarefas", rotina.tarefa_id);

  // O caminho de um toque não pode afirmar uso de EPI sem a declaração humana.
  // A UI já esconde o atalho, e esta validação fecha também chamadas diretas.
  if (opcoes?.confirmacaoRapida && tarefa?.requisitos) {
    const requisitos = await Promise.all(
      tarefa.requisitos
        .split(",")
        .filter(Boolean)
        .map((id) => ds.obter("requisitos", id)),
    );
    if (requisitos.some((requisito) => requisito?.tipo === "epi")) {
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "EPI_EXIGE_CONFIRMACAO",
          mensagem: "Esta tarefa exige confirmação de EPI no formulário completo.",
        },
      ]);
    }
  }

  // Regras de justificativa obrigatória.
  const statusQueExigem: StatusRealizado[] = ["nao_realizada", "remanejada", "cancelada"];
  const desvioGrande =
    cobraDesvio(tarefa) &&
    dados.tempo_real_min > 0 &&
    exigeJustificativa(dados.tempo_real_min, rotina.tempo_previsto_min, parametros);
  if ((statusQueExigem.includes(dados.status_realizado) || desvioGrande) && !dados.justificativa.trim()) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "JUSTIFICATIVA_OBRIGATORIA",
        mensagem: desvioGrande
          ? `Desvio acima de ${parametros.desvio_justificativa_percentual}% do previsto exige justificativa.`
          : "Este status exige justificativa.",
      },
    ]);
  }

  const agora = agoraISO();
  const registro = { ...comSede, epis_confirmados: comSede.epis_confirmados ?? "" };

  // Idempotência: uma execução por (rotina, data). Reenviar a mesma ficha
  // ATUALIZA o registro em vez de duplicar.
  const doRotina = await ds.consultar("execucoes_realizadas", [
    { campo: "rotina_id", op: "==" as const, valor: registro.rotina_id },
  ]);
  const existente = doRotina.find((e) => e.data_execucao === registro.data_execucao);

  let execucao: ExecucaoRealizada;
  if (existente) {
    execucao = await ds.atualizar("execucoes_realizadas", existente.id, {
      ...registro,
      atualizado_em: agora,
    });
  } else {
    execucao = { id: novoId(), ...registro, criado_em: agora, atualizado_em: agora };
    await ds.criar("execucoes_realizadas", execucao);
  }

  // Sincroniza o status da rotina planejada.
  await ds.atualizar("rotinas_planejadas", rotina.id, {
    status: STATUS_ROTINA_POR_EXECUCAO[registro.status_realizado],
    atualizado_em: agora,
  });

  return execucao;
}
