import type { Auditoria, TipoRequisito } from "./comum";

/**
 * Requisito de execução (conformidade) — catálogo global de aptidões,
 * treinamentos e EPIs. Uma tarefa pode exigir vários; aptidões e treinamentos
 * são possuídos pelo funcionário (com validade) e bloqueiam a alocação quando
 * faltam ou estão vencidos. EPI é exigido pela tarefa e exibido como lembrete.
 */
export interface Requisito extends Auditoria {
  id: string;
  nome: string;
  tipo: TipoRequisito;
  descricao: string;
  ativo: boolean;
}
