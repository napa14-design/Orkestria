/** O total de funcionários por unidade, no topo da tela de Funcionários (25/11/2026). */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResumoEquipe from "@/components/funcionarios/ResumoEquipe";
import { resumoEquipe } from "@/lib/resumoEquipe";

const HOJE = "2026-11-25";
const SEDES = [
  { id: "s2", nome_sede: "Unidade 2" },
  { id: "s10", nome_sede: "Unidade 10" },
  { id: "vazia", nome_sede: "Vazia" },
];
const f = (sede_id: string, x: { ativo?: boolean; desligado_em?: string } = {}) => ({ sede_id, ativo: true, desligado_em: "", ...x });
const EQUIPE = [
  f("s10"),
  f("s2"),
  f("s2", { desligado_em: "2026-12-10" }), // aviso prévio: ainda está
  f("s2", { ativo: false }), // inativa sem desligamento: na lista, não ativa
  f("s2", { ativo: false, desligado_em: HOJE }), // saiu hoje
  f("s2", { desligado_em: "2026-01-10" }), // saiu, com `ativo` ainda verdadeiro no banco
];

describe("resumoEquipe", () => {
  it("conta por unidade e no total; quem saiu não conta, aviso prévio conta, inativo só no total", () => {
    expect(resumoEquipe(EQUIPE, SEDES, HOJE)).toEqual({
      porSede: [
        { sede_id: "s2", nome: "Unidade 2", ativos: 2, total: 3 },
        { sede_id: "s10", nome: "Unidade 10", ativos: 1, total: 1 },
      ],
      ativos: 3,
      total: 4,
    });
  });

  it("sem ninguém: tudo zero", () => expect(resumoEquipe([], SEDES, HOJE)).toEqual({ porSede: [], ativos: 0, total: 0 }));
});

describe("a faixa", () => {
  const html = (equipe: typeof EQUIPE, sedeId: string) =>
    renderToStaticMarkup(createElement(ResumoEquipe, { resumo: resumoEquipe(equipe, SEDES, HOJE), sedeId })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  it("a unidade da lista, o total das unidades e a quebra por unidade", () => {
    expect(html(EQUIPE, "s2")).toBe(
      "Funcionários Unidade 2: 2 de 3 ativos Total em 2 unidades: 3 de 4 ativos ▾ ver por unidade Unidade 2 2 de 3 Unidade 10 1",
    );
  });

  it("\"Todas as sedes\": só o total e a quebra", () => expect(html(EQUIPE, "")).toMatch(/^Funcionários Total em 2 unidades: 3 de 4 ativos ▾ ver/));

  it("quem opera uma unidade só não vê total repetido nem quebra", () => expect(html([f("s2")], "s2")).toBe("Funcionários Unidade 2: 1 ativo"));

  it("enquanto não carregou ninguém, não aparece", () => expect(html([], "s2")).toBe(""));
});
