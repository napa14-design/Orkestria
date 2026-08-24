import type { Auditoria } from "./comum";

/**
 * Catálogo de tipos de ambiente — o que antes era uma lista fixa no código.
 *
 * Motivo, em uma frase do dono do produto: *"eles limpam objetos como
 * bebedouros, não apenas locais"*. As 18 sedes vão de educação infantil a
 * clínica, e nenhuma lista escrita por nós cobre todas — a prova é que
 * **consultório** faltava (41 locais da CESIU em "outros") enquanto **5 dos 11
 * tipos oferecidos nunca foram usados**.
 *
 * A objeção que este desenho responde: `tipo_local` é a chave de onde sai a
 * intensidade de limpeza, então tipo criado sem fator cairia em 1,0 calado.
 * Aqui **quem cria informa o fator** — é a mesma decisão que a ata de 17/07
 * tomou para o local ("o tipo de uso puxa o fator"), agora nas mãos de quem
 * conhece a sede.
 *
 * Os 12 tipos que já existiam viram registros com os ids de sempre
 * (`sala`, `banheiro`, …), então nenhum local precisa ser migrado; e
 * `FATOR_POR_TIPO_LOCAL` continua como rede de segurança para eles, para o
 * caso de o catálogo não ter sido carregado por quem calcula.
 */
export interface TipoLocalCatalogo extends Auditoria {
  id: string;
  nome: string;
  /**
   * Intensidade de limpeza do ambiente: 0,8 leve · 1,0 normal · 1,5 densa.
   * Só incide em tarefas dimensionadas pela área (`por_m2`/`por_unidade`) —
   * tempo fixo já é explícito. Ausente ou ≤ 0 equivale a 1,0.
   */
  fator_intensidade?: number;
  /** Texto curto que ajuda quem cadastra a escolher. Opcional. */
  descricao?: string;
  ativo: boolean;
}
