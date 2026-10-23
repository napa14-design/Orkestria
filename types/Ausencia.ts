import type { Auditoria } from "./comum";

/**
 * `banco_horas` (23/10/2026): compensação de banco de horas — a pessoa está fora
 * com o tempo já pago. Pedido da coordenação para não lançar como "Outro". O
 * tipo aqui só rotula (agenda, lista); nenhuma conta do Orkestria usa o tipo, e
 * nada dele vai para o Chromos, onde moram absenteísmo e benefícios.
 */
export type TipoAusencia = "falta" | "atestado" | "ferias" | "folga" | "banco_horas" | "outro";

/**
 * Ausência de um funcionário em um período. Durante a ausência a coluna do
 * funcionário fica bloqueada na agenda e suas tarefas viram "órfãs",
 * candidatas a remanejamento para colegas com ociosidade.
 */
export interface Ausencia extends Auditoria {
  id: string;
  funcionario_id: string;
  /** Herdada do funcionário. */
  sede_id: string;
  tipo: TipoAusencia;
  /** Formato YYYY-MM-DD (inclusive). */
  data_inicio: string;
  /** Formato YYYY-MM-DD (inclusive). */
  data_fim: string;
  observacao: string;
}
