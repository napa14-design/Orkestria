/**
 * Sessão que renova com o uso (pedido do dono, 22/10/2026). O `comSessao` de
 * verdade, com o cookie num pote simulado e o banco de memória: passada 1 h
 * desde a emissão, a próxima chamada relê o cadastro e regrava o cookie — ou
 * encerra a sessão. Casos de ataque da revisão de segurança (R1–R20).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const jar = new Map<string, string>();
let opcoesGravadas: Record<string, unknown> | null = null;
const ops = { set: 0, del: 0 };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string, o: Record<string, unknown>) => {
      ops.set++;
      opcoesGravadas = o;
      jar.set(n, v);
    },
    delete: (n: string) => {
      ops.del++;
      jar.delete(n);
    },
  }),
}));

// Login pelo Google sem Google: o Admin SDK devolve um token já verificado.
vi.mock("@/lib/firebaseAdmin", () => ({ obterAppAdmin: () => ({}) }));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: async () => ({ email: "coord@x.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }),
  }),
}));

const { comSessao } = await import("@/lib/api");
const { COOKIE_SESSAO, criarTokenSessao, verificarToken } = await import("@/lib/session");
const { getDataSource } = await import("@/lib/datasource");
const { reiniciarBanco } = await import("@/lib/memoryStore");
const { podeEscrever } = await import("@/lib/permissions");
const { gerarConviteUsuario } = await import("@/services/usuariosService");
import type { SessaoUsuario } from "@/lib/permissions";
import type { Usuario } from "@/types";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const T0 = Date.UTC(2026, 9, 22, 12, 0, 0);

const CADASTRO: Usuario = {
  id: "u-coord", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt",
  sedes_extra: "christus_ald", ativo: true, criado_em: "", atualizado_em: "",
};
const SESSAO: SessaoUsuario = { id: "u-coord", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt", "christus_ald"] };

async function cadastrar(mudancas: Partial<Usuario> = {}) {
  const ds = await getDataSource();
  await ds.criar("usuarios", { ...CADASTRO, ...mudancas } as Usuario);
}
/** Cookie de um login feito em `quando`. */
function logar(quando = T0, meta: { sv?: number; auth_em?: number } = {}) {
  jar.set(COOKIE_SESSAO, criarTokenSessao(SESSAO, quando, { sv: 0, ...meta }));
  ops.set = 0;
  ops.del = 0;
  opcoesGravadas = null;
}
const cookieAtual = () => verificarToken(jar.get(COOKIE_SESSAO), Date.now());
let chamadas = 0;
/** Uma rota qualquer: devolve o que a sessão diz; `escrever` simula um POST que exige podeEscrever. */
const rota = (escrever = false) =>
  comSessao(async (s) => {
    chamadas++;
    if (escrever && !podeEscrever(s)) return NextResponse.json({ erro: "proibido" }, { status: 403 });
    return NextResponse.json({ perfil: s.perfil, sedes: s.sedes });
  });
const em = (ms: number) => vi.setSystemTime(new Date(ms));

