import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Requisito } from "@/types";
import { ErroValidacao } from "./erros";

type Dados = Omit<
  Requisito,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

function validar(dados: Partial<Dados>) {
  if (!dados.nome || !dados.nome.trim())
    throw new ErroValidacao([
      { nivel: "erro", codigo: "SEM_NOME", mensagem: "Informe o nome do requisito." },
    ]);
  if (dados.tipo && !["aptidao", "treinamento", "epi"].includes(dados.tipo))
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TIPO_INVALIDO", mensagem: "Tipo inválido." },
    ]);
}

export async function getRequisitos(): Promise<Requisito[]> {
  const ds = await getDataSource();
  return ds.listar("requisitos");
}

export async function createRequisito(dados: Dados, autor: string): Promise<Requisito> {
  validar(dados);
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("requisitos", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateRequisito(
  id: string,
  mudancas: Partial<Dados>,
  autor: string,
): Promise<Requisito> {
  const ds = await getDataSource();
  const atual = await ds.obter("requisitos", id);
  if (!atual) throw new Error("Requisito não encontrado.");
  validar({ ...atual, ...mudancas });
  return ds.atualizar("requisitos", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando alguma tarefa ou qualificação o referencia. */
export async function deleteRequisito(id: string): Promise<void> {
  const ds = await getDataSource();
  const [tarefas, qualificacoes] = await Promise.all([
    ds.listar("tarefas"),
    ds.consultar("qualificacoes_funcionario", [{ campo: "requisito_id", op: "==", valor: id }]),
  ]);
  const emUso = tarefas.filter((t) => (t.requisitos ?? "").split(",").includes(id)).length;
  const vinculos = emUso + qualificacoes.length;
  if (vinculos > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "REQUISITO_EM_USO",
        mensagem: `Este requisito tem ${vinculos} vínculo(s) em tarefa(s)/qualificação(ões). Remova-os ou marque-o como inativo.`,
      },
    ]);
  }
  await ds.excluir("requisitos", id);
}
