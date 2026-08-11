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
  const [funcionario, requisito] = await Promise.all([
    ds.obter("funcionarios", dados.funcionario_id),
    ds.obter("requisitos", dados.requisito_id),
  ]);
  if (!funcionario)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNC_INEXISTENTE", mensagem: "Funcionário não existe." },
    ]);
  if (!requisito)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "REQUISITO_INEXISTENTE", mensagem: "Requisito não existe." },
    ]);
  if (!requisito.ativo)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "REQUISITO_INATIVO", mensagem: "Requisito está inativo." },
    ]);
  if (requisito.tipo === "epi")
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "QUALIFICACAO_EPI",
        mensagem: "EPI é exigido pela tarefa e confirmado na ficha; não é uma qualificação possuída pelo funcionário.",
      },
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

export interface ResultadoLoteQualificacoes {
  criadas: number;
  /** Pares que já existiam — o lote não mexe em validade já cadastrada. */
  ja_tinham: number;
  recusadas: number;
  /** Até 8 motivos, para a pessoa entender o que ficou de fora. */
  detalhes: string[];
}

/**
 * Lança **várias pessoas × várias capacitações** de uma vez.
 *
 * Por que existe: o cadastro era um registro por modal. Uma pessoa com 20
 * treinamentos custava 20 rodadas reescolhendo a pessoa; e o caso real é pior —
 * uma **turma** de 15 pessoas fazendo o mesmo NR na mesma data custava 15 rodadas
 * reescolhendo o treinamento. A doutrina põe **ação em massa** explicitamente na
 * implantação, que pode ser pesada; o que não pode engordar é o ato diário, e este
 * não aparece nele.
 *
 * **Não sobrescreve validade existente**: par que já existe é contado e deixado
 * como está — renovar é editar, para ninguém apagar uma data por engano num lote.
 */
export async function criarQualificacoesEmLote(
  dados: {
    funcionarioIds: string[];
    requisitoIds: string[];
    validade?: string;
    nivel?: string;
    observacao?: string;
  },
  autor: string,
): Promise<ResultadoLoteQualificacoes> {
  const funcionarioIds = [...new Set(dados.funcionarioIds ?? [])].filter(Boolean);
  const requisitoIds = [...new Set(dados.requisitoIds ?? [])].filter(Boolean);
  if (funcionarioIds.length === 0 || requisitoIds.length === 0)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "LOTE_VAZIO",
        mensagem: "Escolha ao menos uma pessoa e ao menos uma capacitação.",
      },
    ]);
  exigirNivelValido(dados.nivel);

  const ds = await getDataSource();
  // Uma leitura só: o par a criar é o produto menos o que já existe. Sem isto,
  // cada par repetiria a consulta de duplicata do caminho unitário.
  const existentes = await ds.listar("qualificacoes_funcionario");
  const jaTem = new Set(existentes.map((q) => `${q.funcionario_id}|${q.requisito_id}`));

  const res: ResultadoLoteQualificacoes = { criadas: 0, ja_tinham: 0, recusadas: 0, detalhes: [] };
  const aCriar: Array<{ funcionarioId: string; requisitoId: string }> = [];
  for (const funcionarioId of funcionarioIds) {
    for (const requisitoId of requisitoIds) {
      if (jaTem.has(`${funcionarioId}|${requisitoId}`)) res.ja_tinham++;
      else aCriar.push({ funcionarioId, requisitoId });
    }
  }

  for (let i = 0; i < aCriar.length; i += 20) {
    await Promise.all(
      aCriar.slice(i, i + 20).map(async ({ funcionarioId, requisitoId }) => {
        try {
          await createQualificacao(
            {
              funcionario_id: funcionarioId,
              requisito_id: requisitoId,
              validade: dados.validade ?? "",
              nivel: (dados.nivel ?? "apto") as QualificacaoFuncionario["nivel"],
              observacao: dados.observacao ?? "",
            },
            autor,
          );
          res.criadas++;
        } catch (e) {
          // Recusa individual não derruba o lote: o resto entra e a pessoa lê o
          // que ficou de fora.
          res.recusadas++;
          if (res.detalhes.length < 8)
            res.detalhes.push(e instanceof Error ? e.message : "Erro ao criar qualificação.");
        }
      }),
    );
  }
  return res;
}

export interface LinhaRenovacao {
  id: string;
  funcionario_nome: string;
  requisito_nome: string;
  /** Validade atual. Vazio nunca aparece aqui — quem não expira não é renovado. */
  de: string;
  para: string;
}

export interface PlanoRenovacao {
  renovaria: LinhaRenovacao[];
  /** Validade atual já é igual ou posterior à nova: renovar seria retroceder. */
  ja_em_dia: number;
  /** "Não expira": pôr prazo não é renovar, é restringir. Fica de fora. */
  sem_prazo: number;
  /** Par escolhido que a pessoa não tem — renovação não cria qualificação. */
  nao_tem: number;
}

/**
 * **Monta o plano de renovação — e não escreve nada.**
 *
 * A prévia da tela e a aplicação chamam **esta mesma função**: prévia com regra
 * própria mente, e mentir na prévia de uma escrita em massa é o pior lugar
 * possível para errar.
 *
 * Três coisas ficam **de fora** de propósito:
 * - quem já tem validade igual ou posterior (renovar seria retroceder a data);
 * - quem **não expira** — pôr prazo não é renovar, é restringir;
 * - par que a pessoa não tem — renovação não cria qualificação (isso é o lote).
 */
