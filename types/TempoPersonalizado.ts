import type { Auditoria } from "./comum";

/**
 * Tempo padrão de uma tarefa para um funcionário específico — reconhece que a
 * mesma atividade tem ritmo diferente em cada pessoa. Usado SOMENTE para
 * planejar (montar uma rotina realista). Nunca alimenta avaliação, score ou
 * premiação — separação explícita entre planejar e avaliar.
 */
export interface TempoPersonalizado extends Auditoria {
  id: string;
  funcionario_id: string;
  tarefa_id: string;
  /** Herdado do funcionário (para filtro de permissão por sede). */
  sede_id: string;
  /** Tempo realista, em minutos, dessa pessoa nessa tarefa (substitui o padrão). */
  tempo_min: number;
  observacao: string;
}
