import type {
  Auditoria,
  Frequencia,
  Prioridade,
  RegraCalculo,
  RestricaoGenero,
} from "./comum";

export interface Tarefa extends Auditoria {
  id: string;
  nome_tarefa: string;
  tipo_tarefa: string;
  /** Obrigatório: nenhuma tarefa existe sem local. */
  local_id: string;
  /** Herdado automaticamente do local — nunca informado manualmente. */
  sede_id: string;
  /**
   * Categoria de atividade (entidade `categorias`) que agrupa a tarefa.
   * Opcional para compatibilidade com tarefas anteriores à camada de categorias;
   * substitui aos poucos o campo livre `tipo_tarefa`.
   */
  categoria_id?: string;
  regra_calculo: RegraCalculo;
  /**
   * Significado depende da regra:
   *  - fixo/manual: tempo total em minutos
   *  - por_m2: minutos por m² (multiplicado pela metragem do local)
   *  - por_unidade: minutos por unidade (multiplicado por `quantidade`)
   */
  tempo_base_min: number;
  /** Usado apenas em regra por_unidade. */
  quantidade: number;
  frequencia: Frequencia;
  prioridade: Prioridade;
  /**
   * Restrição de gênero do executante (ex.: banheiro feminino → "feminino").
   * "" / ausente = qualquer funcionário pode executar. Opcional para
   * compatibilidade com tarefas cadastradas antes deste campo existir.
   */
  restricao_genero?: RestricaoGenero;
  /**
   * Quando true, o tempo previsto é só uma referência: o sistema NÃO gera
   * alerta de desvio nem entra nas sugestões de ajuste (ex.: montagem de palco,
   * cuja execução varia muito).
   */
  tempo_referencia?: boolean;
  /** Janela em que a tarefa pode ocorrer (ex.: refeitório só após o almoço). */
  janela_inicio?: string; // HH:mm — vazio = qualquer horário do expediente
  janela_fim?: string; // HH:mm
  /**
   * Periodicidade fina: dias da semana fixos em que a tarefa é devida, como
   * CSV de índices "0".."6" (0=domingo … 6=sábado). Ex.: "2,4" = toda terça e
   * quinta. Só faz sentido para frequência "semanal"; vazio/ausente mantém a
   * cobertura por janela deslizante (a cada 7 dias).
   */
  dias_semana?: string;
  ativo: boolean;
  observacoes: string;
}
