import type { Auditoria } from "./comum";

/**
 * Qualificação que um funcionário possui (aptidão ou treinamento do catálogo
 * `requisitos`). Quando uma tarefa exige o requisito, só pode ser alocada a
 * quem o possui e está válido. EPIs não entram aqui (não são "possuídos").
 */
/**
 * Degrau de HABILITAÇÃO numa qualificação — usado só para **sugerir** quem
 * chamar primeiro (ex.: montagem de palco num evento).
 *
 * NÃO é avaliação de desempenho e NÃO altera o bloqueio: quem tem a
 * qualificação válida pode executar, independente do nível. Vazio = "apto".
 */
export type NivelQualificacao = "apto" | "experiente" | "referencia";

/** Ordem para ranquear sugestões. Nível ausente/desconhecido conta como apto. */
export const NIVEL_ORDEM: Record<NivelQualificacao, number> = {
  apto: 1,
  experiente: 2,
  referencia: 3,
};

export const NIVEIS_QUALIFICACAO: { valor: NivelQualificacao; rotulo: string }[] = [
  { valor: "apto", rotulo: "Apto" },
  { valor: "experiente", rotulo: "Experiente" },
  { valor: "referencia", rotulo: "Referência" },
];

export interface QualificacaoFuncionario extends Auditoria {
  id: string;
  funcionario_id: string;
  requisito_id: string;
  /** Herdado do funcionário (filtro de permissão por sede). */
  sede_id: string;
  /** Validade (YYYY-MM-DD). Vazio = não expira. Vencida bloqueia a alocação. */
  validade: string;
  /** Ver `NivelQualificacao`. Vazio = "apto". Não influencia o bloqueio. */
  nivel?: NivelQualificacao;
  observacao: string;
}
