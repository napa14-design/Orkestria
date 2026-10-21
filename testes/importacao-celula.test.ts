/**
 * Leitura de célula da planilha de rota — cada forma em que o ExcelJS entrega
 * um valor tem de virar o texto que a pessoa vê no Excel.
 *
 * Nasceu da planilha da DT2 (21/10/2026): o "Início da tarefa" era a fórmula
 * `=H2` (o fim da tarefa anterior) copiada para baixo, e as 361 linhas caíram
 * como `"[object Object]" não é uma hora válida`.
 */
import { describe, expect, it } from "vitest";
import { analisarRota, textoDaCelula } from "@/lib/importacaoRota";

describe("textoDaCelula", () => {
  it("fórmula e fórmula copiada valem pelo resultado", () => {
    expect(textoDaCelula({ formula: "H2", result: "07:05", ref: "G3:G22", shareType: "shared" }, true)).toBe("07:05");
    expect(textoDaCelula({ sharedFormula: "G3", result: "07:15" }, true)).toBe("07:15");
  });

  it("resultado de fórmula em Date ou em fração do dia vira HH:mm", () => {
    expect(textoDaCelula({ formula: "H2", result: new Date(Date.UTC(1899, 11, 30, 7, 5)) }, true)).toBe("07:05");
    expect(textoDaCelula({ formula: "H2", result: 0.5 }, true)).toBe("12:00");
  });

  it("hora como Date ou como número", () => {
    expect(textoDaCelula(new Date(Date.UTC(1899, 11, 30, 16, 30)), true)).toBe("16:30");
    // 07:05 = 425 min = 0,295138… do dia; arredonda para o minuto.
    expect(textoDaCelula(425 / 1440, true)).toBe("07:05");
    expect(textoDaCelula(0, true)).toBe("00:00");
  });

  it("número fora de coluna de hora continua número (metragem, dias)", () => {
    expect(textoDaCelula(0.5, false)).toBe("0.5");
    expect(textoDaCelula(120, false)).toBe("120");
    expect(textoDaCelula(3, true)).toBe("3"); // não é fração do dia: a validação acusa
  });

  it("texto com formatação, link e erro de fórmula", () => {
    expect(textoDaCelula({ richText: [{ text: "Limpeza " }, { font: { bold: true }, text: "da recepção" }] }, false)).toBe(
      "Limpeza da recepção",
    );
    expect(textoDaCelula({ text: "Portaria", hyperlink: "https://x" }, false)).toBe("Portaria");
    expect(textoDaCelula({ formula: "H99", result: { error: "#REF!" } }, true)).toBe("#REF!");
    expect(textoDaCelula({ error: "#VALUE!" }, true)).toBe("#VALUE!");
  });

  it("vazio e fórmula sem resultado calculado viram vazio", () => {
    expect(textoDaCelula(null, true)).toBe("");
    expect(textoDaCelula(undefined, false)).toBe("");
    expect(textoDaCelula({ formula: "H2" }, true)).toBe("");
  });

  it("nunca devolve [object Object]", () => {
    for (const v of [{ formula: "A1", result: { x: 1 } }, { qualquer: 1 }, { richText: [{}] }])
      expect(textoDaCelula(v, true)).not.toContain("[object Object]");
  });
});

describe("planilha com o início como fórmula do fim anterior", () => {
  it("analisa sem erro de hora", () => {
    // Linhas como a importação monta depois de ler as células da DT2.
    const base = { funcionario: "Ana", entrada: "07:00", saida: "17:00", tarefa: "", local: "Recepção" };
    const linhas = [
      { ...base, inicio: textoDaCelula("07:00", true), fim: "07:05", tarefa: "Base" },
      { ...base, inicio: textoDaCelula({ formula: "H2", result: "07:05" }, true), fim: "07:15", tarefa: "Café" },
      { ...base, inicio: textoDaCelula({ sharedFormula: "G3", result: "07:15" }, true), fim: "07:45", tarefa: "Recepção" },
    ];
    const a = analisarRota(linhas);
    expect(a.erros).toEqual([]);
    expect(a.rotinas.map((r) => `${r.inicio}-${r.fim}`)).toEqual(["07:00-07:05", "07:05-07:15", "07:15-07:45"]);
  });
});
