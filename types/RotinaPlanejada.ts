import type { StatusRotina } from "./comum";

export interface RotinaPlanejada {
  id: string;
  /** Formato YYYY-MM-DD */
  data: string;
  funcionario_id: string;
  sede_id: string;
  tarefa_id: string;
  local_id: string;
  /** Formato HH:mm */
  inicio_planejado: string;
  /** Formato HH:mm */
  fim_planejado: string;
  /** Tempo previsto real da tarefa (usado nos cálculos de produtividade). */
  tempo_previsto_min: number;
  /** Tempo arredondado para blocos inteiros (usado apenas na agenda visual). */
  tempo_visual_min: number;
  blocos_ocupados: number;
  status: StatusRotina;
  observacao: string;
  supervisor_id: string;
  criado_em: string;
  atualizado_em: string;
  /**
   * Item da rota padrão que gerou este bloco (`modelos_rotina.id`). Ausente em
   * bloco criado à mão, importado ou gerado antes deste campo existir.
   *
   * É a **identidade da ocorrência**: mudar o horário na rota não muda o item,
   * então o "Gerar o dia" reconhece o bloco e o **atualiza** em vez de criar outro
   * ao lado. Antes, a identidade era funcionário+tarefa+início — e mover 08:00
   * para 09:00 produzia dois blocos.
   */
  origem_item_id?: string;
  /**
   * Início que a rota mandava quando este bloco foi materializado.
   *
   * Existe para distinguir **"a rota mudou"** de **"a coordenadora mudou à mão"**:
   * se `inicio_planejado` ainda é igual a este valor, ninguém tocou no bloco e a
   * geração pode alinhá-lo à rota; se difere, a mão humana venceu e a geração não
   * mexe.
   */
  origem_inicio?: string;
}
