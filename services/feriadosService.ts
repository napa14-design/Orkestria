import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Feriado } from "@/types";
import { ErroValidacao } from "./erros";

type DadosFeriado = Omit<
  Feriado,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

/**
 * Feriados/recessos. **Sempre devolve os globais** (`sede_id` vazio) junto com os
 * da sede pedida — o global é o caso comum, e filtrar só pela sede esconderia o
 * feriado nacional.
 */
export async function getFeriados(filtro?: { sedeId?: string }): Promise<Feriado[]> {
  const ds = await getDataSource();
  // Coleção pequena (uma dúzia por ano): ler tudo e filtrar em memória custa menos
  // que duas consultas, e não existe `OR` em consulta de campo único.
  const todos = await ds.listar("feriados");
  const filtrados = filtro?.sedeId
    ? todos.filter((f) => !f.sede_id || f.sede_id === filtro.sedeId)
    : todos;
  return filtrados.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
}

function validar(dados: Partial<DadosFeriado>) {
  const erros = [];
  if (!dados.nome?.trim())
    erros.push({
      nivel: "erro" as const,
      codigo: "SEM_NOME",
      mensagem: "Diga o que é (ex.: Independência, Recesso de julho).",
    });
  if (!dados.data_inicio || !dados.data_fim || dados.data_inicio > dados.data_fim)
    erros.push({
      nivel: "erro" as const,
      codigo: "INTERVALO_INVALIDO",
      mensagem: "Intervalo inválido: a data final deve ser igual ou posterior à inicial.",
    });
  if (erros.length > 0) throw new ErroValidacao(erros);
}

export async function createFeriado(dados: DadosFeriado, autor: string): Promise<Feriado> {
  validar(dados);
  const ds = await getDataSource();
  // Sede vazia é intencional (vale para todas); preenchida, tem de existir.
  if (dados.sede_id && !(await ds.obter("sedes", dados.sede_id)))
    throw new Error("Sede não encontrada.");

  const agora = agoraISO();
  return ds.criar("feriados", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateFeriado(
  id: string,
  mudancas: Partial<DadosFeriado>,
  autor: string,
): Promise<Feriado> {
  const ds = await getDataSource();
  const atual = await ds.obter("feriados", id);
  if (!atual) throw new Error("Feriado não encontrado.");
  validar({ ...atual, ...mudancas });
  return ds.atualizar("feriados", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteFeriado(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("feriados", id);
}
