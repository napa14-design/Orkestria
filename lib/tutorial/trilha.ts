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

/**
 * Só existem dois modos, e é de propósito.
 *
 * Houve um terceiro, `"sucesso"`, que esperava a operação dar certo — criado em
 * 02/09/2026 para o tutorial parar de marcar etapa como concluída quando o
 * Salvar era barrado num formulário vazio. No mesmo dia o tutorial virou
 * **passeio guiado** ("abre o modal, explica, fecha") e nenhum passo pede mais
 * ação com resultado: o modo ficou sem uso e saiu junto. Se um dia um passo
 * voltar a exigir uma operação de verdade, ele volta — mas aí com um usuário.
 */
export type AvancarEm =
  /** Só explica; a pessoa clica em "Entendi". */
  | "leitura"
  /** Só avança quando ela clicar no alvo de verdade — abrir e fechar o modal. */
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
  /**
   * O que precisa existir para esta etapa fazer sentido, em português — ex.:
   * "um dia com tarefas montadas".
   *
   * Alguns botões do sistema só aparecem quando há dado ("★ Ensinar esta rota"
   * só existe se o dia tem tarefas). Numa sede recém-criada eles não estão lá, e
   * sem esta frase o holofote acusaria "tutorial desatualizado" — assustando
   * quem só ainda não chegou naquela parte. Com ela, o sistema **diz o motivo**
   * e oferece seguir adiante.
   *
   * Ausente = os alvos da etapa existem sempre; alvo faltando aí é defeito de
   * verdade, e deve gritar.
   */
  precisa?: string;
  passos: PassoTutorial[];
}

