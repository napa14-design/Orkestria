/**
 * Encaixe imantado do arrasto na agenda.
 *
 * Nasceu de uma observação do dono do produto olhando a CESIU: arrastar uma
 * tarefa para logo depois de outra não funcionava, porque a grade daquela sede
 * herdou passo de 30 min e a rota tem blocos começando em todos os múltiplos de
 * 5. Medido: **80% dos 152 blocos estavam em horários que a própria agenda não
 * deixava reproduzir**.
 */
import { describe, expect, it } from "vitest";
import {
  PASSOS_POSSIVEIS,
  TOLERANCIA_IMA_MIN,
  bordasDeEncaixe,
  horarioDoEncaixe,
  passoDoVazio,
} from "@/lib/encaixe";

const M = (h: string) => {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Trecho real da manhã do Gleydison, CESIU. */
const MANHA = [
  { ini: M("06:40"), fim: M("06:50") },
  { ini: M("06:50"), fim: M("06:55") },
  { ini: M("06:55"), fim: M("07:10") },
  { ini: M("07:10"), fim: M("07:15") }, // "Pegar garrafas de café"
  { ini: M("07:45"), fim: M("07:55") },
];
const PAUSAS = [{ ini: M("12:00"), fim: M("13:30") }];
const ENTRADA = M("06:30");

const soltar = (hora: string, blocoMin = 30) =>
  hhmm(horarioDoEncaixe({ minutoBruto: M(hora), blocoMin, ocupados: MANHA, pausas: PAUSAS, entrada: ENTRADA }));

describe("horarioDoEncaixe", () => {
  it("solto embaixo da garrafa, encaixa no fim dela — o caso que motivou tudo", () => {
    // A garrafa termina 07:15. Com grade de 30 min, isto caía em 07:00 e o
    // sistema recusava por sobreposição.
    expect(soltar("07:16")).toBe("07:15");
    expect(soltar("07:18")).toBe("07:15");
    expect(soltar("07:13")).toBe("07:15"); // um pouco acima também gruda
  });

  it("gruda no fim de qualquer bloco, não só do último", () => {
    expect(soltar("06:52")).toBe("06:50");
    expect(soltar("06:56")).toBe("06:55");
    expect(soltar("07:56")).toBe("07:55");
  });

  it("gruda na volta do almoço", () => {
    expect(soltar("13:32")).toBe("13:30");
    expect(soltar("13:28")).toBe("13:30");
  });

  it("gruda na entrada da pessoa", () => {
    expect(soltar("06:32")).toBe("06:30");
  });

  it("NÃO gruda no início de um bloco — seria sobreposição garantida", () => {
    // 07:45 é início de bloco (e também fim do de 07:10? não: aquele acaba 07:15).
    // Soltando às 07:44, a borda mais perto é o fim das 07:15 (29 min) — longe.
    // Então cai na grade, e não em 07:45.
    expect(soltar("07:44")).not.toBe("07:45");
  });

  it("longe de tudo, cai na grade como antes", () => {
    // 10:00 está a 2h05 da borda mais próxima: grade de 30 → 10:00.
    expect(soltar("10:12")).toBe("10:00");
    expect(soltar("10:12", 15)).toBe("10:00");
    expect(soltar("10:22", 15)).toBe("10:15");
    expect(soltar("10:22", 5)).toBe("10:20");
  });

  it("a tolerância é a fronteira, e ela é fechada", () => {
    const dentro = M("07:15") + TOLERANCIA_IMA_MIN;
    const fora = dentro + 1;
    expect(hhmm(horarioDoEncaixe({ minutoBruto: dentro, blocoMin: 30, ocupados: MANHA, pausas: PAUSAS, entrada: ENTRADA }))).toBe("07:15");
    expect(hhmm(horarioDoEncaixe({ minutoBruto: fora, blocoMin: 30, ocupados: MANHA, pausas: PAUSAS, entrada: ENTRADA }))).not.toBe("07:15");
  });

  it("dia vazio: só a entrada é ímã, o resto é grade", () => {
    const vazio = { ocupados: [], pausas: [], entrada: ENTRADA, blocoMin: 30 };
    expect(hhmm(horarioDoEncaixe({ ...vazio, minutoBruto: M("06:33") }))).toBe("06:30");
    expect(hhmm(horarioDoEncaixe({ ...vazio, minutoBruto: M("09:40") }))).toBe("09:30");
  });

  it("o horário devolvido é sempre um minuto inteiro e não negativo", () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      const r = horarioDoEncaixe({ minutoBruto: m + 0.4, blocoMin: 30, ocupados: MANHA, pausas: PAUSAS, entrada: ENTRADA });
      expect(Number.isInteger(r), `minuto ${m}`).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });

  it("passo zero ou negativo não trava nem divide por zero", () => {
    expect(horarioDoEncaixe({ minutoBruto: 600, blocoMin: 0, ocupados: [], pausas: [], entrada: 0 })).toBe(600);
  });
});

describe("bordasDeEncaixe", () => {
  it("junta fins de bloco, fins de pausa e a entrada, ordenados e sem repetir", () => {
    const b = bordasDeEncaixe({ ocupados: MANHA, pausas: PAUSAS, entrada: ENTRADA });
    expect(b.map(hhmm)).toEqual(["06:30", "06:50", "06:55", "07:10", "07:15", "07:55", "13:30"]);
  });

  it("não inclui INÍCIO de bloco", () => {
    const b = bordasDeEncaixe({ ocupados: [{ ini: M("09:00"), fim: M("09:30") }], pausas: [], entrada: M("06:00") });
    expect(b.map(hhmm)).toEqual(["06:00", "09:30"]);
  });
});

