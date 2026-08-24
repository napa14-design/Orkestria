/**
 * A mesma informação guardada em dois lugares — e o formulário editando o que
 * perde.
 *
 * Reportado da tela em 24/08/2026: o coordenador abriu o cadastro do Gleydison,
 * trocou o intervalo de 1h30 para 2h, salvou, e a carga semanal continuou em
 * **46h30**. O cálculo lê o CSV `intervalos` quando ele existe; o formulário
 * editava só `intervalo_inicio`/`intervalo_fim`/`intervalo_min`. Medido na
 * produção antes de consertar: **31 dos 38 funcionários ativos** com os dois
 * campos em desacordo.
 */
import { describe, expect, it } from "vitest";
import { jornadaLiquidaMin, cargaSemanalMin } from "@/lib/calculations";
import {
  csvDoTrio,
  listarIntervalos,
  problemaNosIntervalos,
  resumoIntervalos,
  rotularIntervalos,
  sincronizarTrio,
  totalIntervaloMin,
} from "@/lib/intervalos";
import type { Funcionario } from "@/types";

const GLEYDISON = {
  nome: "Gleydison",
  entrada: "06:30",
  saida: "16:30",
  escala: "seg_sab",
  entrada_sabado: "07:00",
  saida_sabado: "11:00",
} as unknown as Funcionario;

/** Os três intervalos reais de uma pessoa da Dionísio Torres. */
const COM_LANCHES = "09:00-09:15;11:30-13:00;15:00-15:15";

describe("listarIntervalos", () => {
  it("lê a lista inteira, não só o almoço", () => {
    expect(listarIntervalos(COM_LANCHES)).toEqual([
      { inicio: "09:00", fim: "09:15" },
      { inicio: "11:30", fim: "13:00" },
      { inicio: "15:00", fim: "15:15" },
    ]);
  });

  it("ordena por início e tolera espaço", () => {
    expect(listarIntervalos(" 15:00-15:15 ; 09:00-09:15 ").map((i) => i.inicio)).toEqual([
      "09:00",
      "15:00",
    ]);
  });

  it("vazio, nulo e lixo não viram intervalo fantasma", () => {
    expect(listarIntervalos("")).toEqual([]);
    expect(listarIntervalos(undefined)).toEqual([]);
    expect(listarIntervalos(";;")).toEqual([]);
    expect(listarIntervalos("almoço")).toEqual([]);
    expect(listarIntervalos("25:00-26:00")).toEqual([]);
  });
});

describe("totalIntervaloMin", () => {
  it("soma os três: 15 + 90 + 15", () => {
    expect(totalIntervaloMin(COM_LANCHES)).toBe(120);
  });

  it("um intervalo só", () => {
    expect(totalIntervaloMin("12:00-14:00")).toBe(120);
    expect(totalIntervaloMin("12:00-13:30")).toBe(90);
  });
});

describe("problemaNosIntervalos", () => {
  const jornada = { entrada: "06:30", saida: "16:30" };

  it("lista válida não reclama", () => {
    expect(problemaNosIntervalos(COM_LANCHES, { entrada: "06:00", saida: "16:00" })).toBeNull();
  });

  it("sem intervalo é válido — nem toda jornada tem", () => {
    expect(problemaNosIntervalos("", jornada)).toBeNull();
    expect(problemaNosIntervalos(undefined, jornada)).toBeNull();
  });

  it("formato errado é recusado dizendo qual par", () => {
    expect(problemaNosIntervalos("12:00", jornada)).toMatch(/12:00.*HH:mm-HH:mm/u);
    expect(problemaNosIntervalos("12h-13h", jornada)).toMatch(/12h-13h/u);
  });

  it("fim antes do início é recusado", () => {
    expect(problemaNosIntervalos("13:00-12:00", jornada)).toMatch(/fim precisa ser depois/u);
    expect(problemaNosIntervalos("12:00-12:00", jornada)).toMatch(/fim precisa ser depois/u);
  });

  it("intervalos que se pisam são recusados", () => {
    expect(problemaNosIntervalos("11:30-13:00;12:30-13:30", jornada)).toMatch(/se sobrep/u);
  });

  it("encostar não é sobrepor", () => {
    expect(problemaNosIntervalos("11:30-12:00;12:00-13:00", jornada)).toBeNull();
  });

  it("intervalo fora do expediente é recusado", () => {
    expect(problemaNosIntervalos("05:00-06:00", jornada)).toMatch(/fora do expediente/u);
    expect(problemaNosIntervalos("16:00-17:00", jornada)).toMatch(/fora do expediente/u);
  });

  it("intervalo que come o expediente inteiro é recusado", () => {
    expect(problemaNosIntervalos("06:30-16:30", jornada)).toMatch(/expediente inteiro/u);
  });
});

