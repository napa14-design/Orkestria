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
  /**
   * Intensidade de limpeza do ambiente — multiplica o tempo previsto das
   * tarefas deste local. Reflete o quanto o espaço "suja": banheiros e copas
   * são densos, áreas abertas são leves. Presets: leve 0,8 · normal 1,0 ·
   * densa 1,5. Ausente/≤0 = 1 (sem efeito). Substitui o antigo fator que ficava
   * na categoria.
   */
  fator_intensidade?: number;
  ativo: boolean;
  observacoes: string;
}
