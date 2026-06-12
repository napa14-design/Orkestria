import type { Auditoria } from "./comum";

export type TipoAusencia = "falta" | "atestado" | "ferias" | "folga" | "outro";

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
