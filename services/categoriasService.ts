import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Categoria } from "@/types";
import { ErroValidacao } from "./erros";

type DadosCategoria = Omit<
  Categoria,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

function validar(dados: Partial<DadosCategoria>) {
  if (!dados.nome || !dados.nome.trim())
    throw new ErroValidacao([
      { nivel: "erro", codigo: "CATEGORIA_SEM_NOME", mensagem: "Informe o nome da categoria." },
    ]);
}

export async function getCategorias(): Promise<Categoria[]> {
  const ds = await getDataSource();
  return ds.listar("categorias");
}

export async function createCategoria(dados: DadosCategoria, autor: string): Promise<Categoria> {
  validar(dados);
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("categorias", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateCategoria(
  id: string,
  mudancas: Partial<DadosCategoria>,
  autor: string,
): Promise<Categoria> {
  const ds = await getDataSource();
  const atual = await ds.obter("categorias", id);
  if (!atual) throw new Error("Categoria não encontrada.");
  validar({ ...atual, ...mudancas });
  return ds.atualizar("categorias", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando há tarefas vinculadas — preserva a integridade do catálogo. */
export async function deleteCategoria(id: string): Promise<void> {
  const ds = await getDataSource();
  const tarefas = await ds.consultar("tarefas", [{ campo: "categoria_id", op: "==", valor: id }]);
  if (tarefas.length > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "CATEGORIA_EM_USO",
        mensagem: `Esta categoria tem ${tarefas.length} tarefa(s) vinculada(s). Reatribua-as ou marque a categoria como inativa em vez de excluir.`,
      },
    ]);
  }
  await ds.excluir("categorias", id);
}

/**
 * Recalibração em cascata: multiplica o `tempo_base_min` de todas as tarefas
 * da categoria pelo fator informado (ex.: 1.2 = +20%). Cada atualização é
 * logada automaticamente no histórico pelo decorator. Retorna quantas tarefas
 * foram ajustadas.
 */
export async function recalibrarCategoria(
  categoriaId: string,
  fator: number,
  autor: string,
): Promise<{ atualizadas: number }> {
  if (!Number.isFinite(fator) || fator <= 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FATOR_INVALIDO", mensagem: "O fator deve ser um número maior que zero." },
    ]);
  const ds = await getDataSource();
  const categoria = await ds.obter("categorias", categoriaId);
  if (!categoria) throw new Error("Categoria não encontrada.");
  const tarefas = await ds.consultar("tarefas", [
    { campo: "categoria_id", op: "==", valor: categoriaId },
  ]);
  const agora = agoraISO();
  for (const t of tarefas) {
    const novo = Math.round(t.tempo_base_min * fator * 100) / 100; // 2 casas
    await ds.atualizar("tarefas", t.id, {
      tempo_base_min: novo,
      atualizado_por: autor,
      atualizado_em: agora,
    });
  }
  return { atualizadas: tarefas.length };
}
