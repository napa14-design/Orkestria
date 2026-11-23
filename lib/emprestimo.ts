/**
 * Empréstimo a outra unidade (23/11/2026): a coordenação manda uma pessoa ajudar outra unidade
 * por algumas horas ou dias. É uma atividade adicional ("Apoio a outro setor") com `libera_rota`:
 * nesse horário ela sai da rota. Funções puras, usadas pela Central e pelo remanejo automático:
 *  - os blocos dela que caem na janela ficam sem dono (como os de quem faltou);
 *  - nesse dia ela não recebe tarefa de ninguém (a janela não aparece como "ocupada" para a
 *    redistribuição, então excluí-la do dia é o jeito seguro de não devolver a tarefa a ela).
 */
import type { RotinaPlanejada, ServicoEventual } from "@/types";
import { janelaDoEventual } from "./calculations";
import { hhmmParaMin } from "./dateUtils";

type EventualDoEmprestimo = Pick<ServicoEventual, "funcionario_id" | "data" | "inicio" | "fim" | "libera_rota">;

/** Pessoas emprestadas na data (com janela válida). */
export function emprestadosNoDia(eventuais: EventualDoEmprestimo[], data: string): Set<string> {
  return new Set(eventuais.filter((e) => e.libera_rota === true && e.data === data && e.funcionario_id && janelaDoEventual(e)).map((e) => e.funcionario_id));
}

/** Ids dos blocos que caem, ao menos em parte, numa janela de empréstimo da mesma pessoa e dia. */
export function blocosNoEmprestimo(
  rotinas: Pick<RotinaPlanejada, "id" | "funcionario_id" | "data" | "inicio_planejado" | "fim_planejado">[],
  eventuais: EventualDoEmprestimo[],
): Set<string> {
  const janelas = new Map<string, [number, number][]>();
  for (const e of eventuais) {
    if (e.libera_rota !== true || !e.funcionario_id) continue;
    const j = janelaDoEventual(e);
    if (!j) continue;
    const k = `${e.funcionario_id}|${e.data}`;
    janelas.set(k, [...(janelas.get(k) ?? []), j]);
  }
  const ids = new Set<string>();
  for (const r of rotinas) {
    const js = janelas.get(`${r.funcionario_id}|${r.data}`);
    if (!js) continue;
    const ini = hhmmParaMin(r.inicio_planejado);
    const fim = hhmmParaMin(r.fim_planejado);
    if (js.some(([a, b]) => ini < b && fim > a)) ids.add(r.id);
  }
  return ids;
}
