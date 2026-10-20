export type NivelCentralDia = "critico" | "atencao" | "ok";

/** Bloco que quem assume deixa de fazer hoje para cobrir a falta (vira "remanejada"). */
export interface BlocoCedido {
  rotina_id: string;
  tarefa_nome: string;
  /** Rótulo do nível efetivo: "baixa" ou "média" (crítica e alta nunca são cedidas para alta). */
  prioridade: string;
  inicio_planejado: string;
  fim_planejado: string;
}

/** Decisão pronta que o servidor recalcula e valida antes de executar. */
export interface ResolucaoCentralDia {
  /**
   * "redistribuir_rotina": alguém tem o horário livre.
   * "trocar_por_prioridade": ninguém tem; quem assume deixa `cedidas` — de
   * prioridade menor que a da falta, baixa antes de média (decisão do dono,
   * 19/10/2026).
   */
  tipo: "redistribuir_rotina" | "trocar_por_prioridade";
  /** Só na troca: rótulo da prioridade da tarefa que precisa de alguém. */
  tarefa_prioridade?: string;
  cedidas?: BlocoCedido[];
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
    /**
     * Sedes que a pessoa opera, quando é **mais de uma** — a Central mostra uma
     * por vez e este é o material do seletor. Lista vazia = escopo único (ou
     * acesso a todas), e nenhum seletor aparece.
     */
    sedes: { id: string; nome: string }[];
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
