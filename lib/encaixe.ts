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
