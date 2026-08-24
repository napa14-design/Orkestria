/**
 * Onde a tarefa cai quando a pessoa solta o bloco na agenda.
 *
 * Antes, o horário era o **puro encaixe na grade**: `inicioGrade + slot ×
 * bloco_agenda_min`. Isso amarra o que se pode planejar ao passo configurado da
 * sede — e na CESIU, cujo passo herdado era 30 min, **80% dos blocos estavam em
 * horários que a própria agenda não deixava reproduzir**. Os blocos começam em
 * todos os múltiplos de 5 (`:05`, `:10`, `:20`, `:35`…); a grade só oferecia
 * `:00` e `:30`. Dava para arrastar para fora e não dava para arrastar de volta.
 *
 * A pergunta do dono do produto foi melhor que a minha resposta: *"isso não
 * deveria ser dinâmico? tipo quando eu coloco embaixo ele já se ajeita?"*.
 *
 * Então o horário passa a ser **imantado**: soltar perto de uma borda encaixa
 * nela. As bordas são só os pontos onde uma tarefa PODE começar sem pisar em
 * ninguém:
 *
 *  - o **fim** de um bloco já planejado (é o "coloquei embaixo da garrafa");
 *  - o **fim** de uma pausa (voltar do almoço/lanche já emendando);
 *  - a **entrada** da pessoa (começar o dia colado).
 *
 * O início de um bloco existente **não** é ímã: encaixar ali começaria a tarefa
 * exatamente quando outra começa, ou seja, sobreposição garantida.
 *
 * Longe de qualquer borda, cai na grade como antes — que continua sendo o
 * comportamento certo num vazio grande.
 */

export interface Faixa {
  ini: number;
  fim: number;
}

/**
 * Quão perto (em minutos) o ponto solto precisa estar de uma borda para grudar.
 *
 * 6 min ≈ 15px na escala normal (~2,4px/min): perto o bastante para o gesto
 * parecer proposital, longe o bastante para não capturar quem mirou no vazio.
 * Numa rota fina, as bordas ficam a cada 5 min, então nunca falta ímã por perto.
 */
export const TOLERANCIA_IMA_MIN = 6;

/**
 * Bordas em que uma tarefa pode começar, em ordem crescente e sem repetição.
 * Exportada porque o teste (e quem for depurar) precisa ver o que o ímã enxerga.
 */
export function bordasDeEncaixe(args: {
  ocupados: Faixa[];
  pausas: Faixa[];
  entrada: number;
}): number[] {
  const bordas = new Set<number>([args.entrada]);
  for (const o of args.ocupados) bordas.add(o.fim);
  for (const p of args.pausas) bordas.add(p.fim);
  return [...bordas].filter((b) => Number.isFinite(b)).sort((a, b) => a - b);
}

/**
 * Converte o ponto solto (em minutos do dia) no horário em que a tarefa começa.
 *
 * `minutoBruto` é contínuo — vem da posição do cursor, sem arredondar. Quem
 * chama não precisa mais saber o passo da grade para nada além do fallback.
 */
export function horarioDoEncaixe(args: {
  minutoBruto: number;
  blocoMin: number;
  ocupados: Faixa[];
  pausas: Faixa[];
  entrada: number;
  toleranciaMin?: number;
}): number {
  const { minutoBruto, blocoMin } = args;
  const tolerancia = args.toleranciaMin ?? TOLERANCIA_IMA_MIN;

  const bordas = bordasDeEncaixe(args);
  let melhor: number | null = null;
  let menorDistancia = Infinity;
  for (const b of bordas) {
    const d = Math.abs(b - minutoBruto);
    // `<` e não `<=`: com empate exato entre duas bordas equidistantes, fica a
    // primeira (a mais cedo) — decisão arbitrária, mas estável.
    if (d < menorDistancia) {
      menorDistancia = d;
      melhor = b;
    }
  }
  if (melhor !== null && menorDistancia <= tolerancia) return melhor;

  // Sem ímã por perto: grade, como sempre foi. `floor` e não `round` para não
  // mudar o que quem já usa espera do vazio.
  const passo = blocoMin > 0 ? blocoMin : 1;
  return Math.floor(minutoBruto / passo) * passo;
}

