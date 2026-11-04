import { horaValida, MAX_MINUTOS_EVENTUAL, minutosDoEventual } from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { dataReal } from "@/lib/dateUtils";
import type { ServicoEventual } from "@/types";
import { ErroValidacao } from "./erros";

type DadosEventual = Omit<
  ServicoEventual,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

/**
 * Só o que o formulário preenche. Espalhar o corpo deixava gravar `criado_por` e
 * `criado_em`, e a autoria do lançamento é o que sobra para conferir quem mede o quê.
 */
function soCamposDoEventual<T extends Partial<DadosEventual>>(corpo: T): T {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo))
    throw new ErroValidacao([{ nivel: "erro", codigo: "CORPO_INVALIDO", mensagem: "Lançamento inválido." }]);
  const CAMPOS = ["sede_id", "funcionario_id", "local_id", "categoria_id", "data", "tipo", "descricao", "inicio", "fim", "tempo_min", "observacao", "supervisor_id"] as const;
  return Object.fromEntries(CAMPOS.filter((c) => c in corpo).map((c) => [c, corpo[c]])) as T;
}

function validar(dados: Partial<DadosEventual>) {
  const erros = [];
  if (!dados.sede_id) erros.push({ nivel: "erro" as const, codigo: "SEM_SEDE", mensagem: "Informe a sede." });
  // Id que não é texto derruba o `doc()` do Firestore: viraria 500 em vez de recusa.
  if ([dados.sede_id, dados.funcionario_id, dados.local_id, dados.categoria_id, dados.supervisor_id].some((v) => v != null && typeof v !== "string"))
    erros.push({ nivel: "erro" as const, codigo: "VINCULO_INVALIDO", mensagem: "Sede, funcionário, local ou categoria inválidos." });
  if (typeof dados.descricao !== "string" || !dados.descricao.trim())
    erros.push({ nivel: "erro" as const, codigo: "SEM_DESCRICAO", mensagem: "Descreva o serviço/ocorrência." });
  // A data entra na conta da ocupação: uma inválida criava um dia fantasma no período.
  if (typeof dados.data !== "string" || !dataReal(dados.data))
    erros.push({ nivel: "erro" as const, codigo: "DATA_INVALIDA", mensagem: "Informe uma data válida." });
  if (dados.tipo !== "eventual" && dados.tipo !== "imprevisto")
    erros.push({ nivel: "erro" as const, codigo: "TIPO_INVALIDO", mensagem: "Escolha o tipo." });
  if (dados.observacao != null && typeof dados.observacao !== "string")
    erros.push({ nivel: "erro" as const, codigo: "OBSERVACAO_INVALIDA", mensagem: "Observação inválida." });
  for (const hora of [dados.inicio, dados.fim])
    if (hora != null && hora !== "" && !horaValida(hora))
      erros.push({ nivel: "erro" as const, codigo: "HORA_INVALIDA", mensagem: "Informe um horário válido (HH:mm)." });
  const comHorario = horaValida(dados.inicio) && horaValida(dados.fim);
  // Com horário invertido, nada contaria e a queixa original voltaria sem aviso.
  if (comHorario && dados.fim! <= dados.inicio!)
    erros.push({ nivel: "erro" as const, codigo: "HORARIO_INVERTIDO", mensagem: "O fim precisa ser depois do início." });
  // Com horário, o tempo digitado é descartado: não há por que recusar por causa dele.
  // Sem horário, tem de haver tempo: com 0, gravava e o mostrador não mudava, a mesma
  // queixa que trouxe o eventual para a ocupação (auditoria, 04/11/2026).
  const tempoCru = dados.tempo_min as unknown;
  const tempo = typeof tempoCru === "number" || (typeof tempoCru === "string" && tempoCru.trim()) ? Number(tempoCru) : NaN;
  // Depois de arredondar: é o que grava, e 0,4 min viraria o mesmo zero.
  if (!comHorario && (!Number.isFinite(tempo) || Math.round(tempo) <= 0 || tempo > MAX_MINUTOS_EVENTUAL))
    erros.push({ nivel: "erro" as const, codigo: "TEMPO_INVALIDO", mensagem: "Informe início e fim, ou o tempo em minutos (até 1.440)." });
  if (erros.length) throw new ErroValidacao(erros);
}

async function validarVinculos(dados: DadosEventual): Promise<void> {
  const ds = await getDataSource();
  const [sede, funcionario, local, categoria] = await Promise.all([
    ds.obter("sedes", dados.sede_id),
    dados.funcionario_id ? ds.obter("funcionarios", dados.funcionario_id) : Promise.resolve(null),
    dados.local_id ? ds.obter("locais", dados.local_id) : Promise.resolve(null),
    dados.categoria_id ? ds.obter("categorias", dados.categoria_id) : Promise.resolve(null),
  ]);
  const erros = [];
  if (!sede)
    erros.push({ nivel: "erro" as const, codigo: "SEDE_INEXISTENTE", mensagem: "Sede informada não existe." });
  if (dados.funcionario_id && !funcionario)
    erros.push({ nivel: "erro" as const, codigo: "FUNC_INEXISTENTE", mensagem: "Funcionário não existe." });
  else if (funcionario && funcionario.sede_id !== dados.sede_id)
    erros.push({ nivel: "erro" as const, codigo: "FUNC_OUTRA_SEDE", mensagem: "Funcionário não pertence à sede informada." });
  if (dados.local_id && !local)
    erros.push({ nivel: "erro" as const, codigo: "LOCAL_INEXISTENTE", mensagem: "Local não existe." });
  else if (local && local.sede_id !== dados.sede_id)
    erros.push({ nivel: "erro" as const, codigo: "LOCAL_OUTRA_SEDE", mensagem: "Local não pertence à sede informada." });
  if (dados.categoria_id && !categoria)
    erros.push({ nivel: "erro" as const, codigo: "CATEGORIA_INEXISTENTE", mensagem: "Categoria não existe." });
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
  corpo: DadosEventual,
  autor: string,
): Promise<ServicoEventual> {
  const dados = soCamposDoEventual(corpo);
  validar(dados);
  await validarVinculos(dados);
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("servicos_eventuais", {
    ...dados,
    id: novoId(), // depois do spread: id do corpo não sobrescreve registro alheio
    // Com início e fim, grava o tempo do horário: é ele que conta na ocupação, e a
    // lista mostrava outro número quando o digitado era diferente.
    tempo_min: Math.round(minutosDoEventual(dados)),
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateServicoEventual(
  id: string,
  corpo: Partial<DadosEventual>,
  autor: string,
): Promise<ServicoEventual> {
  // `supervisor_id` é de quem registrou: a rota o define na criação, e editar não muda.
  const { supervisor_id: _registrouQuem, ...mudancas } = soCamposDoEventual(corpo);
  const ds = await getDataSource();
  const atual = await ds.obter("servicos_eventuais", id);
  if (!atual) throw new Error("Registro não encontrado.");
  const destino = { ...atual, ...mudancas };
  validar(destino);
  await validarVinculos(destino);
  return ds.atualizar("servicos_eventuais", id, {
    ...mudancas,
    tempo_min: Math.round(minutosDoEventual(destino)),
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteServicoEventual(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("servicos_eventuais", id);
}
