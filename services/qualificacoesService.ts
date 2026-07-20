import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { NIVEL_ORDEM, type QualificacaoFuncionario } from "@/types";
import { ErroValidacao } from "./erros";

type Dados = Omit<
  QualificacaoFuncionario,
  "id" | "sede_id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

/** O nível vem do cliente — só aceita os degraus conhecidos (vazio = apto). */
function exigirNivelValido(nivel: unknown) {
  if (nivel === undefined || nivel === null || nivel === "") return;
  // hasOwn (e não `in`): `in` percorre o protótipo e aceitaria "toString".
  if (!(typeof nivel === "string" && Object.hasOwn(NIVEL_ORDEM, nivel)))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "NIVEL_INVALIDO",
        mensagem: `Nível "${String(nivel)}" não existe. Use ${Object.keys(NIVEL_ORDEM).join(", ")}.`,
      },
    ]);
}

export async function getQualificacoes(sede?: string): Promise<QualificacaoFuncionario[]> {
  const ds = await getDataSource();
  return sede
    ? ds.consultar("qualificacoes_funcionario", [{ campo: "sede_id", op: "==", valor: sede }])
    : ds.listar("qualificacoes_funcionario");
}

/** Qualificações de um funcionário (para a validação de alocação). */
export async function getQualificacoesDoFuncionario(
  funcionarioId: string,
): Promise<QualificacaoFuncionario[]> {
  const ds = await getDataSource();
  return ds.consultar("qualificacoes_funcionario", [
    { campo: "funcionario_id", op: "==", valor: funcionarioId },
  ]);
}

export async function createQualificacao(dados: Dados, autor: string): Promise<QualificacaoFuncionario> {
  if (!dados.funcionario_id || !dados.requisito_id)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FALTAM_CAMPOS", mensagem: "Informe funcionário e requisito." },
    ]);
  exigirNivelValido(dados.nivel);
  const ds = await getDataSource();
  const funcionario = await ds.obter("funcionarios", dados.funcionario_id);
  if (!funcionario)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNC_INEXISTENTE", mensagem: "Funcionário não existe." },
    ]);
  const existentes = await ds.consultar("qualificacoes_funcionario", [
    { campo: "funcionario_id", op: "==", valor: dados.funcionario_id },
  ]);
  if (existentes.some((q) => q.requisito_id === dados.requisito_id))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "DUPLICADO",
        mensagem: "Este funcionário já tem essa qualificação. Edite a existente (ex.: renovar validade).",
      },
    ]);
  const agora = agoraISO();
  return ds.criar("qualificacoes_funcionario", {
    id: novoId(),
    ...dados,
    sede_id: funcionario.sede_id,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateQualificacao(
  id: string,
  mudancas: Partial<Dados>,
  autor: string,
): Promise<QualificacaoFuncionario> {
  exigirNivelValido(mudancas.nivel);
  const ds = await getDataSource();
  const atual = await ds.obter("qualificacoes_funcionario", id);
  if (!atual) throw new Error("Qualificação não encontrada.");
  return ds.atualizar("qualificacoes_funcionario", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteQualificacao(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("qualificacoes_funcionario", id);
}
