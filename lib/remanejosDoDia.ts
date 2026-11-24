/**
 * "Remanejos do dia" (24/11/2026): para quem está fora hoje (ausente, ou emprestado a outra unidade
 * numa janela de horário), o que foi feito de cada tarefa — para quem passou e como, ou se ficou sem
 * ninguém. Não grava nada: deduz do que já existe.
 *
 * De quem era a tarefa: o dono do item da rota padrão de onde o bloco nasceu (`origem_item_id`; é o que
 * revela a troca feita à mão, que não deixa marca), senão o `titular_id` (Feita por e remanejo automático).
 * ⚠️ Limites: se a rota padrão mudou depois, o dono do item é o de hoje, não o do dia; bloco montado à
 * mão (sem item) não tem dono anterior; e se a própria dona mudou o horário antes de passar a tarefa, vale
 * o da rota.
 */
import { cadeiaDoRemanejo } from "./remanejoAuto";
import { janelaDoEventual, ocupaHorario } from "./calculations";
import { hhmmParaMin, minParaHHMM } from "./dateUtils";
import type { ModeloRotinaItem, RotinaPlanejada, ServicoEventual } from "@/types";

export type SituacaoDaTarefa = "passou" | "sem_ninguem" | "cancelada" | "registrada";
/** "Feita por" e o arrasto são a mesma coisa aqui: alguém decidiu. O bloco não guarda qual dos dois foi. */
export type ComoPassou = "automatico" | "a_mao";

export interface TarefaDeQuemEstaFora {
  rotina_id: string;
  inicio: string;
  fim: string;
  tarefa_id: string;
  situacao: SituacaoDaTarefa;
  /** Quem está com a tarefa (só em "passou"). */
  para?: string;
  como?: ComoPassou;
}

export interface PessoaFora {
  funcionario_id: string;
  motivo: "ausente" | "emprestimo";
  /** Horário do empréstimo ("09:00–12:00"); vazio na ausência (dia inteiro). */
  janela: string;
  tarefas: TarefaDeQuemEstaFora[];
}

export function remanejosDoDia(args: {
  rotinas: RotinaPlanejada[];
  itensDaRota: Pick<ModeloRotinaItem, "id" | "funcionario_id">[];
  /** Ids de quem está ausente no dia (dia inteiro). */
  ausentes: ReadonlySet<string>;
  eventuais: Pick<ServicoEventual, "funcionario_id" | "data" | "inicio" | "fim" | "libera_rota">[];
}): PessoaFora[] {
  const item = new Map(args.itensDaRota.map((i) => [i.id, i]));
  const janelas = new Map<string, { ini: number; fim: number; texto: string }[]>();
  for (const e of args.eventuais) {
    if (e.libera_rota !== true || !e.funcionario_id) continue;
    const j = janelaDoEventual(e);
    if (!j) continue;
    janelas.set(e.funcionario_id, [...(janelas.get(e.funcionario_id) ?? []), { ini: j[0], fim: j[1], texto: `${e.inicio}–${e.fim}` }]);
  }

  const grupos = new Map<string, PessoaFora>();
  const grupo = (funcionario_id: string, motivo: PessoaFora["motivo"], janela: string) => {
    const chave = `${funcionario_id}|${motivo}`;
    if (!grupos.has(chave)) grupos.set(chave, { funcionario_id, motivo, janela, tarefas: [] });
    return grupos.get(chave)!;
  };
  // Quem está fora aparece mesmo sem tarefa no dia: "fulana está fora e não tem nada" é resposta.
  for (const id of args.ausentes) grupo(id, "ausente", "");
  for (const [id, js] of janelas) if (!args.ausentes.has(id)) grupo(id, "emprestimo", js.map((j) => j.texto).join(", "));

  const fora = (id: string, ini: number, fim: number) =>
    args.ausentes.has(id) || (janelas.get(id) ?? []).some((j) => ini < j.fim && fim > j.ini);

  for (const r of args.rotinas) {
    const cadeia = cadeiaDoRemanejo(r);
    // Vários remanejos seguidos: o primeiro (último da cadeia) é o que sabe de quem era e a que horas.
    const primeiro = cadeia[cadeia.length - 1];
    const registrado = (primeiro && (primeiro.titular_antes || primeiro.de)) || r.titular_id;
    const quem = r.funcionario_id;
    const iniAgora = hhmmParaMin(r.inicio_planejado);
    const duracao = hhmmParaMin(r.fim_planejado) - iniAgora;
    // O horário que valia para cada um: para quem está com ela, o atual; para o dono, o de antes da troca.
    const inicioPara = (id: string) =>
      id === quem ? iniAgora : hhmmParaMin((id === registrado && primeiro?.inicio) || r.origem_inicio || r.inicio_planejado);
    const foraDela = (id: string) => fora(id, inicioPara(id), inicioPara(id) + duracao);
    // De quem é a lista: o primeiro que está fora, do dono da rota a quem está com ela agora. Nunca só
    // pelo `titular_id`: a tarefa arrastada e depois remanejada guarda quem cobria, e sumia da dona.
    const doItem = r.origem_item_id && item.get(r.origem_item_id)?.funcionario_id;
    const dono = [doItem, registrado, quem].find((id) => !!id && foraDela(id));
    if (!dono) continue;
    const passou = quem !== dono;
    // Quem cobre também pode estar fora (faltou depois, ou foi emprestado no horário): aí ninguém cobre.
    const quemFora = foraDela(quem);

    let situacao: SituacaoDaTarefa;
    if (!ocupaHorario(r)) situacao = "cancelada";
    else if (r.status === "planejada" || r.status === "pendente") situacao = passou && !quemFora ? "passou" : "sem_ninguem";
    else situacao = passou && r.status !== "nao_realizada" ? "passou" : "registrada";

    const ausente = args.ausentes.has(dono);
    grupo(dono, ausente ? "ausente" : "emprestimo", "").tarefas.push({
      rotina_id: r.id,
      inicio: minParaHHMM(inicioPara(dono)),
      fim: minParaHHMM(inicioPara(dono) + duracao),
      tarefa_id: r.tarefa_id,
      situacao,
      ...(situacao === "passou" ? { para: quem, como: (cadeia.length > 0 ? "automatico" : "a_mao") as ComoPassou } : {}),
    });
  }
  for (const g of grupos.values()) g.tarefas.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return [...grupos.values()];
}
