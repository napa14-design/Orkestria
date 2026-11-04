/**
 * Qual sede a tela mostra: a que a pessoa escolheu nela; senão a que veio no link
 * (`?sede=`, a Central manda a sede que estava vendo); senão a primeira ativa.
 *
 * A do link só vale se estiver na lista que o servidor devolveu para esta pessoa:
 * a URL é só um pedido, e uma sede de fora faria a tela escrever onde não pode.
 * Sem a lista carregada, devolve vazio — nada é buscado na sede errada antes.
 */
export function sedeDaTela(
  sedes: { id: string; ativo: boolean }[] | undefined,
  escolhida: string,
  doLink: string | null,
): string {
  if (escolhida) return escolhida;
  if (doLink && sedes?.some((s) => s.ativo && s.id === doLink)) return doLink;
  return sedes?.find((s) => s.ativo)?.id ?? "";
}
