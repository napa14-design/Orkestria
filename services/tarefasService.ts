import { agoraISO, getDataSource, novoId, type DataSource } from "@/lib/datasource";
import { parseDiasSemana, serializarDiasSemana } from "@/lib/dateUtils";
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
 * Tarefa nova sem EPI marcado nasce com os EPIs padrão do tipo do local, para ninguém
 * repetir à mão o que é de todo banheiro (pedido da coordenação, 06/11/2026). Só na
 * criação: ao editar, tirar o EPI é decisão de quem tirou. EPI marcado no formulário manda.
 */
async function comEpisDoTipo(ds: DataSource, requisitos: string | undefined, tipoLocal: string): Promise<string | undefined> {
  // Local sem tipo: `doc("")` derruba o Firestore. Requisito que não é texto segue como antes.
  if (!tipoLocal || (requisitos != null && typeof requisitos !== "string")) return requisitos;
  const padrao = (await ds.obter("tipos_local", tipoLocal))?.epis_padrao;
  if (!padrao) return requisitos;
  const catalogo = await ds.listar("requisitos");
  const epis = new Set(catalogo.filter((r) => r.tipo === "epi" && r.ativo).map((r) => r.id));
  const marcados = (requisitos ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (marcados.some((id) => epis.has(id))) return requisitos;
  return [...marcados, ...padrao.split(",").map((id) => id.trim()).filter((id) => epis.has(id))].join(",");
}

/**
 * Regras essenciais nº 2 e 3: tarefa sem local é bloqueada e a sede é
 * SEMPRE herdada do local — nunca informada manualmente.
 */
/**
 * Os dias da crítica chegam do formulário como CSV; o banco guarda só dias
 * válidos (0–6), sem repetir, em ordem — qualquer outra coisa vira "todo dia".
 */
function diasDaCritica(d: Partial<DadosTarefa>): Pick<Tarefa, "critica_dias"> | Record<string, never> {
  if (!("critica_dias" in d)) return {};
  return { critica_dias: typeof d.critica_dias === "string" ? serializarDiasSemana(parseDiasSemana(d.critica_dias)) : "" };
}

/**
 * "Qualquer horário" do formulário (10/11/2026): marcado, a tarefa não tem janela;
 * desmarcado, a janela é obrigatória. Fica gravado porque é a ESCOLHA que importa:
 * sem ela, o remanejo automático não muda a crítica de horário. Qualquer valor que
 * não seja `true`/`false` não muda nada.
 */
function comHorario<D extends Partial<DadosTarefa>>(d: D): D {
  const { qualquer_horario, ...resto } = d as D & { qualquer_horario?: unknown };
  if (qualquer_horario === true) return { ...resto, qualquer_horario: true, janela_inicio: "", janela_fim: "" } as unknown as D;
  if (qualquer_horario === false) {
    if (!resto.janela_inicio || !resto.janela_fim)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "JANELA_OBRIGATORIA",
          mensagem: "Sem \"Qualquer horário\", informe o início e o fim da janela em que a tarefa pode ser feita.",
        },
      ]);
    return { ...resto, qualquer_horario: false } as unknown as D;
  }
  return resto as unknown as D;
}

export async function createTarefa(entrada: DadosTarefa, autor: string): Promise<Tarefa> {
  const dados = comHorario(entrada);
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
    ...dados,
    ...diasDaCritica(dados),
    id: novoId(), // depois do spread: id do corpo não sobrescreve registro alheio
    sede_id: local.sede_id, // herdada do local
    requisitos: await comEpisDoTipo(ds, dados.requisitos, local.tipo_local),
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateTarefa(
  id: string,
  entrada: Partial<DadosTarefa>,
  autor: string,
): Promise<Tarefa> {
  const mudancas = comHorario(entrada);
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
    ...diasDaCritica(mudancas),
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
