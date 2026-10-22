/**
 * Resumo do Chromos já calculado, guardado no banco (22/10/2026). Cada geração
 * relê o mês inteiro de todas as sedes (~9,5 mil leituras em outubro, e
 * crescendo); o cache em memória não passa de uma instância da Vercel para a
 * outra, então quem abrisse o painel e trocasse o período algumas vezes gerava
 * dezenas de milhares de leituras numa hora. Daqui, a releitura custa uma.
 *
 * Dado DERIVADO, não de negócio: fica fora do histórico de alterações.
 */
export interface CacheResumo {
  /** `<de>_<ate>`, ex.: "2026-10_2026-10". */
  id: string;
  /** O corpo da resposta, em JSON. */
  corpo: string;
  /** ISO: depois disto, recalcula. */
  expira_em: string;
  criado_em: string;
}
