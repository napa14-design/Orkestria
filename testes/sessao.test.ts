/**
 * Cookie de sessão — a credencial que decide quem é administrador.
 *
 * Não tinha teste nenhum até 20/08, quando a auditoria olhou a área. Dois
 * defeitos saíram dali:
 *
 * 1. `AUTH_SECRET` ausente caía num fallback que está **escrito neste
 *    repositório** — em produção, qualquer pessoa forjaria sessão de
 *    administrador e nada acusaria.
 * 2. O token **não tinha validade dentro do payload**. As 12h eram só `maxAge`
 *    do cookie, que é dica para o navegador: um token copiado de um log ou de
 *    uma captura de tela valia para sempre.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { criarTokenSessao, verificarToken } from "@/lib/session";
import type { SessaoUsuario } from "@/lib/permissions";

const HORA = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 7, 20, 12, 0, 0);

const sessao = (parcial: Partial<SessaoUsuario> = {}): SessaoUsuario => ({
  id: "u1",
  nome: "Coordenadora",
  email: "coord@px.com.br",
  perfil: "supervisor",
  sede_id: "christus_dt",
  sedes: ["christus_dt"],
  ...parcial,
});

/** Troca o payload mantendo a assinatura antiga — a falsificação mais óbvia. */
function adulterar(token: string, novo: SessaoUsuario): string {
  const [, assinatura] = token.split(".");
  const payload = Buffer.from(JSON.stringify(novo), "utf8").toString("base64url");
  return `${payload}.${assinatura}`;
}

describe("token de sessão", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "segredo-de-teste-com-tamanho-decente";
  });

  it("vai e volta preservando quem é a pessoa", () => {
    const s = verificarToken(criarTokenSessao(sessao(), T0), T0);
    expect(s?.email).toBe("coord@px.com.br");
    expect(s?.perfil).toBe("supervisor");
    expect(s?.sedes).toEqual(["christus_dt"]);
  });

  it("recusa token vazio ou malformado", () => {
    expect(verificarToken(undefined)).toBeNull();
    expect(verificarToken("")).toBeNull();
    expect(verificarToken("sem-ponto")).toBeNull();
    expect(verificarToken("a.b.c.d")).toBeNull();
  });

  it("recusa payload adulterado — virar administrador não cola", () => {
    const token = criarTokenSessao(sessao(), T0);
    const forjado = adulterar(token, sessao({ perfil: "administrador", sede_id: "geral" }));
    expect(verificarToken(forjado, T0)).toBeNull();
  });

  it("recusa assinatura de outro segredo", () => {
    const token = criarTokenSessao(sessao(), T0);
    process.env.AUTH_SECRET = "outro-segredo-completamente-diferente";
    expect(verificarToken(token, T0)).toBeNull();
  });

  it("aceita dentro das 12h e recusa depois", () => {
    const token = criarTokenSessao(sessao(), T0);
    expect(verificarToken(token, T0 + 11 * HORA)).not.toBeNull();
    expect(verificarToken(token, T0 + 12 * HORA + 1000)).toBeNull();
  });

  it("recusa token SEM expiração — o formato antigo, que valia para sempre", () => {
    // Reproduz o cookie emitido antes da trava existir: payload sem `exp`,
    // assinado corretamente. Assinatura válida não pode bastar.
    const semExp = Buffer.from(JSON.stringify(sessao()), "utf8").toString("base64url");
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const assinatura = createHmac("sha256", process.env.AUTH_SECRET!).update(semExp).digest("base64url");
    expect(verificarToken(`${semExp}.${assinatura}`, T0)).toBeNull();
  });

  it("recusa `exp` que não é número (payload fabricado à mão)", () => {
    const corpo = { ...sessao(), exp: "9999999999" };
    const payload = Buffer.from(JSON.stringify(corpo), "utf8").toString("base64url");
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const assinatura = createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("base64url");
    expect(verificarToken(`${payload}.${assinatura}`, T0)).toBeNull();
  });
});

describe("AUTH_SECRET", () => {
  it("em produção, o segredo de desenvolvimento é RECUSADO", () => {
    // O fallback está escrito no repositório: aceitá-lo em produção é entregar a
    // chave de administrador junto com o código.
    const antesEnv = process.env.NODE_ENV;
    const antesSegredo = process.env.AUTH_SECRET;
    try {
      Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true, writable: true, enumerable: true });
      delete process.env.AUTH_SECRET;
      expect(() => criarTokenSessao(sessao(), T0)).toThrow(/AUTH_SECRET/u);

      process.env.AUTH_SECRET = "segredo-dev-inseguro";
      expect(() => criarTokenSessao(sessao(), T0)).toThrow(/AUTH_SECRET/u);
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", { value: antesEnv, configurable: true, writable: true, enumerable: true });
      if (antesSegredo === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = antesSegredo;
    }
  });
});
