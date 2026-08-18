import { describe, expect, it } from "vitest";
import { semUndefined } from "@/lib/semUndefined";

describe("semUndefined", () => {
  it("remove só as chaves undefined", () => {
    expect(semUndefined({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("preserva o que é vazio de verdade — '' e 0 e false são valores", () => {
    // Importa porque limpar campo no sistema é "" (ex.: validade da qualificação),
    // nunca undefined: se "" sumisse, a limpeza deixaria de gravar.
    const r = semUndefined({ validade: "", quantidade: 0, ativo: false, nulo: null });
    expect(r).toEqual({ validade: "", quantidade: 0, ativo: false, nulo: null });
  });

  it("não inventa chave nem altera a original", () => {
    const original = { a: 1, b: undefined };
    expect(Object.keys(semUndefined(original))).toEqual(["a"]);
    expect(Object.hasOwn(original, "b")).toBe(true);
  });
});
