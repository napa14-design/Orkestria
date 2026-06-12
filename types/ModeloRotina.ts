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
  criado_por: string;
  criado_em: string;
}
