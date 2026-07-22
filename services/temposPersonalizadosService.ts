import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { TempoPersonalizado } from "@/types";
import { ErroValidacao } from "./erros";

type Dados = Omit<
  TempoPersonalizado,
  "id" | "sede_id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

export async function getTemposPersonalizados(sede?: string): Promise<TempoPersonalizado[]> {
  const ds = await getDataSource();
  return sede
    ? ds.consultar("tempos_personalizados", [{ campo: "sede_id", op: "==", valor: sede }])
    : ds.listar("tempos_personalizados");
}

/** Tempo pessoal de um funcionário numa tarefa (ou null). Usado no planejamento. */
export async function getTempoPessoal(
  funcionarioId: string,
  tarefaId: string,
): Promise<number | null> {
  const ds = await getDataSource();
  const achados = await ds.consultar("tempos_personalizados", [
    { campo: "funcionario_id", op: "==", valor: funcionarioId },
  ]);
  const t = achados.find((x) => x.tarefa_id === tarefaId);
  return t ? t.tempo_min : null;
}

export async function createTempoPersonalizado(dados: Dados, autor: string): Promise<TempoPersonalizado> {
  if (!dados.funcionario_id || !dados.tarefa_id)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FALTAM_CAMPOS", mensagem: "Informe funcionário e tarefa." },
    ]);
  if (dados.tempo_min == null || dados.tempo_min <= 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TEMPO_INVALIDO", mensagem: "Informe um tempo (minutos) maior que zero." },
    ]);
  const ds = await getDataSource();
  const funcionario = await ds.obter("funcionarios", dados.funcionario_id);
  if (!funcionario)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNC_INEXISTENTE", mensagem: "Funcionário não existe." },
    ]);
  const tarefa = await ds.obter("tarefas", dados.tarefa_id);
  if (!tarefa)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TAREFA_INEXISTENTE", mensagem: "Tarefa não existe." },
    ]);
  // um único tempo por (funcionário, tarefa)
  const existentes = await ds.consultar("tempos_personalizados", [
    { campo: "funcionario_id", op: "==", valor: dados.funcionario_id },
  ]);
  if (existentes.some((x) => x.tarefa_id === dados.tarefa_id))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "DUPLICADO",
        mensagem: "Já existe um tempo personalizado para este funcionário nesta tarefa. Edite o existente.",
      },
    ]);
  const agora = agoraISO();
  return ds.criar("tempos_personalizados", {
    id: novoId(),
    ...dados,
    tempo_min: Math.round(dados.tempo_min),
    sede_id: funcionario.sede_id,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateTempoPersonalizado(
  id: string,
  mudancas: Partial<Dados>,
  autor: string,
): Promise<TempoPersonalizado> {
  const ds = await getDataSource();
  const atual = await ds.obter("tempos_personalizados", id);
  if (!atual) throw new Error("Registro não encontrado.");
  if (mudancas.tempo_min != null && mudancas.tempo_min <= 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TEMPO_INVALIDO", mensagem: "Informe um tempo (minutos) maior que zero." },
    ]);
  const funcionarioId = mudancas.funcionario_id ?? atual.funcionario_id;
  const tarefaId = mudancas.tarefa_id ?? atual.tarefa_id;
  const [funcionario, tarefa, existentes] = await Promise.all([
    ds.obter("funcionarios", funcionarioId),
    ds.obter("tarefas", tarefaId),
    ds.consultar("tempos_personalizados", [
      { campo: "funcionario_id", op: "==", valor: funcionarioId },
    ]),
  ]);
  if (!funcionario)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNC_INEXISTENTE", mensagem: "Funcionário não existe." },
    ]);
  if (!tarefa)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TAREFA_INEXISTENTE", mensagem: "Tarefa não existe." },
    ]);
  if (existentes.some((x) => x.id !== id && x.tarefa_id === tarefaId))
    throw new ErroValidacao([
      { nivel: "erro", codigo: "DUPLICADO", mensagem: "Já existe um tempo para esta pessoa e tarefa." },
    ]);
  return ds.atualizar("tempos_personalizados", id, {
    ...mudancas,
    funcionario_id: funcionarioId,
    tarefa_id: tarefaId,
    sede_id: funcionario.sede_id,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteTempoPersonalizado(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("tempos_personalizados", id);
}
