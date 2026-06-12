import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Ausencia } from "@/types";
import { ErroValidacao } from "./erros";

type DadosAusencia = Omit<
  Ausencia,
  "id" | "sede_id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

export async function getAusencias(filtro?: {
  de?: string;
  ate?: string;
  data?: string;
  sedeId?: string;
}): Promise<Ausencia[]> {
  const ds = await getDataSource();
  const todas = await ds.listar("ausencias");
  return todas.filter((a) => {
    if (filtro?.sedeId && a.sede_id !== filtro.sedeId) return false;
    if (filtro?.data) return a.data_inicio <= filtro.data && filtro.data <= a.data_fim;
    if (filtro?.de && a.data_fim < filtro.de) return false;
    if (filtro?.ate && a.data_inicio > filtro.ate) return false;
    return true;
  });
}

/** Ausência ativa do funcionário em uma data, ou null. */
export async function ausenteEm(
  funcionarioId: string,
  data: string,
): Promise<Ausencia | null> {
  const ds = await getDataSource();
  const todas = await ds.listar("ausencias");
  return (
    todas.find(
      (a) =>
        a.funcionario_id === funcionarioId &&
        a.data_inicio <= data &&
        data <= a.data_fim,
    ) ?? null
  );
}

export async function createAusencia(
  dados: DadosAusencia,
  autor: string,
): Promise<Ausencia> {
  const erros = [];
  if (!dados.funcionario_id)
    erros.push({ nivel: "erro" as const, codigo: "SEM_FUNCIONARIO", mensagem: "Informe o funcionário." });
  if (!dados.data_inicio || !dados.data_fim || dados.data_inicio > dados.data_fim)
    erros.push({ nivel: "erro" as const, codigo: "PERIODO_INVALIDO", mensagem: "Período inválido: a data final deve ser igual ou posterior à inicial." });
  if (erros.length > 0) throw new ErroValidacao(erros);

  const ds = await getDataSource();
  const funcionario = await ds.obter("funcionarios", dados.funcionario_id);
  if (!funcionario) throw new Error("Funcionário não encontrado.");

  const agora = agoraISO();
  return ds.criar("ausencias", {
    id: novoId(),
    ...dados,
    sede_id: funcionario.sede_id, // herdada do funcionário
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateAusencia(
  id: string,
  mudancas: Partial<DadosAusencia>,
  autor: string,
): Promise<Ausencia> {
  const ds = await getDataSource();
  const atual = await ds.obter("ausencias", id);
  if (!atual) throw new Error("Ausência não encontrada.");
  const inicio = mudancas.data_inicio ?? atual.data_inicio;
  const fim = mudancas.data_fim ?? atual.data_fim;
  if (inicio > fim)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "PERIODO_INVALIDO", mensagem: "Período inválido." },
    ]);
  return ds.atualizar("ausencias", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteAusencia(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("ausencias", id);
}
