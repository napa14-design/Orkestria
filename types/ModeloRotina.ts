/**
 * Item de um modelo de rotina (template). Um modelo é o conjunto de itens
 * com o mesmo `nome_modelo` + `sede_id`; aplicá-lo recria as tarefas em
 * qualquer data, passando pelas validações normais de alocação.
 */
export interface ModeloRotinaItem {
  id: string;
  nome_modelo: string;
  sede_id: string;
  funcionario_id: string;
  tarefa_id: string;
  local_id: string;
  /** Formato HH:mm */
  inicio_planejado: string;
  /** Duração em min — preservada para tarefas de presença/manual (varia). */
  duracao_min?: number;
  /**
   * Marca este item como parte da **rota padrão** da sede — a fonte do "Gerar o
   * dia". A rota padrão é a **união** dos itens marcados assim, e não um modelo
   * único: a sede pode ter a camada de todo dia mais camadas por dia da semana.
   */
  padrao?: boolean;
  /**
   * Dias da semana em que ESTE item vale — CSV numérico (0=dom … 6=sáb).
   * Vazio/ausente = todo dia, que é o comportamento de toda rota salva antes
   * deste campo existir.
   *
   * A recorrência mora no **item**, não na tarefa, de propósito. `dias_semana` da
   * tarefa se aplica a toda ocorrência dela na rota, então não consegue expressar
   * "Maria na segunda, João na quarta" nem "mesma tarefa, outro horário no
   * sábado" — os dois itens sobreviveriam nos dois dias. No item, consegue.
   */
  dias_semana?: string;
  /**
   * Modelo de EVENTO (formatura, feira, prova) — a rotina exigida por aquele
   * tipo de evento, aplicada com antecedência sobre o dia (ata de 17/07: no dia
   * do evento o supervisor não tem tempo de montar a programação).
   *
   * Excludente com `padrao`: um evento nunca é a rota do dia a dia, senão o
   * "Gerar o dia" passaria a produzir a programação do evento.
   */
  evento?: boolean;
  criado_por: string;
  criado_em: string;
}
