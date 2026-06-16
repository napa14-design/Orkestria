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

export async function getExecucoes(de?: string, ate?: string): Promise<ExecucaoRealizada[]> {
  const ds = await getDataSource();
  // intervalo sobre data_execucao (campo único — sem índice composto)
  const cond = [];
  if (de) cond.push({ campo: "data_execucao", op: ">=" as const, valor: de });
  if (ate) cond.push({ campo: "data_execucao", op: "<=" as const, valor: ate });
  return cond.length
    ? ds.consultar("execucoes_realizadas", cond)
    : ds.listar("execucoes_realizadas");
}

export async function registrarExecucao(
  dados: Omit<ExecucaoRealizada, "id" | "criado_em" | "atualizado_em">,
): Promise<ExecucaoRealizada> {
  const ds = await getDataSource();
  const rotina = await ds.obter("rotinas_planejadas", dados.rotina_id);
  if (!rotina) throw new Error("Rotina planejada não encontrada.");

  const parametros = await resolverParametros(rotina.sede_id);
  // Tarefa com "tempo é referência" não cobra desvio (execução varia muito).
  const tarefa = await ds.obter("tarefas", rotina.tarefa_id);

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
  const execucao: ExecucaoRealizada = {
    id: novoId(),
    ...dados,
    criado_em: agora,
    atualizado_em: agora,
  };
  await ds.criar("execucoes_realizadas", execucao);

  // Sincroniza o status da rotina planejada.
  await ds.atualizar("rotinas_planejadas", rotina.id, {
    status: STATUS_ROTINA_POR_EXECUCAO[dados.status_realizado],
    atualizado_em: agora,
  });

  return execucao;
}
