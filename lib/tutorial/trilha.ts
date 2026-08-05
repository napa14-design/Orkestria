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
 *
 * **Tom:** "faça comigo", não "veja isto". A pessoa termina a trilha com a sede
 * montada de verdade, não com um passeio assistido. Por isso o texto fala da
 * planilha que ela já domina, e não das telas do sistema.
 */

export type AvancarEm =
  /** Só explica; a pessoa clica em "Entendi". */
  | "leitura"
  /** Só avança quando ela clicar no alvo de verdade. É o que ensina. */
  | "clique";

export interface PassoTutorial {
  /** Marcador `data-tour` do elemento destacado. Vazio = balão centralizado. */
  alvo?: string;
  titulo: string;
  texto: string;
  avancarEm?: AvancarEm;
}

export interface EtapaTutorial {
  id: string;
  /** Rótulo na trilha da Central. */
  nome: string;
  /** Uma linha dizendo o que a pessoa ganha ao terminar. */
  ganho: string;
  /** Tela em que esta etapa acontece. Várias etapas podem dividir a mesma. */
  rota: string;
  passos: PassoTutorial[];
}

export const TRILHA: EtapaTutorial[] = [
  // ─────────────────────────── fundação ───────────────────────────
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
  {
    id: "tarefas",
    nome: "Cadastrar as tarefas",
    ganho: "Cada serviço passa a ter tempo e frequência calculados.",
    rota: "/tarefas",
    passos: [
      {
        titulo: "Agora o que se faz em cada lugar",
        texto:
          "Tarefa é o serviço: varrer a frente, limpar o banheiro masculino, recolher o café. Toda tarefa mora num local — foi por isso que os locais vieram primeiro.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-novo",
        titulo: "Cadastre uma tarefa do local que você acabou de criar",
        texto:
          "Clique em Nova tarefa. Escolha uma que você faz todo dia e sabe de cabeça quanto tempo leva — é a mais fácil de conferir depois.",
        avancarEm: "clique",
      },
      {
        alvo: "campo-regra_calculo",
        titulo: "Aqui está a diferença para a planilha",
        texto:
          "Na planilha você escrevia o tempo na mão. Aqui você diz COMO se calcula: tempo fixo (sempre 20 min), por metro quadrado (usa a metragem do local) ou por quantidade. Escolhido o jeito, o sistema recalcula sozinho quando algo mudar.",
        avancarEm: "leitura",
      },
      {
        alvo: "campo-frequencia",
        titulo: "E com que frequência ela acontece",
        texto:
          "Diária, semanal, mensal. É isso que faz o sistema saber, sozinho, que a limpeza de vidro venceu — sem você precisar lembrar de nada.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-salvar",
        titulo: "Salve",
        texto:
          "Repita para as tarefas principais da sede. Não precisa ser tudo hoje: comece pelo que a equipe faz todo dia, e vá completando conforme aparecer.",
        avancarEm: "clique",
      },
    ],
  },
  {
    id: "equipe",
    nome: "Cadastrar a equipe",
    ganho: "O sistema passa a saber quanto tempo cada pessoa realmente tem.",
    rota: "/funcionarios",
    passos: [
      {
        titulo: "Quem faz o trabalho",
        texto:
          "Aqui entram as pessoas da sua equipe. O que o sistema precisa não é o cadastro do RH — é o horário: entrada, saída, escala e intervalos.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-novo",
        titulo: "Cadastre uma pessoa",
        texto: "Clique em Novo funcionário e comece por alguém da sua equipe fixa.",
        avancarEm: "clique",
      },
      {
        alvo: "campo-intervalo_min",
        titulo: "Os intervalos são o que ninguém lembra de descontar",
        texto:
          "Almoço, lanche, descanso. O sistema tira tudo isso da jornada antes de calcular a ocupação — é assim que ele evita programar alguém para trabalhar durante o almoço, que era o erro clássico da planilha.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-salvar",
        titulo: "Salve",
        texto:
          "Cadastre a equipe toda antes de montar o primeiro dia. Sem gente cadastrada, a agenda não tem colunas para receber tarefa.",
        avancarEm: "clique",
      },
    ],
  },
  {
    id: "qualificacoes",
    nome: "Definir quem pode fazer o quê",
    ganho: "O sistema bloqueia alocar quem não tem a habilitação em dia.",
    rota: "/qualificacoes",
    passos: [
      {
        titulo: "Nem todo mundo pode fazer tudo",
        texto:
          "Trabalho em altura, produto químico controlado, espaço confinado. Se a tarefa exige treinamento, o sistema não deixa você alocar quem não tem — nem por engano, num dia corrido.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-novo",
        titulo: "Registre uma habilitação",
        texto:
          "Clique em Nova qualificação, escolha a pessoa e o treinamento que ela tem, com a validade. Vencido conta como não ter.",
        avancarEm: "clique",
      },
      {
        alvo: "crud-salvar",
        titulo: "Salve",
        texto:
          "Esta parte só é necessária se as suas tarefas exigirem treinamento. Se nenhuma exigir, pode seguir para montar o dia.",
        avancarEm: "clique",
      },
    ],
  },

  // ─────────────────────────── o dia ───────────────────────────
  {
    id: "central",
    nome: "Entender a Central",
    ganho: "Você abre o sistema e já sabe o que precisa da sua decisão.",
    rota: "/inicio",
    passos: [
      {
        titulo: "Esta é a tela em que o seu dia começa",
        texto:
          "Ela não é um menu nem um relatório. Ela mostra um assunto só: o que está travando o dia agora.",
        avancarEm: "leitura",
      },
      {
        alvo: "central-proxima",
        titulo: "Uma decisão de cada vez",
        texto:
          "O cartão grande é a próxima coisa que depende de você — com o botão que resolve ali mesmo. Quando não há nada travando, ele diz isso também, e você pode tocar o dia sem abrir mais nada.",
        avancarEm: "leitura",
      },
    ],
  },
  {
    id: "montar-dia",
    nome: "Montar o dia",
    ganho: "A agenda do dia fica pronta, com a conta da jornada feita.",
    rota: "/rotinas",
    passos: [
      {
        titulo: "A sua planilha, virada de lado",
        texto:
          "Cada coluna é uma pessoa da equipe. Cada faixa é meia hora do dia. Cada bloco é uma tarefa no horário de alguém. É a mesma informação da planilha, arrumada de um jeito em que dá para ver o buraco.",
        avancarEm: "leitura",
      },
      {
        alvo: "paleta-tarefas",
        titulo: "As tarefas ficam aqui do lado",
        texto:
          "Arraste a tarefa daqui para a coluna da pessoa, na hora certa. Não existe botão de salvar: o sistema guarda no momento em que você solta.",
        avancarEm: "leitura",
      },
      {
        alvo: "painel-ocupacao",
        titulo: "A conta que você fazia na calculadora",
        texto:
          "A ocupação de cada pessoa aparece pronta, já descontando os intervalos. Quem passou do limite fica em vermelho — e isso é aviso, não erro. Você decide se mantém assim.",
        avancarEm: "leitura",
      },
    ],
  },
  {
    id: "ensinar-rota",
    nome: "Ensinar a rota da sede",
    ganho: "A partir daqui, montar o dia vira um clique.",
    rota: "/rotinas",
    passos: [
      {
        titulo: "Este é o passo que encolhe o seu trabalho",
        texto:
          "Você acabou de montar um dia normal da sua sede. Em vez de repetir isso amanhã e depois de amanhã, ensine essa rota ao sistema uma vez.",
        avancarEm: "leitura",
      },
      {
        alvo: "ensinar-rota",
        titulo: "Ensinar esta rota",
        texto:
          "Clique aqui. O sistema guarda a montagem deste dia como a rota padrão da sede. Nos próximos dias, um botão monta tudo — já pulando quem faltou e quem está de folga.",
        avancarEm: "clique",
      },
      {
        alvo: "duplicar-modelos",
        titulo: "E os dias fora do comum?",
        texto:
          "Formatura, feira, prova. Monte o dia do evento uma vez, abra aqui e salve marcando que é um modelo de evento. No próximo, você aplica na véspera e o dia já amanhece programado.",
        avancarEm: "leitura",
      },
    ],
  },
  {
    id: "fichas",
    nome: "Imprimir as fichas",
    ganho: "A equipe recebe o dia no papel, sem celular e sem senha.",
    rota: "/rotinas",
    passos: [
      {
        alvo: "imprimir-fichas",
        titulo: "O dia vai para a mão de quem executa",
        texto:
          "Cada pessoa recebe a folha dela: as tarefas do dia nos horários, os EPIs e o espaço para assinar. Ninguém da equipe precisa de aparelho nem de acesso ao sistema.",
        avancarEm: "leitura",
      },
      {
        titulo: "E a folha volta por foto",
        texto:
          "No fim do turno você fotografa a ficha assinada em Operação › Conferir ficha. O sistema reconhece de quem é pelo código impresso e lê as marcações sozinho.",
        avancarEm: "leitura",
      },
    ],
  },
  {
    id: "confirmar",
    nome: "Confirmar o realizado",
    ganho: "O previsto vira comparação com o que aconteceu de verdade.",
    rota: "/rotinas",
    passos: [
      {
        alvo: "confirmar-realizados",
        titulo: "Fechar o dia é rápido de propósito",
        texto:
          "A tarefa que correu como planejado é um clique só, na própria linha. Num dia de quarenta tarefas, trinta e cinco são trinta e cinco cliques.",
        avancarEm: "leitura",
      },
      {
        titulo: "Só o desvio dá trabalho",
        texto:
          "O que fugiu do plano abre o formulário completo, com horário real e justificativa. É esse contraste que gera o número de ociosidade — e é por isso que vale registrar o desvio com honestidade, não arredondar.",
        avancarEm: "leitura",
      },
    ],
  },

  // ─────────────────────────── exceções ───────────────────────────
  {
    id: "ausencias",
    nome: "Registrar uma falta",
    ganho: "A agenda se reorganiza e a Central sugere quem cobre.",
    rota: "/ausencias",
    passos: [
      {
        titulo: "Quando alguém não vem",
        texto:
          "Registre aqui dizendo quem foi e o motivo: falta, atestado, férias ou folga. Importante: isto serve para reorganizar o dia — não substitui o lançamento na folha de ponto.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-novo",
        titulo: "Registre a ausência",
        texto:
          "Assim que você salvar, a agenda daquela pessoa fica bloqueada e as tarefas dela aparecem como descobertas. Aí é só voltar à Central: quando existe alguém livre e habilitado, ela já sugere pronto.",
        avancarEm: "clique",
      },
    ],
  },
  {
    id: "eventuais",
    nome: "Registrar trabalho fora da rotina",
    ganho: "O imprevisto deixa de parecer folga nos números.",
    rota: "/eventuais",
    passos: [
      {
        titulo: "O que não estava programado",
        texto:
          "Preparar café para uma reunião, descarregar um caminhão, apoiar um imprevisto. Registre depois que acontecer, com o tempo que levou.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-novo",
        titulo: "Vale o esforço de registrar",
        texto:
          "É isto que mostra, com número, quanto do tempo da sua equipe é consumido por coisa que ninguém planejou. Sem esse registro, o imprevisto aparece nos relatórios como ociosidade — e o problema vira culpa da equipe.",
        avancarEm: "clique",
      },
    ],
  },
];

/**
 * Etapas desta tela, na ordem da trilha.
 *
 * Devolve lista porque a agenda hospeda quatro etapas (montar, ensinar, fichas,
 * confirmar) — quem chama escolhe a primeira ainda não concluída.
 */
export function etapasDaRota(rota: string): EtapaTutorial[] {
  return TRILHA.filter((e) => e.rota === rota);
}

export function etapaPorId(id: string): EtapaTutorial | undefined {
  return TRILHA.find((e) => e.id === id);
}
