export type NivelPrioridadeCentral = "critico" | "atencao" | "informativo" | "ok";

export interface ItemCentralDia {
  id: string;
  nivel: NivelPrioridadeCentral;
  titulo: string;
  descricao: string;
  quantidade?: number;
  href: string;
  acao: string;
}

export interface ItemSaudeCadastro {
  id: string;
  titulo: string;
  descricao: string;
  quantidade: number;
  href: string;
}

export interface ItemProntidaoSede {
  id: string;
  titulo: string;
  descricao: string;
  quantidade: number;
  concluida: boolean;
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
    funcionarios_ativos: number;
    funcionarios_disponiveis: number;
    ausencias: number;
    rotinas_planejadas: number;
    realizados_registrados: number;
    aguardando_realizado: number;
    cobertura_pendente: number;
    /** Cobertura periódica só é calculada quando a Central está escopada por sede. */
    cobertura_calculada: boolean;
  };
  prioridades: ItemCentralDia[];
  saude: {
    indice: number;
    pendencias: number;
    itens: ItemSaudeCadastro[];
  };
  prontidao: {
    indice: number;
    concluidas: number;
    total: number;
    pronta_para_planejar: boolean;
    itens: ItemProntidaoSede[];
  };
  configuracao_inicial: boolean;
}