export const TRILHA: EtapaTutorial[] = [
  // ─────────────────────────── fundação ───────────────────────────
  {
    id: "locais",
    nome: "Onde ficam os locais",
    ganho: "Você sabe onde e como cadastrar os lugares da sua sede.",
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
        titulo: "É por aqui que se cadastra",
        texto:
          "Clique em Novo local para abrir o formulário. Vamos só olhar por dentro — você não precisa preencher nada agora.",
        avancarEm: "clique",
      },
      {
        alvo: "campo-metragem",
        titulo: "A metragem é o número que importa",
        texto:
          "É ela que dimensiona as tarefas cobradas por metro quadrado. Não precisa ser exata: uma estimativa razoável já faz o cálculo funcionar, e dá para corrigir quando você tiver o número certo. Os campos com * são os obrigatórios.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-cancelar",
        titulo: "Pode fechar",
        texto:
          "Clique em Cancelar. Você já sabe onde fica e o que o formulário pede — cadastre de verdade depois, com a lista da sua sede na mão.",
        avancarEm: "clique",
      },
    ],
  },
  {
    id: "tarefas",
    nome: "Onde ficam as tarefas",
    ganho: "Você entende como o sistema calcula o tempo de cada serviço.",
    rota: "/tarefas",
    passos: [
      {
        alvo: "crud-novo",
        titulo: "Agora o que se faz em cada lugar",
        texto:
          "Tarefa é o serviço: varrer a frente, limpar o banheiro masculino, recolher o café. Toda tarefa mora num local — foi por isso que os locais vieram primeiro. Clique em Nova tarefa para abrir o formulário; é só para olhar, não precisa preencher.",
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
        // O único dos cinco achados da planilha do Pré Sul que vira passo: é o
        // que BLOQUEIA. Quem não souber do campo tenta reproduzir o
        // "06:00 café + 06:00 limpa a sala" da própria planilha, leva 422 e
        // conclui que o sistema não aceita a realidade da operação.
        alvo: "campo-espera",
        titulo: "A tarefa que ocupa o relógio, não a pessoa",
        texto:
          "Café na cafeteira, roupa na máquina: a pessoa liga e sai para fazer outra coisa. Marque aqui e o sistema aceita outra tarefa no mesmo horário — sem isso ele bloqueia como sobreposição. No tempo base, informe os minutos DA PESSOA (colocar a água, ligar), não os do equipamento.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-cancelar",
        titulo: "Pode fechar",
        texto:
          "Clique em Cancelar. Quando for cadastrar de verdade, comece pelo que a equipe faz todo dia e vá completando conforme aparecer — não precisa ser tudo de uma vez.",
        avancarEm: "clique",
      },
    ],
  },
  {
    id: "equipe",
    nome: "Onde fica a equipe",
    ganho: "Você vê onde a jornada e os intervalos de cada pessoa são definidos.",
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
        titulo: "É por aqui que se cadastra",
        texto:
          "Clique em Novo funcionário para abrir o formulário. Só de olhar — não precisa preencher nada agora.",
        avancarEm: "clique",
      },
      {
        // Era `campo-intervalo_min`, de quando o intervalo era um número de
        // minutos. Virou o editor de faixas (`intervalos`) e o roteiro ficou
        // apontando para um campo que não existe mais: o passo caía em "Pular
        // este passo" e a lição sobre intervalos simplesmente não era dada.
        alvo: "campo-intervalos",
        titulo: "Os intervalos são o que ninguém lembra de descontar",
        texto:
          "Almoço, lanche, descanso. O sistema tira tudo isso da jornada antes de calcular a ocupação — é assim que ele evita programar alguém para trabalhar durante o almoço, que era o erro clássico da planilha.",
        avancarEm: "leitura",
      },
      {
        alvo: "crud-cancelar",
        titulo: "Pode fechar",
        texto:
          "Clique em Cancelar. Quando for cadastrar de verdade, faça a equipe toda antes de montar o primeiro dia: sem gente cadastrada, a agenda não tem colunas para receber tarefa.",
        avancarEm: "clique",
      },
    ],
  },
  {
    id: "qualificacoes",
    nome: "Onde ficam as habilitações",
    ganho: "Você sabe onde registrar treinamento e validade — e por que isso trava alocação.",
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
        titulo: "É por aqui que se registra",
        texto:
          "Clique em Nova qualificação para abrir o formulário. Dentro dele você escolhe a pessoa, o treinamento e a validade — vencido conta como não ter.",
        avancarEm: "clique",
      },
      {
        alvo: "crud-cancelar",
        titulo: "Pode fechar",
        texto:
          "Clique em Cancelar. Esta parte só é necessária se as suas tarefas exigirem treinamento — se nenhuma exigir, você pode nem usar esta tela.",
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
    precisa: "um dia com tarefas montadas na agenda",
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
          "Clique aqui. O sistema guarda a montagem deste dia como a rota padrão da sede. Nos próximos dias, um botão monta tudo — já pulando quem faltou e quem está de folga. Se a segunda (ou o sábado) tiver serviço próprio, monte esse dia e salve como outra rota marcando só os dias dela: as rotas se somam.",
        avancarEm: "clique",
      },
      {
        alvo: "duplicar-modelos",
        titulo: "E os dias fora do comum?",
        texto:
          "Formatura, feira, prova. Monte o dia do evento uma vez, abra aqui, vá em \"Rotas salvas\" e salve marcando que é um modelo de evento. No próximo, você aplica na véspera e o dia já amanhece programado.",
        avancarEm: "leitura",
      },
    ],
  },
  /**
   * A etapa que faltava — e a falta custou caro: em 02/09/2026 um supervisor
   * reclamou ao diretor que **não existia** montar o dia em um clique. Existia
   * desde sempre, no botão "⚡ Gerar o dia da rota padrão"; o que não existia
   * era alguém mostrar. A trilha ensinava a SALVAR a rota e nunca mostrava o
   * botão que a USA — o `ganho` da etapa anterior já prometia "montar o dia
   * vira um clique" e o clique não aparecia em passo nenhum.
   *
   * O nome na trilha é parte do conserto: quem só passa os olhos na lista da
   * Central já lê que o recurso existe.
   */
  {
    id: "gerar-o-dia",
    nome: "Gerar o dia em 1 clique",
    ganho: "O dia inteiro montado num clique, já pulando quem faltou.",
    rota: "/rotinas",
    precisa: "uma rota padrão salva e um dia ainda vazio",
    passos: [
      {
        titulo: "É aqui que o cadastro se paga",
        texto:
          "Você ensinou a rota da sede. A partir de agora não precisa montar dia nenhum na mão: o sistema monta, e você só ajusta o que fugiu do normal. O que era uma manhã de planilha vira um clique e alguns minutos de revisão.",
        avancarEm: "leitura",
      },
      {
        alvo: "campo-data",
        titulo: "Primeiro, escolha o dia que quer montar",
        texto:
          "Troque a data aqui para um dia que ainda está vazio — amanhã, por exemplo. O botão de gerar só aparece em dia vazio, para não passar por cima de um dia que você já montou.",
        avancarEm: "leitura",
      },
      {
        alvo: "gerar-dia",
        titulo: "É este o botão de um clique",
        texto:
          "\"⚡ Gerar o dia da rota padrão\". Um clique aqui monta a agenda inteira da sede: cada pessoa, cada tarefa, no horário da rota — já pulando quem está de férias, de folga ou com falta lançada, e avisando embaixo o que ficou de fora e por quê. Ele só aparece em dia vazio.",
        avancarEm: "leitura",
      },
      {
        alvo: "desfazer-geracao",
        titulo: "Gerou sem querer? Desfaz",
        texto:
          "Este botão remove os blocos que a máquina criou. O que você arrastou à mão fica, e nada que já tenha realizado registrado é apagado — então dá para clicar sem medo.",
        avancarEm: "leitura",
      },
      {
        alvo: "duplicar-modelos",
        titulo: "E a semana inteira de uma vez",
        texto:
          "Em \"Preencher dias\" você joga este dia (ou uma rota salva) para um período inteiro: escolhe de quando até quando, marca os dias da semana e o botão diz exatamente para onde vai. Sem período, ele copia para o próximo dia marcado.",
        avancarEm: "leitura",
      },
      {
        titulo: "O ciclo, em uma frase",
        texto:
          "Monta um dia normal uma vez → ensina a rota → todos os outros dias saem em um clique. Se a rotina mudar, monte o dia novo do jeito certo e ensine de novo: a rota da sede passa a ser essa.",
        avancarEm: "leitura",
      },
    ],
  },
  {
    id: "fichas",
    nome: "Imprimir as fichas",
    ganho: "A equipe recebe o dia no papel, sem celular e sem senha.",
    rota: "/rotinas",
    precisa: "um dia com tarefas montadas na agenda",
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
    precisa: "tarefas cujo horário já passou, esperando confirmação",
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
    nome: "Onde se registra uma falta",
    ganho: "Você sabe onde avisar o sistema de quem não veio.",
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
        titulo: "É por aqui que se registra",
        texto:
          "Clique para abrir o formulário. Assim que uma ausência é salva, a agenda daquela pessoa fica bloqueada e as tarefas dela aparecem como descobertas — aí a Central já sugere quem está livre e habilitado para cobrir.",
        avancarEm: "clique",
      },
      {
        alvo: "crud-cancelar",
        titulo: "Pode fechar",
        texto:
          "Clique em Cancelar. No dia em que faltar alguém de verdade, você já sabe o caminho — e leva menos de um minuto.",
        avancarEm: "clique",
      },
    ],
  },
  {
    id: "eventuais",
    nome: "Onde entra o trabalho fora da rotina",
    ganho: "Você sabe onde lançar o imprevisto para ele não virar ociosidade.",
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
        titulo: "É por aqui que se lança",
        texto:
          "Clique para abrir o formulário. Vale o esforço: é este registro que mostra, com número, quanto do tempo da sua equipe é consumido por coisa que ninguém planejou. Sem ele, o imprevisto aparece nos relatórios como ociosidade — e o problema vira culpa da equipe.",
        avancarEm: "clique",
      },
      {
        alvo: "crud-cancelar",
        titulo: "Pode fechar",
        texto:
          "Clique em Cancelar. O lançamento leva menos de um minuto e é feito depois que o serviço acontece, com o tempo real que levou.",
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
