import type { Auditoria, Frequencia, Prioridade, RegraCalculo } from "./comum";

export interface Tarefa extends Auditoria {
  id: string;
  nome_tarefa: string;
  tipo_tarefa: string;
  /** Obrigatório: nenhuma tarefa existe sem local. */
  local_id: string;
  /** Herdado automaticamente do local — nunca informado manualmente. */
  sede_id: string;
  regra_calculo: RegraCalculo;
  /**
   * Significado depende da regra:
   *  - fixo/manual: tempo total em minutos
   *  - por_m2: minutos por m² (multiplicado pela metragem do local)
   *  - por_unidade: minutos por unidade (multiplicado por `quantidade`)
   */
  tempo_base_min: number;
  /** Usado apenas em regra por_unidade. */
  quantidade: number;
  frequencia: Frequencia;
  prioridade: Prioridade;
  ativo: boolean;
  observacoes: string;
}
