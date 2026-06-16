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
  ativo: boolean;
}