export async function planejarRenovacao(dados: {
  funcionarioIds: string[];
  requisitoIds: string[];
  validade: string;
}): Promise<PlanoRenovacao> {
  const funcionarioIds = new Set((dados.funcionarioIds ?? []).filter(Boolean));
  const requisitoIds = new Set((dados.requisitoIds ?? []).filter(Boolean));
  if (funcionarioIds.size === 0 || requisitoIds.size === 0 || !dados.validade)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "RENOVACAO_INCOMPLETA",
        mensagem: "Escolha pessoas, capacitações e a nova validade.",
      },
    ]);

  const ds = await getDataSource();
  const [existentes, funcionarios, requisitos] = await Promise.all([
    ds.listar("qualificacoes_funcionario"),
    ds.listar("funcionarios"),
    ds.listar("requisitos"),
  ]);
  const nomeFunc = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const nomeReq = new Map(requisitos.map((r) => [r.id, r.nome]));

  const plano: PlanoRenovacao = { renovaria: [], ja_em_dia: 0, sem_prazo: 0, nao_tem: 0 };
  const encontrados = new Set<string>();
  for (const q of existentes) {
    if (!funcionarioIds.has(q.funcionario_id) || !requisitoIds.has(q.requisito_id)) continue;
    encontrados.add(`${q.funcionario_id}|${q.requisito_id}`);
    if (!q.validade) {
      plano.sem_prazo++;
      continue;
    }
    if (q.validade >= dados.validade) {
      plano.ja_em_dia++;
      continue;
    }
    plano.renovaria.push({
      id: q.id,
      funcionario_nome: nomeFunc.get(q.funcionario_id) ?? q.funcionario_id,
      requisito_nome: nomeReq.get(q.requisito_id) ?? q.requisito_id,
      de: q.validade,
      para: dados.validade,
    });
  }
  plano.nao_tem = funcionarioIds.size * requisitoIds.size - encontrados.size;
  plano.renovaria.sort(
    (a, b) => a.funcionario_nome.localeCompare(b.funcionario_nome) || a.requisito_nome.localeCompare(b.requisito_nome),
  );
  return plano;
}

/**
 * Aplica a renovação, **recalculando o plano** antes de escrever.
 *
 * `esperado` é quantas linhas a pessoa viu na prévia: se a base mudou nesse meio
 * (alguém renovou, alguém apagou), a operação **para** e manda revisar, em vez de
 * gravar um conjunto diferente do que foi aprovado. Mesmo cuidado do
 * `resolverProximaExcecao`, que recalcula antes de mover rotina.
 */
export async function aplicarRenovacao(
  dados: { funcionarioIds: string[]; requisitoIds: string[]; validade: string; esperado?: number },
  autor: string,
): Promise<{ renovadas: number; plano: PlanoRenovacao }> {
  const plano = await planejarRenovacao(dados);
  if (dados.esperado !== undefined && dados.esperado !== plano.renovaria.length)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "PREVIA_DESATUALIZADA",
        mensagem: `A prévia mostrava ${dados.esperado} renovação(ões) e agora são ${plano.renovaria.length} — a base mudou. Revise antes de confirmar.`,
      },
    ]);

  const ds = await getDataSource();
  const agora = agoraISO();
  for (let i = 0; i < plano.renovaria.length; i += 20) {
    await Promise.all(
      plano.renovaria.slice(i, i + 20).map((linha) =>
        ds.atualizar("qualificacoes_funcionario", linha.id, {
          validade: linha.para,
          atualizado_por: autor,
          atualizado_em: agora,
        }),
      ),
    );
  }
  return { renovadas: plano.renovaria.length, plano };
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
  const funcionarioId = mudancas.funcionario_id ?? atual.funcionario_id;
  const requisitoId = mudancas.requisito_id ?? atual.requisito_id;
  const [funcionario, requisito, existentes] = await Promise.all([
    ds.obter("funcionarios", funcionarioId),
    ds.obter("requisitos", requisitoId),
    ds.consultar("qualificacoes_funcionario", [
      { campo: "funcionario_id", op: "==", valor: funcionarioId },
    ]),
  ]);
  if (!funcionario)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNC_INEXISTENTE", mensagem: "Funcionário não existe." },
    ]);
  if (!requisito)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "REQUISITO_INEXISTENTE", mensagem: "Requisito não existe." },
    ]);
  if (!requisito.ativo)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "REQUISITO_INATIVO", mensagem: "Requisito está inativo." },
    ]);
  if (requisito.tipo === "epi")
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "QUALIFICACAO_EPI",
        mensagem: "EPI é exigido pela tarefa e confirmado na ficha; não é uma qualificação.",
      },
    ]);
  if (existentes.some((q) => q.id !== id && q.requisito_id === requisitoId))
    throw new ErroValidacao([
      { nivel: "erro", codigo: "DUPLICADO", mensagem: "Este funcionário já tem essa qualificação." },
    ]);
  return ds.atualizar("qualificacoes_funcionario", id, {
    ...mudancas,
    funcionario_id: funcionarioId,
    requisito_id: requisitoId,
    sede_id: funcionario.sede_id,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteQualificacao(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("qualificacoes_funcionario", id);
}