/**
 * Passo do vazio: de quanto em quanto tempo uma tarefa nova pode começar
 * quando a pessoa solta o bloco LONGE de qualquer borda.
 *
 * Antes isso era o `bloco_agenda_min` da sede — um parâmetro. Foi ele que
 * criou o problema original: a CESIU herdou 30 min do "geral" porque ninguém
 * configurou nada, e a rota dela é toda em múltiplos de 5. O ímã resolveu
 * encostar numa tarefa existente; o vazio continuava travado em `:00` e `:30`.
 *
 * A doutrina diz: *se dá para derivar do dado que já existe, derive*. E dá — o
 * ritmo de uma sede está escrito nos horários que ela já usa: o passo é o mais
 * grosso da escada abaixo que ainda reproduz **todos os instantes** do dia. Dá
 * 5 na CESIU, 15 na DT/Benfica/Eusébio e 30 numa sede que só planeja na hora
 * cheia. Ninguém precisa decidir nada.
 *
 * **Inícios E FINS**, e o "e fins" custou caro. Derivando só dos inícios, um dia
 * com duas tarefas em 06:30 e 07:00 (fins 06:35 e 07:05) derivava passo de 30 —
 * e aí encaixar algo logo após a primeira só era possível acertando os ~14px do
 * ímã: errando, caía em 06:30 (em cima da tarefa) ou em 07:00. Um precipício, e
 * quem reportou descreveu exatamente assim: *"é muito ruim de conseguir, o
 * ponteiro tem que ficar logo abaixo da tarefa 1"*.
 *
 * O fim de uma tarefa **é** um horário que o dia usa — e é justamente o horário
 * de "começar logo depois", que é o gesto mais comum da tela. Deixar de fora
 * quem se quer poder reproduzir era o erro.
 *
 * Derivar pode **afinar** o passo, nunca engrossá-lo: o teto continua sendo o
 * `bloco_agenda_min` da sede, que é também o tamanho da linha desenhada na
 * grade. Dia sem nenhum bloco: não há dado, então vale o configurado.
 */
/**
 * Passos considerados, do mais grosso para o mais fino. O MDC cru daria números
 * como 7 (dois blocos em `06:47` e `07:01`) — ninguém planeja limpeza de 7 em 7
 * minutos. A escada limita o derivado ao que uma pessoa reconheceria.
 */
export const PASSOS_POSSIVEIS = [30, 20, 15, 10, 5];

/**
 * Recebe as **faixas**, e não uma lista de minutos, de propósito: assim não
 * existe a chamada que passa só os inícios. Foi exatamente esse o defeito — a
 * função estava certa e quem chamava é que entregava metade do dado, e nenhum
 * teste unitário pegaria isso. Agora o compilador pega.
 */
export function passoDoVazio(blocos: Faixa[], passoConfigurado: number): number {
  const teto = passoConfigurado > 0 ? passoConfigurado : PASSOS_POSSIVEIS[0];
  const validos = blocos
    .flatMap((b) => [b.ini, b.fim])
    .filter((m) => Number.isFinite(m) && m > 0);
  if (validos.length === 0) return teto;
  // O passo certo é o mais GROSSO que ainda reproduz todos os instantes que a
  // sede já usa: se ela nunca começou nem terminou fora do :00/:30, não há por
  // que oferecer :05. Se saiu uma vez, a agenda passa a oferecer.
  const cabe = PASSOS_POSSIVEIS.find(
    (passo) => passo <= teto && validos.every((m) => m % passo === 0),
  );
  return cabe ?? Math.min(teto, PASSOS_POSSIVEIS[PASSOS_POSSIVEIS.length - 1]);
}
