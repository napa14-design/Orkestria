import type { Auditoria } from "./comum";

/**
 * Dia (ou intervalo) em que **não há operação**: feriado, recesso, ponto
 * facultativo em que a equipe não vem.
 *
 * Por que não existia antes: com a geração manual, ninguém clica "Gerar o dia" no
 * 7 de setembro. Mas nada impedia — e, mais importante, o supervisor não tinha onde
 * declarar que a sede fecha, então um dia fechado ficava indistinguível de um dia
 * que ninguém planejou.
 *
 * **Um registro cobre um intervalo** (`data_inicio`/`data_fim`): recesso de julho é
 * uma linha, não quinze. Quando é um dia só, as duas datas são iguais.
 *
 * Escopo deliberadamente raso: **existe ou não existe operação**. Não há "operação
 * reduzida" porque nada leria esse estado hoje — a equipe reduzida se resolve na
 * escala e nas ausências, que já existem.
 */
export interface Feriado extends Auditoria {
  id: string;
  /**
   * Sede a que se aplica. **Vazio = todas** — que é o caso comum: as 18 sedes são
   * em Fortaleza, então feriado nacional, estadual e municipal se cadastra uma vez.
   */
  sede_id: string;
  /** Como aparece na tela. Ex.: "Independência", "Recesso de julho". */
  nome: string;
  /** Formato YYYY-MM-DD */
  data_inicio: string;
  /** Formato YYYY-MM-DD (igual ao início quando é um dia só) */
  data_fim: string;
  ativo: boolean;
}
