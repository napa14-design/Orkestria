import type { StatusRealizado } from "./comum";

export interface ExecucaoRealizada {
  id: string;
  rotina_id: string;
  /** Formato YYYY-MM-DD */
  data_execucao: string;
  status_realizado: StatusRealizado;
  /** Formato HH:mm — opcional. */
  inicio_real: string;
  /** Formato HH:mm — opcional. */
  fim_real: string;
  tempo_real_min: number;
  /** Obrigatória quando o desvio ultrapassa o parâmetro configurado. */
  justificativa: string;
  observacao: string;
  supervisor_id: string;
  criado_em: string;
  atualizado_em: string;
}