describe("renovação da sessão no comSessao", () => {
  beforeEach(async () => {
    reiniciarBanco();
    jar.clear();
    chamadas = 0;
    vi.useFakeTimers({ toFake: ["Date"] });
    em(T0);
    await cadastrar();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("R1 · com menos de 1 h não lê o banco nem regrava o cookie", async () => {
    logar();
    const leituras = vi.spyOn(await getDataSource(), "obter");
    em(T0 + 59 * 60 * 1000);
    expect((await rota()).status).toBe(200);
    expect(leituras).not.toHaveBeenCalled();
    expect(ops.set).toBe(0);
  });

  it("R2 · com 1 h ou mais e cadastro ativo, renova: iat novo, mesmo auth_em, cookie seguro", async () => {
    logar();
    const leituras = vi.spyOn(await getDataSource(), "obter");
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(200);
    expect(leituras).toHaveBeenCalledTimes(1);
    const c = cookieAtual()!;
    expect(c.iat).toBe((T0 + 2 * HORA) / 1000);
    expect(c.auth_em).toBe(T0 / 1000);
    expect(c.exp).toBe(T0 / 1000 + 7 * 24 * 3600); // o teto do login, não 7 dias a partir de agora
    expect(opcoesGravadas).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("R3/R19 · vencido por inatividade ou pelo teto: 401 sem ler o banco", async () => {
    logar();
    const leituras = vi.spyOn(await getDataSource(), "obter");
    em(T0 + 7 * DIA + 1000);
    expect((await rota()).status).toBe(401);
    // Teto: renovado ontem, mas o login foi há mais de 7 dias.
    em(T0 + 7 * DIA + HORA);
    jar.set(COOKIE_SESSAO, criarTokenSessao(SESSAO, T0 + 6 * DIA, { auth_em: T0 / 1000, sv: 0 }));
    expect((await rota()).status).toBe(401);
    expect(leituras).not.toHaveBeenCalled();
    expect(chamadas).toBe(0);
  });

  it("R4 · cookie adulterado: 401 sem ler o banco", async () => {
    logar();
    const [payload, assinatura] = jar.get(COOKIE_SESSAO)!.split(".");
    const corpo = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const forjado = Buffer.from(JSON.stringify({ ...corpo, perfil: "administrador", sede_id: "geral" })).toString("base64url");
    jar.set(COOKIE_SESSAO, `${forjado}.${assinatura}`);
    const leituras = vi.spyOn(await getDataSource(), "obter");
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(401);
    expect(leituras).not.toHaveBeenCalled();
  });

  it("R5–R8/R13 · desativado, ativo torto, apagado, perfil desconhecido, e-mail trocado: 401 e cookie apagado", async () => {
    const ds = await getDataSource();
    for (const [caso, mudar] of [
      ["desativado", () => ds.atualizar("usuarios", CADASTRO.id, { ativo: false })],
      ["ativo como texto", () => ds.atualizar("usuarios", CADASTRO.id, { ativo: "false" as never })],
      ["perfil desconhecido", () => ds.atualizar("usuarios", CADASTRO.id, { perfil: "admin" as never })],
      ["e-mail trocado", () => ds.atualizar("usuarios", CADASTRO.id, { email: "outra@x.com" })],
      ["apagado", () => ds.excluir("usuarios", CADASTRO.id)],
    ] as const) {
      reiniciarBanco();
      await cadastrar();
      em(T0);
      logar();
      chamadas = 0;
      await mudar();
      em(T0 + 2 * HORA);
      const resp = await rota();
      expect(resp.status, caso).toBe(401);
      expect(ops.del, caso).toBe(1);
      expect(jar.has(COOKIE_SESSAO), caso).toBe(false);
      expect(chamadas, caso).toBe(0);
    }
  });

  it("R9 · rebaixado a visualizador: a MESMA requisição que renova já recusa a escrita", async () => {
    logar();
    await (await getDataSource()).atualizar("usuarios", CADASTRO.id, { perfil: "visualizador" });
    em(T0 + 2 * HORA);
    expect((await rota(true)).status).toBe(403);
    expect(cookieAtual()?.perfil).toBe("visualizador");
  });

  it("R10/R11 · sede extra retirada e sede principal trocada valem na renovação", async () => {
    logar();
    await (await getDataSource()).atualizar("usuarios", CADASTRO.id, { sedes_extra: "", sede_id: "christus_ald" });
    em(T0 + 2 * HORA);
    const resp = await rota();
    expect(await resp.json()).toMatchObject({ sedes: ["christus_ald"] });
    expect(cookieAtual()).toMatchObject({ sede_id: "christus_ald", sedes: ["christus_ald"] });
  });

  it("R14/R15 · versão de sessão diferente (\"esqueci a senha\" gerou código novo): 401", async () => {
    logar();
    await gerarConviteUsuario(CADASTRO.id);
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(401);
    expect(jar.has(COOKIE_SESSAO)).toBe(false);
  });

  it("R18 · banco fora com token de 1 h ou mais: 503, sem apagar o cookie e sem rodar a rota", async () => {
    logar();
    vi.spyOn(await getDataSource(), "obter").mockRejectedValue(new Error("cota estourada"));
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(503);
    expect(ops.del).toBe(0);
    expect(jar.has(COOKIE_SESSAO)).toBe(true);
    expect(chamadas).toBe(0);
    // Com menos de 1 h nem tenta ler: segue normal.
    logar(T0 + 2 * HORA);
    em(T0 + 2 * HORA + 10 * 60 * 1000);
    expect((await rota()).status).toBe(200);
  });

  it("R16 · primeiro acesso: o cookie sai com a versão de DEPOIS da senha e renova 1 h depois", async () => {
    const { POST } = await import("@/app/api/auth/primeiro-acesso/route");
    const { codigo } = await gerarConviteUsuario(CADASTRO.id);
    const resp = await POST(new Request("http://x/api/auth/primeiro-acesso", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CADASTRO.email, senha_atual: codigo, nova_senha: "Senha-Forte-123!" }),
    }));
    expect(resp.status).toBe(200);
    const usuario = await (await getDataSource()).obter("usuarios", CADASTRO.id);
    expect(cookieAtual()?.sv).toBe(usuario?.versao_sessao);
    expect(cookieAtual()?.auth_em).toBe(T0 / 1000); // login novo: o teto começa agora
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(200);
  });

  it("R17 · trocar a própria senha: este aparelho continua, o outro cai na reconferência", async () => {
    const { POST } = await import("@/app/api/auth/senha/route");
    logar();
    const outroAparelho = jar.get(COOKIE_SESSAO)!;
    em(T0 + 10 * 60 * 1000);
    const resp = await POST(new Request("http://x/api/auth/senha", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha: "Outra-Senha-456!" }),
    }));
    expect(resp.status).toBe(200);
    const desteAparelho = jar.get(COOKIE_SESSAO)!;
    expect(verificarToken(desteAparelho, Date.now())?.auth_em).toBe(T0 / 1000); // o teto do login segue
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(200);
    jar.set(COOKIE_SESSAO, outroAparelho);
    expect((await rota()).status).toBe(401);
  });

  it("desativado NÃO adia a reconferência trocando a senha a cada 50 min", async () => {
    // Prova da revisão de segurança: a troca regravava o cookie a partir da sessão
    // do próprio cookie, zerando o relógio da reconferência — ficava dentro até o teto.
    const { POST } = await import("@/app/api/auth/senha/route");
    const ds = await getDataSource();
    logar();
    await ds.atualizar("usuarios", CADASTRO.id, { ativo: false });
    const trocar = (senha: string) =>
      POST(new Request("http://x/api/auth/senha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) }));
    em(T0 + 50 * 60 * 1000);
    // A rota relê o cadastro antes de escrever: desativado encerra aqui mesmo.
    expect((await trocar("Senha-Um-111!")).status).toBe(401);
    expect(ops.set).toBe(0); // nada regravado
    expect(jar.has(COOKIE_SESSAO)).toBe(false);
    expect((await ds.obter("usuarios", CADASTRO.id))?.versao_sessao ?? 0).toBe(0); // nem a senha mudou
  });

  it("trocar a senha com perfil rebaixado regrava o cookie com o cadastro de agora", async () => {
    const { POST } = await import("@/app/api/auth/senha/route");
    logar();
    await (await getDataSource()).atualizar("usuarios", CADASTRO.id, { perfil: "visualizador" });
    em(T0 + 10 * 60 * 1000);
    const resp = await POST(new Request("http://x/api/auth/senha", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: "Senha-Dois-222!" }),
    }));
    expect(resp.status).toBe(200);
    expect(cookieAtual()?.perfil).toBe("visualizador");
  });

  it("cookie copiado NÃO toma a conta depois do \"esqueci a senha\"", async () => {
    // Prova da revisão de segurança: com a senha zerada pelo código novo, a troca
    // aceitava senha sem a atual e regravava o cookie com a versão NOVA.
    const { POST: trocarSenha } = await import("@/app/api/auth/senha/route");
    const { POST: primeiroAcesso } = await import("@/app/api/auth/primeiro-acesso/route");
    const ds = await getDataSource();
    logar(); // a cópia: sv 0
    em(T0 + 10 * 60 * 1000);
    const { codigo } = await gerarConviteUsuario(CADASTRO.id); // admin: sv 1, senha zerada
    const ataque = await trocarSenha(new Request("http://x/api/auth/senha", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senhaAtual: "", senha: "Senha-Do-Intruso-9!" }),
    }));
    expect(ataque.status).toBe(401);
    expect(jar.has(COOKIE_SESSAO)).toBe(false);
    expect((await ds.obter("usuarios", CADASTRO.id))?.senha_hash ?? "").toBe("");
    // O código que o admin entregou continua valendo para a dona da conta.
    const dona = await primeiroAcesso(new Request("http://x/api/auth/primeiro-acesso", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CADASTRO.email, senha_atual: codigo, nova_senha: "Senha-Da-Dona-7!" }),
    }));
    expect(dona.status).toBe(200);
  });

  it("trocar a senha com o e-mail do cadastro trocado encerra a sessão", async () => {
    const { POST } = await import("@/app/api/auth/senha/route");
    logar();
    await (await getDataSource()).atualizar("usuarios", CADASTRO.id, { email: "outra@x.com" });
    em(T0 + 10 * 60 * 1000);
    const resp = await POST(new Request("http://x/api/auth/senha", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: "Senha-Tres-333!" }),
    }));
    expect(resp.status).toBe(401);
    expect(jar.has(COOKIE_SESSAO)).toBe(false);
  });

  it("login pelo Google emite a versão de sessão do cadastro e renova 1 h depois", async () => {
    const { POST } = await import("@/app/api/auth/google/route");
    await (await getDataSource()).atualizar("usuarios", CADASTRO.id, { versao_sessao: 3 });
    const resp = await POST(new Request("http://x/api/auth/google", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: "token-qualquer" }),
    }));
    expect(resp.status).toBe(200);
    expect(cookieAtual()).toMatchObject({ sv: 3, auth_em: T0 / 1000, perfil: "coordenador", sedes: ["christus_dt", "christus_ald"] });
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(200);
  });

  it("login por senha emite a versão de sessão do cadastro e renova 1 h depois", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const { definirSenhaUsuario } = await import("@/services/usuariosService");
    await definirSenhaUsuario(CADASTRO.id, "Primeira-Senha-1!");
    await definirSenhaUsuario(CADASTRO.id, "Segunda-Senha-2!"); // versao_sessao = 2
    const resp = await POST(new Request("http://x/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CADASTRO.email, senha: "Segunda-Senha-2!" }),
    }));
    expect(resp.status).toBe(200);
    expect(cookieAtual()).toMatchObject({ sv: 2, auth_em: T0 / 1000 });
    em(T0 + 2 * HORA);
    expect((await rota()).status).toBe(200);
  });

  it("em produção, sessão sem iat (outra fonte que não o cookie) fecha", async () => {
    const { comSessao: comSessaoSimulada } = await (async () => {
      vi.resetModules();
      vi.doMock("@/lib/session", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@/lib/session")>()),
        obterSessao: async () => SESSAO, // sem iat/auth_em/sv
      }));
      return import("@/lib/api");
    })();
    const antes = process.env.NODE_ENV;
    try {
      Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true, writable: true, enumerable: true });
      process.env.AUTH_SECRET = "segredo-de-teste-com-tamanho-decente";
      const resp = await comSessaoSimulada(async () => NextResponse.json({ ok: true }));
      expect(resp.status).toBe(401);
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", { value: antes, configurable: true, writable: true, enumerable: true });
      vi.doUnmock("@/lib/session");
      vi.resetModules();
    }
  });

  it("R20 · login emite auth_em = agora e a renovação nunca reinicia", async () => {
    logar(T0);
    em(T0 + 3 * HORA);
    await rota();
    em(T0 + 6 * HORA);
    await rota();
    expect(cookieAtual()?.auth_em).toBe(T0 / 1000);
  });

  it("R21 · duas chamadas ao mesmo tempo com o token velho: as duas passam", async () => {
    logar();
    em(T0 + 2 * HORA);
    const [a, b] = await Promise.all([rota(), rota()]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });
});
