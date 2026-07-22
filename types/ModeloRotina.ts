/**
 * Item de um modelo de rotina (template). Um modelo é o conjunto de itens
 * com o mesmo `nome_modelo` + `sede_id`; aplicá-lo recria as tarefas em
 * qualquer data, passando pelas validações normais de alocação.
 */
export interface ModeloRotinaItem {
  id: string;
  nome_modelo: string;
  sede_id: string;
  funcionario_id: string;
  tarefa_id: string;
  local_id: string;
  /** Formato HH:mm */
  inicio_planejado: string;
  /** Duração em min — preservada para tarefas de presença/manual (varia). */
  duracao_min?: number;
  /** Marca este modelo como a "rota padrão" da sede (só um padrão por sede). */
  padrao?: boolean;
  /**
   * Modelo de EVENTO (formatura, feira, prova) — a rotina exigida por aquele
   * tipo de evento, aplicada com antecedência sobre o dia (ata de 17/07: no dia
   * do evento o supervisor não tem tempo de montar a programação).
   *
   * Excludente com `padrao`: um evento nunca é a rota do dia a dia, senão o
   * "Gerar o dia" passaria a produzir a programação do evento.
   */
  evento?: boolean;
  criado_por: string;
  criado_em: string;
}

/** DTO agregado devolvido pelo catálogo de modelos. */
export interface ResumoModelo {
  nome_modelo: string;
  sede_id: string;
  itens: number;
  padrao: boolean;
  evento: boolean;
  criado_por: string;
  criado_em: string;
  inicio?: string;
  fim?: string;
}

/** Resultado compartilhado pela API e pelo modal ao aplicar um modelo. */
export interface ResultadoAplicacao {
  criadas: number;
  puladas: number;
  detalhes: string[];
}
