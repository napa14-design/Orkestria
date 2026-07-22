export type NivelCentralDia = "critico" | "atencao" | "ok";

/** Uma condição operacional concreta que desaparece quando for resolvida. */
export interface AcaoCentralDia {
  id: string;
  nivel: NivelCentralDia;
  titulo: string;
  descricao: string;
  quantidade?: number;
  href: string;
  acao: string;
}

export interface CentralDiaDados {
  data: string;
  atualizado_em: string;
  escopo: {
    sede_id: string;
    nome: string;
  };
  resumo: {
    funcionarios_disponiveis: number;
    ausencias: number;
    rotinas_planejadas: number;
    realizados_registrados: number;
    aguardando_confirmacao: number;
  };
  proxima: AcaoCentralDia;
  fila: AcaoCentralDia[];
}
