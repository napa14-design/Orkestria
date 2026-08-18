/**
 * Duas tarefas curtas dentro do mesmo bloco da grade.
 *
 * A rota da CESIU tem **92 de 151 tarefas com 5 ou 10 min**, num bloco de agenda
 * de 15. O servidor gravava `fim_planejado = início + tempo VISUAL` (o bloco
 * arredondado para cima), então uma tarefa de 5 min reservava os 15 minutos
 * inteiros e a seguinte era recusada por `SOBREPOSICAO`. O efeito prático não era
 * cosmético: **"gerar o dia" a partir da rota padrão pulava quase tudo**, porque
 * cada tarefa curta bloqueava o resto do bloco.
 *
 * Agora o fim gravado é o real. `tempo_visual_min` e `blocos_ocupados` continuam
 * existindo — são da grade (altura mínima clicável, arrasto e redimensionamento),
 * não do relógio.
 */
import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO, tempoVisualMin } from "@/lib/calculations";
import { validarAlocacao } from "@/lib/validations";
import type { Funcionario, RotinaPlanejada } from "@/types";

const BLOCO = PARAMETROS_PADRAO.bloco_agenda_min;
const pessoa = {
  id: "f1", nome: "Gleydison", entrada: "06:30", saida: "16:30",
  intervalo_inicio: "12:00", intervalo_fim: "13:30", genero: "masculino",
} as unknown as Funcionario;

const jaPlanejada = (inicio: string, fim: string) =>
  ({
    id: "r1", status: "planejada", funcionario_id: "f1", tarefa_id: "t1",
    inicio_planejado: inicio, fim_planejado: fim,
  }) as unknown as RotinaPlanejada;

const sobrepoe = (existente: RotinaPlanejada, inicioMin: number, fimMin: number) =>
  validarAlocacao({
    funcionario: pessoa,
    rotinasExistentes: [existente],
    inicioMin,
    fimMin,
    tempoPrevistoNovo: fimMin - inicioMin,
    parametros: PARAMETROS_PADRAO,
  }).map((a) => a.codigo).includes("SOBREPOSICAO");

describe("tarefa mais curta que o bloco da agenda", () => {
  it("o tempo VISUAL continua arredondando — é o da grade, não o do relógio", () => {
    expect(tempoVisualMin(5, BLOCO)).toBe(15);
    expect(tempoVisualMin(10, BLOCO)).toBe(15);
    expect(tempoVisualMin(20, BLOCO)).toBe(30);
  });

  it("duas tarefas de 5 min convivem no mesmo bloco de 15", () => {
    // 06:45–06:50 e 06:50–06:55: encostam, não se sobrepõem.
    expect(sobrepoe(jaPlanejada("06:45", "06:50"), 6 * 60 + 50, 6 * 60 + 55)).toBe(false);
  });

  it("sobreposição de verdade continua sendo recusada", () => {
    // 06:45–07:00 (15 min reais) e uma nova às 06:50: aí é conflito mesmo.
    expect(sobrepoe(jaPlanejada("06:45", "07:00"), 6 * 60 + 50, 6 * 60 + 55)).toBe(true);
  });

  it("era isto que quebrava: fim inflado até o bloco recusa a tarefa seguinte", () => {
    // Regressão do jeito antigo — 5 min gravados como se fossem 15.
    const inflada = jaPlanejada("06:45", "07:00");
    expect(sobrepoe(inflada, 6 * 60 + 50, 6 * 60 + 55)).toBe(true);
  });
});
