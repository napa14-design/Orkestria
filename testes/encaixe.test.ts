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
import { TOLERANCIA_IMA_MIN, bordasDeEncaixe, horarioDoEncaixe } from "@/lib/encaixe";

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