describe("sincronizarTrio — o trio antigo passa a ser derivado", () => {
  it("pega o MAIOR intervalo como o par principal, e o total em minutos", () => {
    const r = sincronizarTrio({ intervalos: COM_LANCHES });
    expect(r.intervalo_inicio).toBe("11:30");
    expect(r.intervalo_fim).toBe("13:00");
    expect(r.intervalo_min).toBe(120);
  });

  it("com um intervalo só, o par é ele mesmo", () => {
    const r = sincronizarTrio({ intervalos: "12:00-14:00" });
    expect([r.intervalo_inicio, r.intervalo_fim, r.intervalo_min]).toEqual(["12:00", "14:00", 120]);
  });

  it("sem CSV, não inventa nada", () => {
    expect(sincronizarTrio({ intervalos: "" })).toEqual({ intervalos: "" });
  });

  it("o trio derivado nunca contradiz o cálculo — era o bug da DT", () => {
    // A tela mostrava o par 11:30–13:00 (90 min) ao lado de "120 min", e o
    // cálculo usava 120. Agora o par e o total saem da mesma lista.
    const r = sincronizarTrio({ intervalos: COM_LANCHES });
    expect(r.intervalo_min).toBe(totalIntervaloMin(COM_LANCHES));
  });
});

describe("csvDoTrio — cadastro antigo não perde o intervalo", () => {
  it("registro com CSV devolve o CSV", () => {
    expect(csvDoTrio({ intervalos: COM_LANCHES, intervalo_inicio: "x", intervalo_fim: "y" })).toBe(
      COM_LANCHES,
    );
  });

  it("registro só com o par antigo vira CSV", () => {
    expect(csvDoTrio({ intervalo_inicio: "12:00", intervalo_fim: "13:00" })).toBe("12:00-13:00");
  });

  it("par incompleto ou invertido não vira CSV torto", () => {
    expect(csvDoTrio({ intervalo_inicio: "12:00" })).toBe("");
    expect(csvDoTrio({ intervalo_inicio: "13:00", intervalo_fim: "12:00" })).toBe("");
    expect(csvDoTrio({})).toBe("");
  });
});

describe("o caso que apareceu na tela", () => {
  it("com 1h30, Gleydison dá 46h30 na semana", () => {
    const f = { ...GLEYDISON, intervalos: "12:00-13:30" };
    expect(jornadaLiquidaMin(f)).toBe(8 * 60 + 30);
    expect(cargaSemanalMin(f)).toBe(46 * 60 + 30);
  });

  it("editar para 2h passa a valer — e fecha em 44h", () => {
    const f = { ...GLEYDISON, ...sincronizarTrio({ intervalos: "12:00-14:00" }) } as Funcionario;
    expect(jornadaLiquidaMin(f)).toBe(8 * 60);
    expect(cargaSemanalMin(f)).toBe(44 * 60);
  });

  it("a regressão: editar só o trio, com o CSV velho parado, não mexia em nada", () => {
    const antes = { ...GLEYDISON, intervalos: "12:00-13:30" } as Funcionario;
    const soOTrio = { ...antes, intervalo_inicio: "12:00", intervalo_fim: "14:00", intervalo_min: 120 };
    // O cálculo ignora o trio enquanto o CSV existir — a edição não teve efeito.
    expect(cargaSemanalMin(soOTrio as Funcionario)).toBe(46 * 60 + 30);
    expect(cargaSemanalMin(antes)).toBe(cargaSemanalMin(soOTrio as Funcionario));
  });
});

describe("resumo e rótulo", () => {
  it("o resumo mostra a conta, não a regra", () => {
    expect(resumoIntervalos(COM_LANCHES, 10 * 60)).toBe(
      "3 intervalos · 2h descontadas da jornada · jornada líquida 8h",
    );
  });

  it("singular quando é um só", () => {
    expect(resumoIntervalos("12:00-13:30")).toBe("1 intervalo · 1h30 descontadas da jornada");
  });

  it("sem intervalo diz o que acontece, em vez de ficar em branco", () => {
    expect(resumoIntervalos("")).toMatch(/expediente inteiro/u);
  });

  it("o rótulo da lista mostra todos, não só o almoço", () => {
    expect(rotularIntervalos(COM_LANCHES)).toBe("09:00-09:15 · 11:30-13:00 · 15:00-15:15");
    expect(rotularIntervalos("")).toBe("—");
  });
});
