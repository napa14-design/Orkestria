/**
 * Totais da visão semanal (coluna "Semana" e linha "Total do dia"). A auditoria
 * de 22/10/2026 pegou o total contando o dia de quem estava ausente — a célula
 * dizia "Falta", e a soma da semana incluía as 8 h dela. Renderiza a grade e lê
 * o texto, como a pessoa lê.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SemanaGrid from "@/components/agenda/SemanaGrid";
import { PARAMETROS_PADRAO } from "@/lib/calculations";
import { somarDias } from "@/lib/dateUtils";
import type { Ausencia, Funcionario, RotinaPlanejada } from "@/types";

const SEG = "2099-01-05";
const DIAS = Array.from({ length: 7 }, (_, i) => somarDias(SEG, i));
const func = (id: string, nome: string): Funcionario =>
  ({ id, nome, genero: "feminino", sede_id: "dt", turno: "manha", entrada: "07:00", saida: "16:00", intervalo_min: 60,
    intervalo_inicio: "12:00", intervalo_fim: "13:00", intervalos: "12:00-13:00", cargo: "ASG", ativo: true, observacoes: "",
    criado_em: "", atualizado_em: "" }) as Funcionario;
const bloco = (data: string, f: string, min: number, status: RotinaPlanejada["status"] = "planejada"): RotinaPlanejada =>
  ({ id: `${data}-${f}-${min}`, data, funcionario_id: f, sede_id: "dt", tarefa_id: "t", local_id: "l", inicio_planejado: "07:00",
    fim_planejado: "15:00", tempo_previsto_min: min, tempo_visual_min: min, blocos_ocupados: 1, status, observacao: "",
    supervisor_id: "u", criado_em: "", atualizado_em: "" }) as RotinaPlanejada;
/** Texto de cada linha da tabela (cabeçalho, pessoas, total). */
function linhas(funcionarios: Funcionario[], rotinas: RotinaPlanejada[], ausencias: Ausencia[] = []): string[] {
  const html = renderToStaticMarkup(
    createElement(SemanaGrid, {
      funcionarios, rotinas, ausencias, tarefas: [], parametros: PARAMETROS_PADRAO, datas: DIAS, dataSelecionada: SEG, aoAbrirDia: () => {},
    }),
  );
  return html.split("<tr").slice(1).map((l) => l.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

describe("visão semanal: totais", () => {
  it("soma a semana da pessoa e o dia da equipe", () => {
    const [, ana, bia, total] = linhas(
      [func("a", "Ana"), func("b", "Bia")],
      [bloco(DIAS[0], "a", 480), bloco(DIAS[1], "a", 240), bloco(DIAS[0], "b", 480)],
    );
    expect(ana).toContain("2 dia(s) · 12h");
    expect(bia).toContain("1 dia(s) · 8h");
    expect(total).toContain("2 tarefas · 16h"); // segunda: Ana + Bia
    expect(total).toContain("1 tarefas · 4h"); // terça: só Ana
  });

  it("o dia de quem está AUSENTE não entra em total nenhum", () => {
    const ausencia = { id: "x", funcionario_id: "a", sede_id: "dt", tipo: "falta", data_inicio: DIAS[1], data_fim: DIAS[1] } as Ausencia;
    const [, ana, total] = linhas([func("a", "Ana")], [bloco(DIAS[0], "a", 480), bloco(DIAS[1], "a", 480)], [ausencia]);
    expect(ana).toContain("Falta");
    expect(ana).toContain("1 dia(s) · 8h");
    expect(ana).not.toContain("2 dia(s)");
    expect(total.match(/\d+ tarefas ·/gu)).toEqual(["1 tarefas ·"]); // só segunda tem total
  });

  it("quem está fora do filtro de turno e o bloco cancelado não somam", () => {
    const [, ana, total] = linhas(
      [func("a", "Ana")],
      [bloco(DIAS[0], "a", 480), bloco(DIAS[0], "a", 120, "cancelada"), bloco(DIAS[0], "fora-da-grade", 600)],
    );
    expect(ana).toContain("1 dia(s) · 8h");
    expect(total).toContain("1 tarefas · 8h");
  });
});
