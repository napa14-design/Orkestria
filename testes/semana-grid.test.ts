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
import type { Ausencia, Feriado, Funcionario, RotinaPlanejada, ServicoEventual } from "@/types";

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
function linhas(funcionarios: Funcionario[], rotinas: RotinaPlanejada[], ausencias: Ausencia[] = [], eventuais: ServicoEventual[] = [], feriados: Feriado[] = []): string[] {
  const html = renderToStaticMarkup(
    createElement(SemanaGrid, {
      funcionarios, rotinas, eventuais, feriados, ausencias, tarefas: [], parametros: PARAMETROS_PADRAO, datas: DIAS, dataSelecionada: SEG, aoAbrirDia: () => {},
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

  describe("serviço eventual (o bloco de teste vai das 07:00 às 15:00)", () => {
    const eventual = (data: string, f: string, inicio: string, fim: string, tempo_min: number) =>
      ({ id: `${data}-${f}-${inicio}`, sede_id: "dt", funcionario_id: f, data, inicio, fim, tempo_min, tipo: "eventual" }) as ServicoEventual;

    it("soma só o que não tinha tarefa, na célula, na semana e no total do dia", () => {
      const [, ana, total] = linhas(
        [func("a", "Ana")],
        [bloco(DIAS[0], "a", 480)],
        [],
        [eventual(DIAS[0], "a", "14:00", "16:00", 120)], // 1 h sobre a tarefa, 1 h livre
      );
      expect(ana).toContain("1 tarefas · 9h");
      expect(ana).toContain("1 dia(s) · 9h");
      expect(total).toContain("1 tarefas · 9h");
      expect(total).toMatch(/1 tarefas · 9h 113% · 1 pessoa/u); // a média do dia também sobe: 9 h de 8 h
    });

    it("cada eventual fica na célula da sua pessoa e do seu dia", () => {
      const [, ana, bia] = linhas(
        [func("a", "Ana"), func("b", "Bia")],
        [bloco(DIAS[0], "a", 480), bloco(DIAS[1], "a", 480), bloco(DIAS[0], "b", 480)],
        [],
        [eventual(DIAS[1], "a", "15:00", "16:00", 60)],
      );
      expect(ana.match(/1 tarefas · \S+/gu)).toEqual(["1 tarefas · 8h", "1 tarefas · 9h"]);
      expect(bia.match(/\d+ tarefas · \S+/gu)).toEqual(["1 tarefas · 8h"]);
    });

    it("em dia de escala sem agenda, o eventual aparece e entra na semana", () => {
      const [, ana, total] = linhas([func("a", "Ana")], [], [], [eventual(DIAS[2], "a", "09:00", "10:35", 95)]);
      expect(ana).toContain("0 tarefas · 1h35");
      expect(ana).toContain("1 dia(s) · 1h35");
      expect(total).toMatch(/0 tarefas · 1h35 20% · 1 pessoa/u);
    });

    it("3 dias cheios + 2 só com eventual cheio dão 100%, não 167%", () => {
      const [, ana] = linhas(
        [func("a", "Ana")],
        [bloco(DIAS[0], "a", 480), bloco(DIAS[1], "a", 480), bloco(DIAS[2], "a", 480)],
        [],
        [eventual(DIAS[3], "a", "07:00", "15:00", 480), eventual(DIAS[4], "a", "07:00", "15:00", 480)],
      );
      expect(ana).toContain("5 dia(s) · 40h");
      expect(ana).toContain("100% média");
    });

    it("1 h no sábado de quem é de segunda a sexta não derruba a semana cheia", () => {
      const [, ana] = linhas(
        [func("a", "Ana")],
        [bloco(DIAS[0], "a", 480), bloco(DIAS[1], "a", 480)],
        [],
        [eventual(DIAS[5], "a", "09:00", "10:00", 60)],
      );
      expect(ana).toContain("2 dia(s) · 17h");
      expect(ana).toContain("106% média");
    });

    it("1 h em feriado também não derruba a semana", () => {
      const feriado = { id: "f", sede_id: "", nome: "Feriado", data_inicio: DIAS[2], data_fim: DIAS[2], ativo: true } as Feriado;
      const [, ana, total] = linhas(
        [func("a", "Ana")],
        [bloco(DIAS[0], "a", 480), bloco(DIAS[1], "a", 480)],
        [],
        [eventual(DIAS[2], "a", "09:00", "10:00", 60)],
        [feriado],
      );
      expect(ana).toContain("2 dia(s) · 17h");
      expect(ana).toContain("106% média");
      // Há horas no dia, mas nenhuma jornada para medir: não mostra um "0%" que contradiz a célula.
      expect(total).toMatch(/0 tarefas · 1h(?! \d)/u);
      expect(total).not.toContain("0% · 0 pessoa");
    });

    it("só eventual em feriado ou folga: horas na célula e na semana, sem % nem barra", () => {
      const feriado = { id: "f", sede_id: "", nome: "Feriado", data_inicio: DIAS[2], data_fim: DIAS[2], ativo: true } as Feriado;
      for (const [dia, feriados] of [[DIAS[2], [feriado]], [DIAS[5], []]] as const) {
        const [, ana, total] = linhas([func("a", "Ana")], [], [], [eventual(dia, "a", "09:00", "10:00", 60)], [...feriados]);
        expect(ana).toContain("0 tarefas · 1h");
        expect(ana).toContain("0 dia(s) · 1h"); // antes, a coluna Semana dizia "—" ao lado das horas
        expect(ana).not.toMatch(/\d%/u); // nem 13% na célula, nem média
        expect(total).toMatch(/0 tarefas · 1h(?! \d)/u);
        expect(total).not.toMatch(/\d%/u);
      }
    });

    it("sem nada na semana, a coluna segue com o traço", () => {
      const [, ana] = linhas([func("a", "Ana")], []);
      expect(ana).toContain("—");
      expect(ana).not.toContain("dia(s)");
    });

    it("a célula explica de onde vêm as horas a mais", () => {
      const html = renderToStaticMarkup(
        createElement(SemanaGrid, {
          funcionarios: [func("a", "Ana")], rotinas: [bloco(DIAS[0], "a", 480)], eventuais: [eventual(DIAS[0], "a", "15:00", "16:00", 60)], feriados: [], ausencias: [],
          tarefas: [], parametros: PARAMETROS_PADRAO, datas: DIAS, dataSelecionada: SEG, aoAbrirDia: () => {},
        }),
      );
      expect(html).toContain("Inclui 1h de serviço eventual fora das tarefas");
    });

    it("o total de cada dia só soma o eventual daquele dia", () => {
      const [, , total] = linhas(
        [func("a", "Ana")],
        [bloco(DIAS[0], "a", 480), bloco(DIAS[1], "a", 480)],
        [],
        [eventual(DIAS[1], "a", "15:00", "16:00", 60)],
      );
      expect(total).toMatch(/1 tarefas · 8h 100% · 1 pessoa/u);
      expect(total).toMatch(/1 tarefas · 9h 113% · 1 pessoa/u);
    });

    it("dia de ausência e pessoa fora da grade não somam", () => {
      const ausencia = { id: "x", funcionario_id: "a", sede_id: "dt", tipo: "falta", data_inicio: DIAS[1], data_fim: DIAS[1] } as Ausencia;
      const [, ana, total] = linhas(
        [func("a", "Ana")],
        [bloco(DIAS[0], "a", 480)],
        [ausencia],
        [eventual(DIAS[1], "a", "09:00", "10:00", 60), eventual(DIAS[0], "fora-da-grade", "16:00", "17:00", 60)],
      );
      expect(ana).toContain("1 dia(s) · 8h");
      expect(total).toContain("1 tarefas · 8h");
    });
  });
});
