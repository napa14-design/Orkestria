import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { validarLocal, temErro } from "@/lib/validations";
import type { Local } from "@/types";
import { ErroValidacao } from "./erros";

type DadosLocal = Omit<
  Local,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

export async function getLocais(sedeId?: string): Promise<Local[]> {
  const ds = await getDataSource();
  return sedeId
    ? ds.consultar("locais", [{ campo: "sede_id", op: "==", valor: sedeId }])
    : ds.listar("locais");
}

/** Regra essencial nº 1: não permitir local sem sede. */
export async function createLocal(dados: DadosLocal, autor: string): Promise<Local> {
  const alertas = validarLocal(dados);
  if (temErro(alertas)) throw new ErroValidacao(alertas);
  const ds = await getDataSource();
  const sede = await ds.obter("sedes", dados.sede_id);
  if (!sede)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "LOCAL_SEM_SEDE", mensagem: "Sede informada não existe." },
    ]);
  const agora = agoraISO();
  return ds.criar("locais", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateLocal(
  id: string,
  mudancas: Partial<DadosLocal>,
  autor: string,
): Promise<Local> {
  const ds = await getDataSource();
  const atual = await ds.obter("locais", id);
  if (!atual) throw new Error("Local não encontrado.");
  const destino = { ...atual, ...mudancas };
  const alertas = validarLocal(destino);
  if (temErro(alertas)) throw new ErroValidacao(alertas);

  if (destino.sede_id !== atual.sede_id) {
    const [sede, tarefas, rotinas] = await Promise.all([
      ds.obter("sedes", destino.sede_id),
      ds.consultar("tarefas", [{ campo: "local_id", op: "==", valor: id }]),
      ds.consultar("rotinas_planejadas", [{ campo: "local_id", op: "==", valor: id }]),
    ]);
    if (!sede)
      throw new ErroValidacao([
        { nivel: "erro", codigo: "LOCAL_SEM_SEDE", mensagem: "Sede informada não existe." },
      ]);
    const vinculos = tarefas.length + rotinas.length;
    if (vinculos > 0)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "LOCAL_SEDE_COM_VINCULOS",
          mensagem: `Este local tem ${vinculos} tarefa(s)/rotina(s) vinculada(s) e não pode mudar de sede. Crie outro local na sede de destino e migre os cadastros conscientemente.`,
        },
      ]);
  }
  return ds.atualizar("locais", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando há tarefas ou histórico vinculados. */
export async function deleteLocal(id: string): Promise<void> {
  const ds = await getDataSource();
  // Consulta pela FK (índice de campo único) → lê só os vínculos DESTE local.
  const [tarefas, rotinas, modelos, eventuais] = await Promise.all([
    ds.consultar("tarefas", [{ campo: "local_id", op: "==", valor: id }]),
    ds.consultar("rotinas_planejadas", [{ campo: "local_id", op: "==", valor: id }]),
    ds.consultar("modelos_rotina", [{ campo: "local_id", op: "==", valor: id }]),
    ds.consultar("servicos_eventuais", [{ campo: "local_id", op: "==", valor: id }]),
  ]);
  const vinculos = tarefas.length + rotinas.length + modelos.length + eventuais.length;
  if (vinculos > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSSUI_HISTORICO",
        mensagem: `Este local tem ${vinculos} tarefa(s)/rotina(s) vinculada(s). Excluir quebraria o histórico — use "Editar" e marque como Inativo.`,
      },
    ]);
  }
  await ds.excluir("locais", id);
}
