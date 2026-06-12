import type { Auditoria } from "./comum";

export type TipoParametro = "numero" | "percentual" | "min_por_m2" | "texto";

export interface Parametro extends Auditoria {
  id: string;
  chave: string;
  valor: string;
  tipo: TipoParametro;
  descricao: string;
  /** "geral" para parâmetros globais; id da sede para específicos. */
  sede_id: string;
  editavel_por_supervisor: boolean;
  ativo: boolean;
}

/** Parâmetros operacionais resolvidos (global + override por sede). */
export interface ParametrosResolvidos {
  bloco_agenda_min: number;
  ocupacao_baixa: number;
  ocupacao_adequada: number;
  ocupacao_alta: number;
  desvio_justificativa_percentual: number;
  tolerancia_sobrecarga_min: number;
  /** Mínimo de execuções com tempo real para sugerir ajuste de tempo padrão. */
  min_execucoes_ajuste: number;
  /** Desvio mediano (%) a partir do qual o sistema sugere ajustar o tempo base. */
  desvio_ajuste_percentual: number;
}
