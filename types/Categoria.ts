import type { Auditoria } from "./comum";

/**
 * Categoria de atividade — camada que agrupa tarefas afins (ex.: "Limpeza
 * concorrente", "Higienização", "Coleta"). Catálogo global, compartilhado
 * entre todas as sedes; formaliza o antigo campo livre `tipo_tarefa`.
 */
export interface Categoria extends Auditoria {
  id: string;
  nome: string;
  descricao: string;
  /** Cor de exibição (hex) usada em selos e na paleta. Opcional. */
  cor?: string;
  /**
   * Fator de intensidade de limpeza que multiplica o tempo previsto de TODAS
   * as tarefas da categoria (ex.: 0,8 leve · 1,0 normal · 1,5 densa). Ausente
   * ou ≤ 0 equivale a 1,0 (sem efeito). Os valores são calibráveis.
   */
  fator_intensidade?: number;
  ativo: boolean;
}
