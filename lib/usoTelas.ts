/**
 * Coleta temporária de uso (04/11/2026): a consulta sobre a tela do dia concluiu
 * que ninguém sabe quais telas são abertas, e sem isso não dá para decidir o que
 * simplificar. Registra por sede e perfil, sem pessoa (decisão do dono).
 *
 * Desliga sozinha na data e é para sair do código depois da análise, junto com a
 * coleção `uso_telas`, que precisa estar apagada até `USO_APAGAR_ATE`.
 */
export const USO_INICIO = "2026-11-05";
/** Primeiro dia SEM coleta: 14 dias a partir do início. */
export const USO_FIM = "2026-11-19";
export const USO_APAGAR_ATE = "2026-12-19";

/** O que o navegador pode informar. A ficha em PDF é registrada só no servidor. */
export const TELAS_DO_CLIENTE: ReadonlySet<unknown> = new Set(["central", "dia", "semana", "acompanhamento"]);
export const TELA_FICHA = "ficha_pdf";

/** Escrito assim para uma data inválida na constante desligar, e não coletar para sempre. */
export function coletaAtiva(hoje: string): boolean {
  return hoje >= USO_INICIO && hoje < USO_FIM;
}
