/**
 * Validação da alocação — o que o sistema deixa ou não deixa montar.
 *
 * Aqui um erro tem duas caras ruins: bloquear o que a operação faz de verdade
 * (foi o caso do café da Cristina), ou deixar passar sobreposição real. Os
 * testes fixam os dois lados.
 */
import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "@/lib/calculations";
import { validarAlocacao } from "@/lib/validations";
import { funcionario, local, rotina, tarefa } from "./fixtures";

/** Atalho: os códigos dos alertas de erro devolvidos. */
function errosDe(alertas: ReturnType<typeof validarAlocacao>): string[] {
  return alertas.filter((a) => a.nivel === "erro").map((a) => a.codigo);
}

const padrao = {
  funcionario: funcionario(),
  parametros: PARAMETROS_PADRAO,
  local: local(),
};

describe("sobreposição", () => {
  it("bloqueia duas tarefas normais no mesmo horário", () => {
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [rotina({ inicio_planejado: "08:00", fim_planejado: "08:30" })],
      inicioMin: 8 * 60,
      fimMin: 8 * 60 + 30,
      tarefa: tarefa(),
      tempoPrevistoNovo: 30,
    });
    expect(errosDe(alertas)).toContain("SOBREPOSICAO");
  });

  it("não bloqueia horários que apenas se encostam", () => {
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [rotina({ inicio_planejado: "08:00", fim_planejado: "08:30" })],
      inicioMin: 8 * 60 + 30,
      fimMin: 9 * 60,
      tarefa: tarefa(),
      tempoPrevistoNovo: 30,
    });
    expect(errosDe(alertas)).not.toContain("SOBREPOSICAO");
  });

  it("ignora rotina cancelada", () => {
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [
        rotina({ inicio_planejado: "08:00", fim_planejado: "08:30", status: "cancelada" }),
      ],
      inicioMin: 8 * 60,
      fimMin: 8 * 60 + 30,
      tarefa: tarefa(),
      tempoPrevistoNovo: 30,
    });
    expect(errosDe(alertas)).not.toContain("SOBREPOSICAO");
  });
});

describe("tarefa de espera — o café da Cristina", () => {
  const existente = rotina({
    id: "cafe",
    tarefa_id: "t_cafe",
    inicio_planejado: "06:00",
    fim_planejado: "07:00",
  });

  it("a nova tarefa de espera não conflita com nada", () => {
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [rotina({ inicio_planejado: "06:00", fim_planejado: "07:00" })],
      inicioMin: 6 * 60,
      fimMin: 6 * 60 + 30,
      tarefa: tarefa({ espera: true }),
      tempoPrevistoNovo: 30,
    });
    expect(errosDe(alertas)).not.toContain("SOBREPOSICAO");
  });

  it("tarefa normal por cima de uma espera existente também passa", () => {
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [existente],
      inicioMin: 6 * 60,
      fimMin: 7 * 60,
      tarefa: tarefa(),
      tempoPrevistoNovo: 60,
      tarefasEspera: new Set(["t_cafe"]),
    });
    expect(errosDe(alertas)).not.toContain("SOBREPOSICAO");
  });

  it("sem informar o conjunto, a espera existente ainda bloqueia (falha fechando)", () => {
    // Quem chama sem o conjunto mantém o comportamento antigo — nada afrouxa
    // por descuido de quem integra.
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [existente],
      inicioMin: 6 * 60,
      fimMin: 7 * 60,
      tarefa: tarefa(),
      tempoPrevistoNovo: 60,
    });
    expect(errosDe(alertas)).toContain("SOBREPOSICAO");
  });

  it("a proteção continua de pé: espera não libera as OUTRAS tarefas entre si", () => {
    // O caso que prova que a validação ficou ciente, não desligada: duas
    // tarefas normais no mesmo horário seguem bloqueadas mesmo havendo uma
    // tarefa de espera no dia.
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [
        existente,
        rotina({ id: "limpeza", tarefa_id: "t_limpeza", inicio_planejado: "06:00", fim_planejado: "07:00" }),
      ],
      inicioMin: 6 * 60,
      fimMin: 7 * 60,
      tarefa: tarefa(),
      tempoPrevistoNovo: 60,
      tarefasEspera: new Set(["t_cafe"]),
    });
    expect(errosDe(alertas)).toContain("SOBREPOSICAO");
  });
});

describe("jornada e intervalo", () => {
  it("bloqueia tarefa fora do expediente", () => {
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [],
      inicioMin: 5 * 60,
      fimMin: 5 * 60 + 30,
      tarefa: tarefa(),
      tempoPrevistoNovo: 30,
    });
    expect(errosDe(alertas)).toContain("FORA_DO_EXPEDIENTE");
  });

  it("bloqueia tarefa dentro do intervalo de almoço", () => {
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: [],
      inicioMin: 11 * 60 + 45,
      fimMin: 12 * 60 + 15,
      tarefa: tarefa(),
      tempoPrevistoNovo: 30,
    });
    expect(errosDe(alertas)).toContain("INTERVALO");
  });

  it("funcionário sem horário não deixa montar nada", () => {
    const alertas = validarAlocacao({
      ...padrao,
      funcionario: funcionario({ entrada: "", saida: "" }),
      rotinasExistentes: [],
      inicioMin: 8 * 60,
      fimMin: 8 * 60 + 30,
      tarefa: tarefa(),
      tempoPrevistoNovo: 30,
    });
    expect(errosDe(alertas)).toContain("SEM_JORNADA");
  });
});

describe("sobrecarga", () => {
  it("avisa sem bloquear quando a jornada estoura", () => {
    // 540 min de jornada; 9 tarefas de 60 já ocupam 540, a décima estoura.
    const existentes = Array.from({ length: 9 }, (_, i) =>
      rotina({
        id: `r${i}`,
        inicio_planejado: "06:00",
        fim_planejado: "06:01",
        tempo_previsto_min: 60,
      }),
    );
    const alertas = validarAlocacao({
      ...padrao,
      rotinasExistentes: existentes,
      inicioMin: 14 * 60,
      fimMin: 15 * 60,
      tarefa: tarefa({ tempo_base_min: 60 }),
      tempoPrevistoNovo: 60,
    });
    const sobrecarga = alertas.find((a) => a.codigo === "SOBRECARGA");
    expect(sobrecarga).toBeDefined();
    // Sobrecarga é decisão do supervisor: avisa, não impede.
    expect(sobrecarga?.nivel).not.toBe("erro");
  });
});
