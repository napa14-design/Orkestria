/**
 * A trava de tentativas depende de quem chama lembrar de reservar (revisão de segurança,
 * 18/11/2026): `credencialConfere`, `codigoConfere` e `trocarPropriaSenha` conferem a
 * credencial sem reservar. Uma rota nova que use uma delas sem `reservarTentativa` voltaria a
 * aceitar tentativa ilimitada — este teste fica vermelho nesse caso.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONFERE = /\b(credencialConfere|codigoConfere|trocarPropriaSenha|verificarSenha)\s*\(/u;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/u.test(n) ? [p] : [];
  });
}

describe("toda rota que confere senha ou código reserva tentativa antes", () => {
  it("nenhum arquivo em app/ chama a conferência sem reservarTentativa", () => {
    const semReserva = arquivos(join(process.cwd(), "app"))
      .filter((p) => {
        const texto = readFileSync(p, "utf8");
        return CONFERE.test(texto) && !/\breservarTentativa\s*\(/u.test(texto);
      })
      .map((p) => p.slice(process.cwd().length + 1));
    expect(semReserva).toEqual([]);
  });

  it("e as três rotas conhecidas conferem (o filtro acima não está vazio por engano)", () => {
    const comConferencia = ["login", "primeiro-acesso", "senha"].filter((r) =>
      CONFERE.test(readFileSync(join(process.cwd(), "app", "api", "auth", r, "route.ts"), "utf8")),
    );
    expect(comConferencia).toEqual(["login", "primeiro-acesso", "senha"]);
  });
});