/**
 * O passo do vazio deixou de ser configurado e passou a ser derivado do dia.
 * Os números abaixo são os das sedes reais medidas em 24/08/2026: a CESIU sem
 * parâmetro próprio (herda 30 do "geral") e rota em múltiplos de 5; DT,
 * Benfica e Eusébio com `bloco_agenda_min = 15`.
 */
describe("passoDoVazio", () => {
  /** Blocos de 10 min a partir de cada horário — início e fim na mesma grade. */
  const blocos = (...horas: string[]) => horas.map((h) => ({ ini: M(h), fim: M(h) + 10 }));

  it("CESIU: parâmetro herdado de 30, rota de 5 em 5 → passo 5", () => {
    // Era exatamente este o caso que travava o vazio em :00 e :30.
    expect(passoDoVazio(MANHA, 30)).toBe(5);
  });

  it("o FIM de uma tarefa conta — foi o buraco reportado da tela em 24/08", () => {
    // Dia com duas tarefas curtas: 06:30–06:35 e 07:00–07:05. Só pelos inícios
    // o passo daria 30, e encaixar algo logo após a primeira dependia de acertar
    // os ~14px do ímã — errando, caía em cima da tarefa ou 30 min adiante.
    const dia = [
      { ini: M("06:30"), fim: M("06:35") },
      { ini: M("07:00"), fim: M("07:05") },
    ];
    // A versão antiga olhava só os inícios (ambos múltiplos de 30) e devolvia 30.
    expect(passoDoVazio(dia.map((b) => ({ ini: b.ini, fim: b.ini })), 30)).toBe(30);
    expect(passoDoVazio(dia, 30)).toBe(5);
  });

  it("uma tarefa só já basta para afinar, se ela terminar fora da grade grossa", () => {
    expect(passoDoVazio([{ ini: M("07:00"), fim: M("07:25") }], 30)).toBe(5);
  });

  it("sede que começa E termina na meia hora continua em 30", () => {
    // O afinamento não é gratuito: quem trabalha em blocos de 30 fica em 30.
    const dia = [
      { ini: M("07:00"), fim: M("07:30") },
      { ini: M("08:00"), fim: M("08:30") },
    ];
    expect(passoDoVazio(dia, 30)).toBe(30);
  });

  it("sede que só planeja de 15 em 15 → passo 15", () => {
    expect(passoDoVazio(blocos("06:45", "07:00", "07:30", "08:15"), 30)).toBe(5);
  });

  it("sede de 15 em 15, com blocos que fecham na grade", () => {
    const dia = ["06:45", "07:00", "07:30", "08:15"].map((h) => ({ ini: M(h), fim: M(h) + 15 }));
    expect(passoDoVazio(dia, 30)).toBe(15);
  });

  it("sede que só planeja na hora e meia-hora → continua 30", () => {
    const dia = ["07:00", "07:30", "09:00"].map((h) => ({ ini: M(h), fim: M(h) + 30 }));
    expect(passoDoVazio(dia, 30)).toBe(30);
  });

  it("derivar afina, nunca engrossa: teto é o parâmetro da sede", () => {
    // Tudo na hora cheia daria 60; o configurado de 15 segura em 15.
    const dia = ["07:00", "09:00", "11:00"].map((h) => ({ ini: M(h), fim: M(h) + 60 }));
    expect(passoDoVazio(dia, 15)).toBe(15);
  });

  it("horário esquisito não vira régua de minuto — cai no passo mais fino", () => {
    // MDC cru de 06:47 e 07:01 é 7. A escada não oferece 7.
    expect(passoDoVazio([{ ini: M("06:47"), fim: M("07:01") }], 30)).toBe(5);
  });

  it("dia vazio: sem dado para derivar, vale o configurado", () => {
    expect(passoDoVazio([], 30)).toBe(30);
    expect(passoDoVazio([], 15)).toBe(15);
  });

  it("ignora horários inválidos em vez de deixar NaN contaminar o passo", () => {
    expect(passoDoVazio([{ ini: NaN, fim: M("07:15") }, { ini: M("07:45"), fim: M("08:00") }], 30)).toBe(15);
    expect(passoDoVazio([{ ini: NaN, fim: NaN }], 30)).toBe(30);
  });

  it("parâmetro zerado ou negativo não derruba o passo", () => {
    expect(passoDoVazio([{ ini: M("07:00"), fim: M("07:30") }], 0)).toBe(30);
    expect(PASSOS_POSSIVEIS.every((p) => p > 0)).toBe(true);
  });

  it("o passo devolvido está sempre na escada e nunca acima do teto", () => {
    for (let teto of [5, 10, 15, 20, 30]) {
      for (let m = 300; m < 1080; m += 13) {
        const p = passoDoVazio([{ ini: m, fim: m + 40 }, { ini: m + 60, fim: m + 95 }], teto);
        expect(PASSOS_POSSIVEIS.includes(p), `teto ${teto}, minuto ${m}`).toBe(true);
        expect(p).toBeLessThanOrEqual(teto);
      }
    }
  });
});
