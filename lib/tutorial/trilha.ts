/**
 * A trilha de aprendizado — **todo o roteiro do tutorial mora aqui**, como
 * dado.
 *
 * A regra é essa: nenhum texto, ordem ou alvo de passo espalhado pelas telas.
 * Depois do piloto vamos querer mexer bastante (trocar palavra, cortar passo,
 * inverter ordem), e isso tem que ser edição de texto neste arquivo, não
 * refatoração.
 *
 * **Alvos são marcadores `data-tour`, nunca texto de botão.** Rótulo muda —
 * "Planejar período" virou "Duplicar e modelos" numa única semana — e um
 * tutorial que procura por texto quebra em silêncio, apontando para o vazio.
 */

export type AvancarEm =
  /** Só explica; a pessoa clica em "Entendi". */
  | "leitura"
  /** Só avança quando ela clicar no alvo de verdade. É o que ensina. */
  | "clique"
  /** Avança sozinho quando a rota da tela mudar (passos de navegação). */
  | "rota";

export interface PassoTutorial {
  /** Marcador `data-tour` do elemento destacado. Vazio = balão centralizado. */
  alvo?: string;
  titulo: string;
  texto: string;
  avancarEm?: AvancarEm;
  /** Rota esperada depois do passo (só para `avancarEm: "rota"`). */
  rotaDestino?: string;
}

export interface EtapaTutorial {
  id: string;
  /** Rótulo na trilha da Central. */
  nome: string;
  /** Uma linha dizendo o que a pessoa ganha ao terminar. */
  ganho: string;
  /** Tela em que esta etapa acontece — dispara na primeira visita. */
  rota: string;
  passos: PassoTutorial[];
}

export const TRILHA: EtapaTutorial[] = [
  {
    id: "locais",
    nome: "Cadastrar os locais",
    ganho: "O sistema passa a saber onde a sua equipe trabalha.",
    rota: "/locais",
    passos: [
      {
        titulo: "Comece pelos lugares",
        texto:
          "Local é cada espaço que a sua equipe limpa ou atende: a recepção, o banheiro do térreo, o corredor das salas. Na planilha eles eram só um texto na linha; aqui viram cadastro, e é isso que permite o sistema calcular tempo sozinho.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-novo",
        titulo: "Cadastre o primeiro",
        texto:
          "Clique em Novo local. Comece pelo mais óbvio da sua sede — a recepção, a portaria — só para ver como é. Você cadastra o resto depois, com calma.",
        avancarEm: "clique",
      },
      {
        alvo: "campo-metragem",
        titulo: "A metragem é o número que importa",
        texto:
          "É ela que dimensiona as tarefas cobradas por metro quadrado. Não precisa ser exata: uma estimativa razoável já faz o cálculo funcionar, e dá para corrigir quando você tiver o número certo.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-salvar",
        titulo: "Salve e veja aparecer",
        texto:
          "Clique em Salvar. O local entra na lista e já fica disponível para receber tarefas — que é o próximo passo da trilha.",
        avancarEm: "clique",
      },
    ],
  },
];

/** Etapa cujo roteiro acontece nesta rota. */
export function etapaDaRota(rota: string): EtapaTutorial | undefined {
  return TRILHA.find((e) => e.rota === rota);
}

export function etapaPorId(id: string): EtapaTutorial | undefined {
  return TRILHA.find((e) => e.id === id);
}
