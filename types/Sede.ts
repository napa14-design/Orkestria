import type { Auditoria, TipoSede } from "./comum";

export interface Sede extends Auditoria {
  id: string;
  nome_sede: string;
  cidade: string;
  endereco: string;
  /**
   * Perfil da unidade (educação infantil, escola, faculdade, administrativo…).
   * Permite comparar ociosidade entre sedes do mesmo tipo. Opcional.
   */
  tipo_sede?: TipoSede;
  /**
   * Grupo/cluster da sede (ex.: "Sul", "Centro") para visões agregadas de
   * gerência quando várias unidades formam um conjunto. Texto livre. Opcional.
   */
  grupo?: string;
  ativo: boolean;
}
