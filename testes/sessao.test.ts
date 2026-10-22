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
const DIA = 24 * HORA;
const DIA_S = 24 * 60 * 60;
const T0 = Date.UTC(2026, 7, 20, 12, 0, 0);

/** Payload qualquer assinado com o segredo certo — o que só quem tem o segredo faria. */
function assinadoAMao(corpo: object): string {
  const payload = Buffer.from(JSON.stringify(corpo), "utf8").toString("base64url");
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");
  return `${payload}.${createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("base64url")}`;
}

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

  // ── Sessão que renova com o uso (22/10/2026): 7 dias de inatividade e teto de
  // 7 dias desde o login. Casos de ataque da revisão de segurança (T1–T9). ──

  it("T1 · token novo carrega iat, auth_em, sv e exp", () => {
    const s = verificarToken(criarTokenSessao(sessao(), T0, { sv: 3 }), T0)!;
    expect(s.iat).toBe(T0 / 1000);
    expect(s.auth_em).toBe(s.iat); // login: o teto começa agora
    expect(s.sv).toBe(3);
    expect(s.exp - s.iat).toBe(7 * DIA_S);
  });

  it("T2 · aceita até perto dos 7 dias e recusa depois", () => {
    const token = criarTokenSessao(sessao(), T0);
    expect(verificarToken(token, T0 + 7 * DIA - HORA)).not.toBeNull();
    expect(verificarToken(token, T0 + 7 * DIA + 1000)).toBeNull();
  });

  it("T3/T4 · recusa o formato de 12 h e qualquer token sem iat, auth_em ou sv", () => {
    const exp = T0 / 1000 + 3600;
    for (const corpo of [
      { ...sessao(), exp }, // o cookie de 12 h que existe hoje
      { ...sessao(), exp, auth_em: T0 / 1000, sv: 0 },
      { ...sessao(), exp, iat: T0 / 1000, sv: 0 },
      { ...sessao(), exp, iat: T0 / 1000, auth_em: T0 / 1000 },
    ])
      expect(verificarToken(assinadoAMao(corpo), T0), JSON.stringify(Object.keys(corpo))).toBeNull();
  });

  it("T5 · recusa metadado que não é número", () => {
    const base = { ...sessao(), exp: T0 / 1000 + 3600, iat: T0 / 1000, auth_em: T0 / 1000, sv: 0 };
    for (const campo of ["iat", "auth_em", "sv"])
      expect(verificarToken(assinadoAMao({ ...base, [campo]: String(base[campo as "iat"]) }), T0), campo).toBeNull();
  });

  it("T6 · recusa além do teto MESMO com exp válido", () => {
    const agora = T0 / 1000;
    const corpo = { ...sessao(), iat: agora, auth_em: agora - 8 * DIA_S, sv: 0, exp: agora + 7 * DIA_S };
    expect(verificarToken(assinadoAMao(corpo), T0)).toBeNull();
  });

  it("T7 · recusa iat emitido no futuro (pularia a reconferência)", () => {
    const agora = T0 / 1000;
    const corpo = { ...sessao(), iat: agora + 10 * 60, auth_em: agora, sv: 0, exp: agora + DIA_S };
    expect(verificarToken(assinadoAMao(corpo), T0)).toBeNull();
    // folga de relógio entre servidores: 2 min adiantado passa
    expect(verificarToken(assinadoAMao({ ...corpo, iat: agora + 120 }), T0)).not.toBeNull();
  });

  it("T8 · adulterar iat, auth_em ou exp sem a assinatura não cola", () => {
    const token = criarTokenSessao(sessao(), T0);
    const [payload, assinatura] = token.split(".");
    const corpo = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    for (const mexe of [{ auth_em: corpo.auth_em + 30 * DIA_S }, { exp: corpo.exp + 30 * DIA_S }, { iat: corpo.iat + 3600 }]) {
      const novo = Buffer.from(JSON.stringify({ ...corpo, ...mexe }), "utf8").toString("base64url");
      expect(verificarToken(`${novo}.${assinatura}`, T0)).toBeNull();
    }
  });

  it("T9 · a renovação nunca passa do teto do login", () => {
    const login = T0 / 1000;
    const renovadoEm = T0 + 6 * DIA + 12 * HORA;
    const s = verificarToken(criarTokenSessao(sessao(), renovadoEm, { auth_em: login, sv: 0 }), renovadoEm)!;
    expect(s.auth_em).toBe(login);
    expect(s.exp).toBe(login + 7 * DIA_S);
    expect(verificarToken(criarTokenSessao(sessao(), renovadoEm, { auth_em: login }), T0 + 7 * DIA + 1000)).toBeNull();
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
