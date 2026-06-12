import type { StatusRotina } from "./comum";

export interface RotinaPlanejada {
  id: string;
  /** Formato YYYY-MM-DD */
  data: string;
  funcionario_id: string;
  sede_id: string;
  tarefa_id: string;
  local_id: string;
  /** Formato HH:mm */
  inicio_planejado: string;
  /** Formato HH:mm */
  fim_planejado: string;
  /** Tempo previsto real da tarefa (usado nos cálculos de produtividade). */
  tempo_previsto_min: number;
  /** Tempo arredondado para blocos inteiros (usado apenas na agenda visual). */
  tempo_visual_min: number;
  blocos_ocupados: number;
  status: StatusRotina;
  observacao: string;
  supervisor_id: string;
  criado_em: string;
  atualizado_em: string;
}
