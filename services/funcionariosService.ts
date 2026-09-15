import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { csvDoTrio, sincronizarTrio } from "@/lib/intervalos";
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
  const comIntervalos = { ...dados, intervalos: csvDoTrio(dados) };
  const alertas = validarFuncionario(comIntervalos);
  if (temErro(alertas)) throw new ErroValidacao(alertas);
  const ds = await getDataSource();
  const sede = await ds.obter("sedes", dados.sede_id);
  if (!sede)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNCIONARIO_SEM_SEDE", mensagem: "Sede informada não existe." },
    ]);
  const agora = agoraISO();
  return ds.criar("funcionarios", {
    id: novoId(),
    // `intervalos` é a fonte; o trio antigo sai derivado dela, para os dois
    // nunca mais discordarem (ver `lib/intervalos.ts`).
    ...sincronizarTrio(comIntervalos),
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
  const destino = { ...atual, ...mudancas };
  // Duas situações diferentes que é fácil confundir:
  //  - o formulário **mandou** `intervalos` (mesmo vazio) → vale o que ele mandou;
  //    apagar todos os intervalos precisa apagar de verdade.
  //  - o campo **não veio** (cadastro antigo, chamada de API sem ele) → monta o
  //    CSV a partir do trio, senão salvar pelo formulário novo apagaria o
  //    intervalo da pessoa em silêncio.
  destino.intervalos =
    mudancas.intervalos !== undefined ? String(mudancas.intervalos).trim() : csvDoTrio(destino);
  const alertas = validarFuncionario(destino);
  if (temErro(alertas)) throw new ErroValidacao(alertas);

  if (destino.sede_id !== atual.sede_id) {
    const [sede, rotinas, modelos, ausencias, qualificacoes, tempos, eventuais] = await Promise.all([
      ds.obter("sedes", destino.sede_id),
      ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("ausencias", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("qualificacoes_funcionario", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("tempos_personalizados", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("servicos_eventuais", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ]);
    if (!sede)
      throw new ErroValidacao([
        { nivel: "erro", codigo: "FUNCIONARIO_SEM_SEDE", mensagem: "Sede informada não existe." },
      ]);
    const vinculos =
      rotinas.length + modelos.length + ausencias.length + qualificacoes.length + tempos.length + eventuais.length;
    if (vinculos > 0)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "FUNCIONARIO_SEDE_COM_VINCULOS",
          mensagem: `Este funcionário tem ${vinculos} vínculo(s) operacional(is) e não pode mudar de sede sem uma migração assistida.`,
        },
      ]);
  }
  // Sem intervalo nenhum o trio também tem de zerar — senão sobra o par velho
  // no registro e `csvDoTrio` o traria de volta no próximo salvamento.
  const trio = destino.intervalos
    ? sincronizarTrio({ ...mudancas, intervalos: destino.intervalos })
    : { ...mudancas, intervalos: "", intervalo_inicio: "", intervalo_fim: "", intervalo_min: 0 };
  return ds.atualizar("funcionarios", id, {
    ...trio,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando há histórico — inativar preserva relatórios antigos. */
export async function deleteFuncionario(id: string): Promise<void> {
  const ds = await getDataSource();
  // Consulta pela FK (índice de campo único) → lê só os vínculos DESTE
  // funcionário, não as coleções inteiras (que crescem sem limite no tempo).
  const [rotinas, modelos, ausencias, qualificacoes, tempos, eventuais] = await Promise.all([
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("ausencias", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("qualificacoes_funcionario", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("tempos_personalizados", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("servicos_eventuais", [{ campo: "funcionario_id", op: "==", valor: id }]),
  ]);
  const vinculos =
    rotinas.length + modelos.length + ausencias.length + qualificacoes.length + tempos.length + eventuais.length;
  if (vinculos > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSSUI_HISTORICO",
        mensagem: `Este funcionário tem ${vinculos} vínculo(s) operacional(is). Excluir deixaria registros órfãos — use "Editar" e marque como Inativo.`,
      },
    ]);
  }
  await ds.excluir("funcionarios", id);
}

export interface ResultadoSubstituicao {
  itensDeRota: number;
  blocosTransferidos: number;
  blocosPreservados: number;
  inativou: boolean;
}

/**
 * Jorge assume o posto do Assis a partir de 15/09: **a rota é do posto, não da
 * pessoa**.
 *
 * Por que dois cadastros e não renomear um: o bloco guarda o *id* do
 * funcionário e a tela lê o nome desse id na hora de desenhar. Renomear o
 * registro reescreveria o passado — o dia 12/09, já realizado e confirmado,
 * passaria a dizer que quem fez foi o Jorge. Dois registros e uma data de corte
 * é o único jeito de "antes do dia 15 é o Assis" continuar verdade.
 *
 * Três movimentos, nesta ordem:
 *  1. copia os itens da rota padrão do antigo para o novo (o posto continua);
 *  2. passa para o novo os blocos **a partir da data** que ainda estão só
 *     planejados;
 *  3. inativa o antigo.
 *
 * O que nunca se move: bloco com realizado registrado. Ele é histórico do
 * antigo, mesmo caindo depois da data de corte — alguém pode ter trabalhado no
 * próprio dia da troca.
 */
export async function substituirNoPosto(
  novoId: string,
  antigoId: string,
  aPartirDe: string,
  autor: string,
): Promise<ResultadoSubstituicao> {
  if (novoId === antigoId)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SUBSTITUI_A_SI",
        mensagem: "Um funcionário não substitui a si mesmo.",
      },
    ]);
  const ds = await getDataSource();
  const [novo, antigo] = await Promise.all([
    ds.obter("funcionarios", novoId),
    ds.obter("funcionarios", antigoId),
  ]);
  if (!novo || !antigo)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "FUNCIONARIO_INEXISTENTE",
        mensagem: "Funcionário substituído não encontrado.",
      },
    ]);
  if (novo.sede_id !== antigo.sede_id)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SEDE_DIVERGENTE",
        mensagem: "A substituição vale dentro da mesma sede — a rota é do posto daquela unidade.",
      },
    ]);

  const agora = agoraISO();
  const [itens, blocos] = await Promise.all([
    ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: antigoId }]),
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: antigoId }]),
  ]);

  // 1. a rota do posto passa a ser do novo. O id do item carrega a pessoa, por
  // isso é recalculado — senão o novo item colidiria com o do antigo.
  const copiados = itens.map((item) => ({
    ...item,
    id: item.id.replace(antigoId, novoId),
    funcionario_id: novoId,
    criado_por: autor,
    criado_em: agora,
  }));
  await emLotesFunc(copiados, (item) => ds.criar("modelos_rotina", item));
  await emLotesFunc(itens, (item) => ds.excluir("modelos_rotina", item.id));

  // 2. só o que ainda é plano, e só daqui para a frente.
  const aTransferir = blocos.filter((b) => b.data >= aPartirDe && b.status === "planejada");
  const preservados = blocos.filter((b) => b.data >= aPartirDe && b.status !== "planejada").length;
  await emLotesFunc(aTransferir, (b) =>
    ds.atualizar("rotinas_planejadas", b.id, { funcionario_id: novoId, atualizado_em: agora }),
  );

  // 3. quem saiu, saiu: some da agenda e das listas, o histórico fica inteiro.
  await ds.atualizar("funcionarios", antigoId, {
    ativo: false,
    atualizado_por: autor,
    atualizado_em: agora,
    observacoes: [antigo.observacoes, `Substituído por ${novo.nome} em ${aPartirDe}.`]
      .filter(Boolean)
      .join(" · "),
  });

  return {
    itensDeRota: copiados.length,
    blocosTransferidos: aTransferir.length,
    blocosPreservados: preservados,
    inativou: true,
  };
}

/** Mesmo laço em lotes usado nos outros serviços — evita rajada no Firestore. */
async function emLotesFunc<T>(itens: T[], fn: (x: T) => Promise<unknown>, lote = 25): Promise<void> {
  for (let i = 0; i < itens.length; i += lote) {
    await Promise.all(itens.slice(i, i + lote).map(fn));
  }
}
