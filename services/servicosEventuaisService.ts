import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { ServicoEventual } from "@/types";
import { ErroValidacao } from "./erros";

type DadosEventual = Omit<
  ServicoEventual,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

function validar(dados: Partial<DadosEventual>) {
  const erros = [];
  if (!dados.sede_id) erros.push({ nivel: "erro" as const, codigo: "SEM_SEDE", mensagem: "Informe a sede." });
  if (!dados.descricao || !dados.descricao.trim())
    erros.push({ nivel: "erro" as const, codigo: "SEM_DESCRICAO", mensagem: "Descreva o serviço/ocorrência." });
  if (dados.tempo_min == null || dados.tempo_min < 0)
    erros.push({ nivel: "erro" as const, codigo: "TEMPO_INVALIDO", mensagem: "Informe um tempo (minutos) válido." });
  if (erros.length) throw new ErroValidacao(erros);
}

/** Lista por intervalo de data (campo único) + filtro de sede em memória. */
export async function getServicosEventuais(
  de?: string,
  ate?: string,
  sede?: string,
): Promise<ServicoEventual[]> {
  const ds = await getDataSource();
  const cond = [];
  if (de) cond.push({ campo: "data", op: ">=" as const, valor: de });
  if (ate) cond.push({ campo: "data", op: "<=" as const, valor: ate });
  const lista = cond.length
    ? await ds.consultar("servicos_eventuais", cond)
    : await ds.listar("servicos_eventuais");
  return sede ? lista.filter((e) => e.sede_id === sede) : lista;
}

export async function createServicoEventual(
  dados: DadosEventual,
  autor: string,
): Promise<ServicoEventual> {
  validar(dados);
  const ds = await getDataSource();
  const sede = await ds.obter("sedes", dados.sede_id);
  if (!sede)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "SEDE_INEXISTENTE", mensagem: "Sede informada não existe." },
    ]);
  const agora = agoraISO();
  return ds.criar("servicos_eventuais", {
    id: novoId(),
    ...dados,
    tempo_min: Math.round(dados.tempo_min),
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateServicoEventual(
  id: string,
  mudancas: Partial<DadosEventual>,
  autor: string,
): Promise<ServicoEventual> {
  const ds = await getDataSource();
  const atual = await ds.obter("servicos_eventuais", id);
  if (!atual) throw new Error("Registro não encontrado.");
  validar({ ...atual, ...mudancas });
  return ds.atualizar("servicos_eventuais", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteServicoEventual(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("servicos_eventuais", id);
}
