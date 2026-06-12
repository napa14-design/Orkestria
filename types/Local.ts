import type { Auditoria, TipoLocal } from "./comum";

export interface Local extends Auditoria {
  id: string;
  /** Obrigatório: nenhum local existe sem sede. */
  sede_id: string;
  andar: string;
  nome_local: string;
  tipo_local: TipoLocal;
  /** Metragem em m². 0 dispara alerta de "local sem metragem". */
  metragem: number;
  ativo: boolean;
  observacoes: string;
}
