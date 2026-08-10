import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Testes das funções puras (`lib/`) — cálculos, validações, permissões.
 *
 * Não testam tela nem banco: são as funções que sustentam todo o resto e as
 * mais baratas de cobrir. O alias `@/` é repetido aqui porque o vitest não lê
 * os `paths` do tsconfig sozinho.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["testes/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
