import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { validarFuncionario, temErro } from "@/lib/validations";
import type { Funcionario } from "@/types";
import { ErroValidacao } from "./erros";

type DadosFuncionario = Omit<
  Funcionario,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

export async function getFuncionarios(sedeId?: string): Promise<Funcionario[]> {
  const ds = await getDataSource();
  return sedeId
    ? ds.consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: sedeId }])
    : ds.listar("funcionarios");
}

export async function createFuncionario(
  dados: DadosFuncionario,
  autor: string,
): Promise<Funcionario> {
  const alertas = validarFuncionario(dados);
  if (temErro(alertas)) throw new ErroValidacao(alertas);
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("funcionarios", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateFuncionario(
  id: string,
  mudancas: Partial<DadosFuncionario>,
  autor: string,
): Promise<Funcionario> {
  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  const alertas = validarFuncionario({ ...atual, ...mudancas });
  if (temErro(alertas)) throw new ErroValidacao(alertas);
  return ds.atualizar("funcionarios", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando há histórico — inativar preserva relatórios antigos. */
export async function deleteFuncionario(id: string): Promise<void> {
  const ds = await getDataSource();
  const [rotinas, ausencias] = await Promise.all([
    ds.listar("rotinas_planejadas"),
    ds.listar("ausencias"),
  ]);
  const vinculos =
    rotinas.filter((r) => r.funcionario_id === id).length +
    ausencias.filter((a) => a.funcionario_id === id).length;
  if (vinculos > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSSUI_HISTORICO",
        mensagem: `Este funcionário tem ${vinculos} registro(s) de rotina/ausência. Excluir apagaria o histórico dos relatórios — use "Editar" e marque como Inativo.`,
      },
    ]);
  }
  await ds.excluir("funcionarios", id);
}
