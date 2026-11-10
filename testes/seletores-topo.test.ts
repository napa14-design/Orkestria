/**
 * Seletor de dia e de sede do topo da Agenda e do Acompanhamento (pedido do dono, 10/11/2026):
 * dia da semana escrito, "Hoje" só fora de hoje, e quem tem uma sede só vê o nome, sem lista.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SeletorDia, { rotuloDoDia } from "@/components/SeletorDia";
import SeletorSede from "@/components/SeletorSede";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import type { Sede } from "@/types";

const sede = (id: string, nome: string, ativo = true) => ({ id, nome_sede: nome, ativo }) as unknown as Sede;

describe("rótulo do dia", () => {
  it("escreve o dia da semana e omite o ano corrente", () => {
    expect(rotuloDoDia("2026-11-14", "2026-11-10")).toEqual({ semana: "Sábado", data: "14/11" });
    expect(rotuloDoDia("2026-11-10", "2026-11-10")).toEqual({ semana: "Terça", data: "10/11" });
  });
  it("mostra o ano quando o dia é de outro ano", () => {
    expect(rotuloDoDia("2025-12-31", "2026-01-02")).toEqual({ semana: "Quarta", data: "31/12/2025" });
  });
});

describe("seletor de dia", () => {
  const html = (data: string, passo?: number) => renderToStaticMarkup(createElement(SeletorDia, { data, aoMudar: () => {}, passo }));
  it("\"Hoje\" só aparece fora de hoje", () => {
    expect(html(hojeISO())).not.toContain(">Hoje<");
    expect(html(somarDias(hojeISO(), 1))).toContain(">Hoje<");
  });
  it("setas dizem se andam por dia ou por semana; o calendário nativo segue lá", () => {
    expect(html(hojeISO())).toContain('aria-label="Próximo dia"');
    expect(html(hojeISO(), 7)).toContain('aria-label="Próxima semana"');
    expect(html("2026-11-10")).toMatch(/type="date"[^>]*value="2026-11-10"/);
  });
});

describe("seletor de sede", () => {
  const html = (sedes: Sede[]) => renderToStaticMarkup(createElement(SeletorSede, { sedes, valor: sedes[0].id, aoMudar: () => {} }));
  it("uma sede ativa: só o nome, sem lista", () => {
    const h = html([sede("a", "Pré Jovita"), sede("b", "Inativa", false)]);
    expect(h).toContain("Pré Jovita");
    expect(h).not.toContain("<select");
  });
  it("várias: a lista, só com as ativas", () => {
    const h = html([sede("a", "Sul 1"), sede("b", "Sul 2"), sede("c", "Fechada", false)]);
    expect(h).toContain("<select");
    expect(h).toContain("Sul 2");
    expect(h).not.toContain("Fechada");
  });
});
