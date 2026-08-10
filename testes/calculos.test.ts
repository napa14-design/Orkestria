/**
 * Cálculos de jornada, tempo e ocupação.
 *
 * São os números que aparecem na tela do supervisor e no relatório da diretoria.
 * Errar aqui não dá erro em lugar nenhum — só produz um número errado com cara
 * de certo, que é o pior tipo de defeito deste sistema.
 */
import { describe, expect, it } from "vitest";
import {
  blocosOcupados,
  FATOR_POR_TIPO_LOCAL,
  fatorIntensidadeLocal,
  jornadaLiquidaMin,
  ocupacaoPercentual,
  ociosidadePrevistaMin,
  PARAMETROS_PADRAO,
  tempoPlanejadoMin,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { funcionario, local, rotina, tarefa } from "./fixtures";

describe("jornadaLiquidaMin", () => {
  it("desconta o intervalo único", () => {
    // 06:00–16:00 = 600 min, menos 60 de almoço.
    expect(jornadaLiquidaMin(funcionario())).toBe(540);
  });

  it("quando existe a lista de intervalos, ela substitui o intervalo único", () => {
    // 09:00-09:15 (15) + 11:30-13:00 (90) + 15:00-15:15 (15) = 120 min.
    const f = funcionario({ intervalos: "09:00-09:15;11:30-13:00;15:00-15:15" });
    expect(jornadaLiquidaMin(f)).toBe(600 - 120);
  });

  it("devolve 0 com horário inválido em vez de número negativo", () => {
    expect(jornadaLiquidaMin(funcionario({ entrada: "", saida: "" }))).toBe(0);
  });

  it("nunca devolve negativo, mesmo com intervalo maior que a jornada", () => {
    expect(jornadaLiquidaMin(funcionario({ intervalo_min: 9999 }))).toBe(0);
  });
});

describe("tempoPrevistoMin", () => {
  it("regra fixa usa o tempo base", () => {
    expect(tempoPrevistoMin(tarefa({ tempo_base_min: 30 }), local())).toBe(30);
  });

  it("regra por m² multiplica pela metragem do local", () => {
    const t = tarefa({ regra_calculo: "por_m2", tempo_base_min: 1 });
    expect(tempoPrevistoMin(t, local({ metragem: 80 }))).toBe(80);
  });

  it("regra por unidade multiplica pela quantidade", () => {
    const t = tarefa({ regra_calculo: "por_unidade", tempo_base_min: 20, quantidade: 3 });
    expect(tempoPrevistoMin(t, local())).toBe(60);
  });

  it("por unidade sem quantidade conta como 1, não como zero", () => {
    const t = tarefa({ regra_calculo: "por_unidade", tempo_base_min: 20, quantidade: 0 });
    expect(tempoPrevistoMin(t, local())).toBe(20);
  });

  it("a intensidade do local NÃO se aplica a tempo fixo", () => {
    // Decisão deliberada (ver multiplicadorTempo): intensidade inflaria
    // atividade que não depende da metragem. 30 min fixos num banheiro
    // continuam 30 min.
    const t = tarefa({ tempo_base_min: 30 });
    expect(tempoPrevistoMin(t, local({ tipo_local: "banheiro" }))).toBe(30);
  });

  it("a intensidade do local se aplica a por m²", () => {
    // 1 min/m² × 80 m² × 1,5 (banheiro) = 120
    const t = tarefa({ regra_calculo: "por_m2", tempo_base_min: 1 });
    expect(tempoPrevistoMin(t, local({ tipo_local: "banheiro", metragem: 80 }))).toBe(120);
  });

  it("a intensidade do local se aplica a por unidade", () => {
    // 20 min × 3 un. × 1,5 (copa) = 90
    const t = tarefa({ regra_calculo: "por_unidade", tempo_base_min: 20, quantidade: 3 });
    expect(tempoPrevistoMin(t, local({ tipo_local: "copa" }))).toBe(90);
  });
});

describe("fatorIntensidadeLocal", () => {
  it("o valor digitado vence o padrão do tipo", () => {
    expect(fatorIntensidadeLocal(local({ tipo_local: "banheiro", fator_intensidade: 1 }))).toBe(1);
  });

  it("em branco herda do tipo do local", () => {
    expect(fatorIntensidadeLocal(local({ tipo_local: "banheiro" }))).toBe(1.5);
    expect(fatorIntensidadeLocal(local({ tipo_local: "area_externa" }))).toBe(0.8);
    expect(fatorIntensidadeLocal(local({ tipo_local: "sala" }))).toBe(1);
  });

  it("zero conta como em branco (o formulário grava 0 quando vazio)", () => {
    expect(fatorIntensidadeLocal(local({ tipo_local: "copa", fator_intensidade: 0 }))).toBe(1.5);
  });

  it("sem local, não quebra: devolve 1", () => {
    expect(fatorIntensidadeLocal(undefined)).toBe(1);
  });

  it("os extremos da escala nomeada são os fatores que o sistema já usava", () => {
    // A escala do formulário (0,8 … 1,5) foi ancorada nestes valores para não
    // mudar o tempo de nenhum local já cadastrado.
    expect(FATOR_POR_TIPO_LOCAL.area_externa).toBe(0.8);
    expect(FATOR_POR_TIPO_LOCAL.banheiro).toBe(1.5);
    expect(FATOR_POR_TIPO_LOCAL.copa).toBe(1.5);
  });
});

describe("blocos e tempo visual", () => {
  it("arredonda para cima: 80 min em blocos de 30 são 3 blocos", () => {
    expect(blocosOcupados(80, 30)).toBe(3);
    expect(tempoVisualMin(80, 30)).toBe(90);
  });

  it("tarefa curtíssima ocupa 1 bloco, nunca 0", () => {
    expect(blocosOcupados(1, 30)).toBe(1);
  });
});

describe("ocupação e ociosidade", () => {
  it("soma os tempos previstos e ignora rotina cancelada", () => {
    const rotinas = [
      rotina({ id: "a", tempo_previsto_min: 60 }),
      rotina({ id: "b", tempo_previsto_min: 30 }),
      rotina({ id: "c", tempo_previsto_min: 90, status: "cancelada" }),
    ];
    expect(tempoPlanejadoMin(rotinas)).toBe(90);
  });

  it("ociosidade é o que sobra da jornada", () => {
    expect(ociosidadePrevistaMin(540, 400)).toBe(140);
  });

  it("ociosidade negativa aparece como negativa — é o sinal de sobrecarga", () => {
    expect(ociosidadePrevistaMin(540, 600)).toBe(-60);
  });

  it("ocupação em porcentagem, e jornada zero não vira divisão por zero", () => {
    expect(ocupacaoPercentual(270, 540)).toBe(50);
    expect(Number.isFinite(ocupacaoPercentual(270, 0))).toBe(true);
  });

  it("as faixas de ocupação padrão estão em ordem crescente", () => {
    // Fora de ordem, a classificação (baixa/adequada/alta) fica incoerente sem
    // dar erro em lugar nenhum.
    const { ocupacao_baixa, ocupacao_adequada, ocupacao_alta } = PARAMETROS_PADRAO;
    expect(ocupacao_baixa).toBeLessThan(ocupacao_adequada);
    expect(ocupacao_adequada).toBeLessThan(ocupacao_alta);
  });
});
