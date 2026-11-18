/**
 * Atividade adicional (18/11/2026, pedido da coordenação da UniBenfica + Consulta 6 com o Sol):
 * o trabalho fora da rota a que a pessoa é puxada (montar/desmontar evento do colégio) é
 * lançado UMA vez por pessoa, como serviço eventual de "Apoio a outro setor", com o TIPO do
 * que ela fez. O tipo descreve a ocorrência — nunca multiplica o tempo nem entra no déficit:
 * mudar só o tipo deixa a conta igual. Ocorrência mista: vale a maior exigência presente.
 */

export const EXIGENCIAS = [
  {
    valor: "atendimento",
    rotulo: "Atendimento e acompanhamento",
    dica: "Recepcionar, orientar ou acompanhar pessoas, sem mover mobiliário ou carga.",
  },
  {
    valor: "organizacao",
    rotulo: "Organização e decoração",
    dica: "Separar, posicionar ou montar materiais e peças pequenas, sem mover mobiliário ou carga.",
  },
  {
    valor: "cargas",
    rotulo: "Movimentação de mobiliário e cargas",
    dica: "Levantar, carregar, empurrar ou puxar à mão mesas, cadeiras, grades, peças de palco, jardineiras ou outros volumes.",
  },
  {
    valor: "nao_sei",
    rotulo: "Não sei informar",
    dica: "Quando não dá para saber o que a pessoa fez. Melhor que adivinhar.",
  },
] as const;

export type ExigenciaAtividade = (typeof EXIGENCIAS)[number]["valor"];

const VALORES: ReadonlySet<string> = new Set(EXIGENCIAS.map((e) => e.valor));

export function exigenciaValida(v: unknown): v is ExigenciaAtividade {
  return typeof v === "string" && VALORES.has(v);
}

/** Rótulo para tela; o legado sem tipo é "não classificado", não "leve". */
export function rotuloDaExigencia(v: unknown): string {
  return EXIGENCIAS.find((e) => e.valor === v)?.rotulo ?? "Não classificado";
}
