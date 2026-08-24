import type { Auditoria } from "./comum";

export interface Local extends Auditoria {
  id: string;
  /** Obrigatório: nenhum local existe sem sede. */
  sede_id: string;
  andar: string;
  nome_local: string;
  /**
   * Id do tipo no catálogo `tipos_local`. Era a união fechada `TipoLocal` até
   * 24/08/2026; virou **string** quando o tipo passou a ser cadastrável, senão
   * um tipo criado pela operação não caberia no próprio campo. `TipoLocal`
   * continua existindo como as chaves de `FATOR_POR_TIPO_LOCAL` — a rede de
   * segurança dos 12 tipos que já vinham no código.
   */
  tipo_local: string;
  /** Metragem em m². 0 dispara alerta de "local sem metragem". */
  metragem: number;
  /**
   * Intensidade de limpeza do ambiente — multiplica o tempo previsto das
   * tarefas deste local. Reflete o quanto o espaço "suja": banheiros e copas
   * são densos, áreas abertas são leves. Presets: leve 0,8 · normal 1,0 ·
   * densa 1,5. Ausente/≤0 = usa o padrão do `tipo_local`
   * (`FATOR_POR_TIPO_LOCAL`); preenchido, o valor digitado vence. Substitui o
   * antigo fator que ficava na categoria.
   */
  fator_intensidade?: number;
  ativo: boolean;
  observacoes: string;
}
