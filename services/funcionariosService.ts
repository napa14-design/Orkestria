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
