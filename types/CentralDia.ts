export type NivelCentralDia = "critico" | "atencao" | "ok";

/** Decisão pronta que o servidor recalcula e valida antes de executar. */
export interface ResolucaoCentralDia {
  tipo: "redistribuir_rotina";
  rotina_id: string;
  sede_id: string;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_origem_nome: string;
  tarefa_nome: string;
  inicio_planejado: string;
  fim_planejado: string;
}

/** Uma condição operacional concreta que desaparece quando for resolvida. */
export interface AcaoCentralDia {
  id: string;
  nivel: NivelCentralDia;
  titulo: string;
  descricao: string;
  quantidade?: number;
  href: string;
  acao: string;
  /** Ausente quando qualquer alerta exige decisão humana na Agenda. */
  resolucao?: ResolucaoCentralDia;
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
