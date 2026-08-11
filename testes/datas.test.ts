/**
 * "Hoje" no fuso da operação.
 *
 * O bug que estes casos travam: `hojeISO()` usava o fuso do ambiente. Na Vercel
 * (UTC) isso fazia o servidor virar o dia às 21h de Fortaleza, e a Central do dia
 * — que calcula a data no servidor — passava a mostrar o dia seguinte, vazio, no
 * horário em que o turno da noite fecharia o dia.
 *
 * Os horários abaixo são UTC de propósito: é assim que o servidor vê o mundo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diaDaSemana, hojeISO } from "@/lib/dateUtils";

describe("hojeISO no fuso da operação", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const em = (utc: string) => {
    vi.setSystemTime(new Date(utc));
    return hojeISO();
  };

  it("meio da tarde: dia óbvio", () => {
    expect(em("2026-08-11T12:00:00Z")).toBe("2026-08-11"); // 09:00 em Fortaleza
  });

  it("20:30 em Fortaleza ainda é o mesmo dia", () => {
    expect(em("2026-08-11T23:30:00Z")).toBe("2026-08-11");
  });

  it("22:30 em Fortaleza NÃO virou o dia — era aqui que a Central pulava", () => {
    // 01:30 UTC do dia 12 = 22:30 do dia 11 em Fortaleza.
    expect(em("2026-08-12T01:30:00Z")).toBe("2026-08-11");
  });

  it("23:59 em Fortaleza é o último instante do dia", () => {
    expect(em("2026-08-12T02:59:00Z")).toBe("2026-08-11");
  });

  it("00:00 em Fortaleza vira o dia", () => {
    expect(em("2026-08-12T03:00:00Z")).toBe("2026-08-12");
  });

  it("madrugada UTC ainda é o dia anterior em Fortaleza", () => {
    // 02:00 UTC do dia 12 = 23:00 do dia 11. É o caso simétrico do cron das 4h:
    // um job que rodasse às 02:00 UTC estaria gerando o dia de ONTEM.
    expect(em("2026-08-12T02:00:00Z")).toBe("2026-08-11");
  });

  it("o dia da semana de hoje sai coerente com a data de hoje", () => {
    vi.setSystemTime(new Date("2026-08-12T01:30:00Z")); // 22:30 de terça em Fortaleza
    expect(hojeISO()).toBe("2026-08-11");
    expect(diaDaSemana(hojeISO())).toBe(2); // terça
  });
});

describe("diaDaSemana", () => {
  it("não escorrega de dia por fuso (a data é montada ao meio-dia)", () => {
    expect(diaDaSemana("2026-08-11")).toBe(2); // terça
    expect(diaDaSemana("2026-08-15")).toBe(6); // sábado
    expect(diaDaSemana("2026-08-16")).toBe(0); // domingo
    expect(diaDaSemana("2026-08-17")).toBe(1); // segunda
  });
});
