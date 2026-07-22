import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { validarTarefa, temErro } from "@/lib/validations";
import type { Tarefa } from "@/types";
import { ErroValidacao } from "./erros";

type DadosTarefa = Omit<
  Tarefa,
  "id" | "sede_id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

export async function getTarefas(sedeId?: string): Promise<Tarefa[]> {
  const ds = await getDataSource();
  return sedeId
    ? ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: sedeId }])
    : ds.listar("tarefas");
}

/**
 * Regras essenciais nº 2 e 3: tarefa sem local é bloqueada e a sede é
 * SEMPRE herdada do local — nunca informada manualmente.
 */
export async function createTarefa(dados: DadosTarefa, autor: string): Promise<Tarefa> {
  const alertas = validarTarefa(dados);
  if (temErro(alertas)) throw new ErroValidacao(alertas);
  const ds = await getDataSource();
  const local = await ds.obter("locais", dados.local_id);
  if (!local)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TAREFA_SEM_LOCAL", mensagem: "Local informado não existe." },
    ]);
  const agora = agoraISO();
  return ds.criar("tarefas", {
    id: novoId(),
    ...dados,
    sede_id: local.sede_id, // herdada do local
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateTarefa(
  id: string,
  mudancas: Partial<DadosTarefa>,
  autor: string,
): Promise<Tarefa> {
  const ds = await getDataSource();
  const atual = await ds.obter("tarefas", id);
  if (!atual) throw new Error("Tarefa não encontrada.");
  const alertas = validarTarefa({ ...atual, ...mudancas });
  if (temErro(alertas)) throw new ErroValidacao(alertas);

  // Se o local mudou, a sede acompanha.
  let sede_id = atual.sede_id;
  if (mudancas.local_id && mudancas.local_id !== atual.local_id) {
    const local = await ds.obter("locais", mudancas.local_id);
    if (!local)
      throw new ErroValidacao([
        { nivel: "erro", codigo: "TAREFA_SEM_LOCAL", mensagem: "Local informado não existe." },
      ]);
    sede_id = local.sede_id;
    // Mudar de sede quebraria os vínculos existentes (rotina/modelo referenciam
    // a tarefa por sede). Bloqueia — o caminho certo é criar tarefa no destino.
    if (sede_id !== atual.sede_id) {
      const [rotinas, modelos] = await Promise.all([
        ds.consultar("rotinas_planejadas", [{ campo: "tarefa_id", op: "==", valor: id }]),
        ds.consultar("modelos_rotina", [{ campo: "tarefa_id", op: "==", valor: id }]),
      ]);
      const vinculos = rotinas.length + modelos.length;
      if (vinculos > 0)
        throw new ErroValidacao([
          {
            nivel: "erro",
            codigo: "TAREFA_SEDE_COM_VINCULOS",
            mensagem: `Esta tarefa tem ${vinculos} rotina(s)/modelo(s) e não pode mudar para um local de outra sede. Crie uma nova tarefa no destino.`,
          },
        ]);
    }
  }

  return ds.atualizar("tarefas", id, {
    ...mudancas,
    sede_id,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando há histórico — inativar preserva relatórios antigos. */
export async function deleteTarefa(id: string): Promise<void> {
  const ds = await getDataSource();
  // Consulta pela FK (índice de campo único) → lê só os vínculos DESTA tarefa.
  const [rotinas, modelos, tempos] = await Promise.all([
    ds.consultar("rotinas_planejadas", [{ campo: "tarefa_id", op: "==", valor: id }]),
    ds.consultar("modelos_rotina", [{ campo: "tarefa_id", op: "==", valor: id }]),
    ds.consultar("tempos_personalizados", [{ campo: "tarefa_id", op: "==", valor: id }]),
  ]);
  const vinculos = rotinas.length + modelos.length + tempos.length;
  if (vinculos > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSSUI_HISTORICO",
        mensagem: `Esta tarefa aparece em ${vinculos} rotina(s)/modelo(s)/tempo(s). Excluir apagaria o histórico — use "Editar" e marque como Inativa.`,
      },
    ]);
  }
  await ds.excluir("tarefas", id);
}
