import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { kitTarefasPorTipo } from "@/lib/kitsTarefas";
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

function normalizarNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/**
 * Prepara um local com um conjunto pequeno de tarefas operacionais. Cada item
 * continua passando por createTarefa, portanto mantém validação, sede herdada
 * e histórico. Nomes já existentes no local são ignorados de forma idempotente.
 */
export async function aplicarKitTarefasLocal(
  localId: string,
  itensSelecionados: string[],
  autor: string,
): Promise<{ criadas: Tarefa[]; ignoradas: string[] }> {
  const ds = await getDataSource();
  const local = await ds.obter("locais", localId);
  if (!local) throw new Error("Local não encontrado.");

  const kit = kitTarefasPorTipo(local.tipo_local);
  const idsPermitidos = new Set(itensSelecionados);
  const escolhidas = kit.filter((item) => idsPermitidos.has(item.id));
  if (escolhidas.length === 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "KIT_SEM_ITENS", mensagem: "Nenhuma tarefa válida foi selecionada para este local." },
    ]);
  const [existentes, categorias] = await Promise.all([
    ds.consultar("tarefas", [{ campo: "local_id", op: "==", valor: localId }]),
    ds.listar("categorias"),
  ]);
  const nomesExistentes = new Set(existentes.map((tarefa) => normalizarNome(tarefa.nome_tarefa)));
  const categoriaPorNome = new Map(
    categorias
      .filter((categoria) => categoria.ativo)
      .map((categoria) => [normalizarNome(categoria.nome), categoria.id]),
  );
  const criadas: Tarefa[] = [];
  const ignoradas: string[] = [];

  for (const item of escolhidas) {
    const nomeNormalizado = normalizarNome(item.nome);
    if (nomesExistentes.has(nomeNormalizado)) {
      ignoradas.push(item.nome);
      continue;
    }
    const tarefa = await createTarefa(
      {
        nome_tarefa: item.nome,
        tipo_tarefa: item.categoria_sugerida,
        local_id: local.id,
        categoria_id: categoriaPorNome.get(normalizarNome(item.categoria_sugerida)) ?? "",
        regra_calculo: "fixo",
        tipo_servico: "rotina",
        tempo_base_min: item.tempo_base_min,
        quantidade: 1,
        frequencia: item.frequencia,
        prioridade: item.prioridade,
        restricao_genero: "",
        tempo_referencia: false,
        presenca: false,
        critica: Boolean(item.critica),
        requisitos: "",
        janela_inicio: "",
        janela_fim: "",
        dias_semana: "",
        depende_calendario: false,
        ativo: true,
        observacoes: `Criada pelo kit de ${local.nome_local}.`,
      },
      autor,
    );
    criadas.push(tarefa);
    nomesExistentes.add(nomeNormalizado);
  }

  return { criadas, ignoradas };
}

/**
 * Replica uma tarefa para vários locais da mesma sede. Valida todos os destinos
 * antes da primeira escrita e ignora locais que já possuem tarefa com o mesmo
 * nome, permitindo repetir a operação com segurança.
 */
export async function replicarTarefaParaLocais(
  tarefaId: string,
  locaisIds: string[],
  autor: string,
): Promise<{ criadas: Tarefa[]; ignoradas: Array<{ local_id: string; nome_local: string }> }> {
  const ds = await getDataSource();
  const origem = await ds.obter("tarefas", tarefaId);
  if (!origem) throw new Error("Tarefa não encontrada.");
  if (!origem.ativo)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "TAREFA_INATIVA", mensagem: "Reative a tarefa antes de replicá-la." },
    ]);

  const destinosIds = [...new Set(locaisIds)].filter((id) => id !== origem.local_id);
  if (destinosIds.length === 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "REPLICACAO_SEM_DESTINO", mensagem: "Selecione ao menos um local de destino." },
    ]);

  const [locaisDaSede, tarefasDaSede] = await Promise.all([
    ds.consultar("locais", [{ campo: "sede_id", op: "==", valor: origem.sede_id }]),
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: origem.sede_id }]),
  ]);
  const localPorId = new Map(locaisDaSede.map((local) => [local.id, local]));
  const destinos = destinosIds.map((id) => localPorId.get(id));
  if (destinos.some((local) => !local || !local.ativo))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "DESTINO_INVALIDO",
        mensagem: "Um ou mais locais não existem, estão inativos ou pertencem a outra sede.",
      },
    ]);

  const nomeOrigem = normalizarNome(origem.nome_tarefa);
  const locaisComDuplicidade = new Set(
    tarefasDaSede
      .filter((tarefa) => normalizarNome(tarefa.nome_tarefa) === nomeOrigem)
      .map((tarefa) => tarefa.local_id),
  );
  const criadas: Tarefa[] = [];
  const ignoradas: Array<{ local_id: string; nome_local: string }> = [];
  const {
    id: _id,
    sede_id: _sedeId,
    criado_por: _criadoPor,
    criado_em: _criadoEm,
    atualizado_por: _atualizadoPor,
    atualizado_em: _atualizadoEm,
    ...dadosBase
  } = origem;
  void _id;
  void _sedeId;
  void _criadoPor;
  void _criadoEm;
  void _atualizadoPor;
  void _atualizadoEm;

  for (const local of destinos) {
    if (!local) continue;
    if (locaisComDuplicidade.has(local.id)) {
      ignoradas.push({ local_id: local.id, nome_local: local.nome_local });
      continue;
    }
    const criada = await createTarefa({ ...dadosBase, local_id: local.id }, autor);
    criadas.push(criada);
    locaisComDuplicidade.add(local.id);
  }

  return { criadas, ignoradas };
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
        mensagem: `Esta tarefa aparece em ${vinculos} rotina(s)/modelo(s). Excluir apagaria o histórico — use "Editar" e marque como Inativa.`,
      },
    ]);
  }
  await ds.excluir("tarefas", id);
}
