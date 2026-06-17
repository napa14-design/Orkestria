import type { Auditoria } from "./comum";

/**
 * Período letivo (calendário acadêmico) de uma sede. Define a janela em que há
 * aula — fora dela (férias/recesso), as tarefas marcadas como "depende do
 * calendário" NÃO são exigidas na cobertura. Cadastrado por sede e por semestre
 * (ex.: "2026.2"), idealmente com alguns dias de antecedência.
 */
export interface PeriodoLetivo extends Auditoria {
  id: string;
  /** Obrigatório: o calendário é por sede. */
  sede_id: string;
  /** Nome do período, ex.: "2026.2". */
  nome: string;
  /** Início do período letivo (YYYY-MM-DD, inclusive). */
  data_inicio: string;
  /** Fim do período letivo (YYYY-MM-DD, inclusive). */
  data_fim: string;
  /**
   * Dias da semana em que há aula, como CSV de índices "0".."6"
   * (0=domingo … 6=sábado). Ex.: "1,2,3,4,5" = seg a sex. Vazio = todos os dias
   * dentro do intervalo contam como letivos.
   */
  dias_semana: string;
  ativo: boolean;
}
