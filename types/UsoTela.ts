/**
 * Uma tela aberta num dia, por perfil e sede. Sem pessoa, sem hora e sem contagem:
 * diz só que aquela tela foi aberta naquele dia. Coleta temporária (`lib/usoTelas.ts`).
 */
export interface UsoTela {
  id: string;
  /** Formato YYYY-MM-DD, no fuso da operação. */
  dia: string;
  perfil: string;
  sede_id: string;
  tela: string;
}
