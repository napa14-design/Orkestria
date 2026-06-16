import type { Auditoria } from "./comum";

/**
 * Qualificação que um funcionário possui (aptidão ou treinamento do catálogo
 * `requisitos`). Quando uma tarefa exige o requisito, só pode ser alocada a
 * quem o possui e está válido. EPIs não entram aqui (não são "possuídos").
 */
export interface QualificacaoFuncionario extends Auditoria {
  id: string;
  funcionario_id: string;
  requisito_id: string;
  /** Herdado do funcionário (filtro de permissão por sede). */
  sede_id: string;
  /** Validade (YYYY-MM-DD). Vazio = não expira. Vencida bloqueia a alocação. */
  validade: string;
  observacao: string;
}
