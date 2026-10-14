/**
 * Login com Google: token válido do Firebase não basta (auditoria, 14/10/2026).
 * O ataque: com o provedor E-mail/senha habilitado, cria-se uma conta com o
 * e-mail de um administrador e o token sai válido, com `email_verified: false`.
 */
import { describe, expect, it } from "vitest";
import { emailDoTokenGoogle } from "@/lib/loginGoogle";

const google = { firebase: { sign_in_provider: "google.com" } };

describe("emailDoTokenGoogle", () => {
  it("aceita login Google com e-mail verificado (e normaliza o e-mail)", () => {
    expect(emailDoTokenGoogle({ ...google, email: "Fulano@Christus.com.br", email_verified: true })).toEqual({
      email: "fulano@christus.com.br",
    });
  });

  it("recusa e-mail não verificado — o ataque da conta criada com o e-mail de outro", () => {
    expect(emailDoTokenGoogle({ ...google, email: "admin@christus.com.br", email_verified: false })).toHaveProperty("erro");
    expect(emailDoTokenGoogle({ ...google, email: "admin@christus.com.br" })).toHaveProperty("erro");
  });

  it("recusa token de outro provedor, mesmo verificado", () => {
    expect(
      emailDoTokenGoogle({ firebase: { sign_in_provider: "password" }, email: "admin@christus.com.br", email_verified: true }),
    ).toHaveProperty("erro");
    expect(emailDoTokenGoogle({ email: "admin@christus.com.br", email_verified: true })).toHaveProperty("erro");
  });

  it("recusa conta sem e-mail", () => {
    expect(emailDoTokenGoogle({ ...google, email_verified: true })).toHaveProperty("erro");
  });
});
