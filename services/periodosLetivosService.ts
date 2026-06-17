import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { PeriodoLetivo } from "@/types";
import { ErroValidacao } from "./erros";

type DadosPeriodoLetivo = Omit<
  PeriodoLetivo,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

export async function getPeriodosLetivos(filtro?: {
  sedeId?: string;
}): Promise<PeriodoLetivo[]> {
  const ds = await getDataSource();
  // Quando há sede (caso comum), lê só os períodos da sede; senão, todos.
  const base = filtro?.sedeId
    ? await ds.consultar("periodos_letivos", [
        { campo: "sede_id", op: "==", valor: filtro.sedeId },
      ])
    : await ds.listar("periodos_letivos");
  // mais recente primeiro
  return base.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
}

function validar(dados: Partial<DadosPeriodoLetivo>) {
  const erros = [];
  if (!dados.sede_id)
    erros.push({ nivel: "erro" as const, codigo: "SEM_SEDE", mensagem: "Informe a sede." });
  if (!dados.nome?.trim())
    erros.push({ nivel: "erro" as const, codigo: "SEM_NOME", mensagem: "Informe o nome do período (ex.: 2026.2)." });
  if (!dados.data_inicio || !dados.data_fim || dados.data_inicio > dados.data_fim)
    erros.push({
      nivel: "erro" as const,
      codigo: "PERIODO_INVALIDO",
      mensagem: "Período inválido: a data final deve ser igual ou posterior à inicial.",
    });
  if (erros.length > 0) throw new ErroValidacao(erros);
}

export async function createPeriodoLetivo(
  dados: DadosPeriodoLetivo,
  autor: string,
): Promise<PeriodoLetivo> {
  validar(dados);
  const ds = await getDataSource();
  const sede = await ds.obter("sedes", dados.sede_id);
  if (!sede) throw new Error("Sede não encontrada.");

  const agora = agoraISO();
  return ds.criar("periodos_letivos", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updatePeriodoLetivo(
  id: string,
  mudancas: Partial<DadosPeriodoLetivo>,
  autor: string,
): Promise<PeriodoLetivo> {
  const ds = await getDataSource();
  const atual = await ds.obter("periodos_letivos", id);
  if (!atual) throw new Error("Período letivo não encontrado.");
  validar({ ...atual, ...mudancas });
  return ds.atualizar("periodos_letivos", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deletePeriodoLetivo(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("periodos_letivos", id);
}
