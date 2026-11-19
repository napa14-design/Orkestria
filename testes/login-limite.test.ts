/**
 * Limite de tentativas do login por senha (revisão externa de 18/11/2026: o login aceitava
 * tentativa ilimitada). Casos de ataque do `seguranca`, escritos ANTES do código. Pelas rotas,
 * com banco de memória; o relógio é falso só no `Date`.
 *
 * Contrato que estes testes esperam:
 *  - lib/limiteLogin.ts: LIMITE_TENTATIVAS, JANELA_LIMITE_MS, idDoLimite(email),
 *    decidirTentativa(corpo | null, agora) — pura.
 *  - services/limiteLoginService.ts: reservarTentativa(email, agora?) e liberarTentativas(email).
 *    A vaga é reservada ANTES de conferir a senha; o sucesso zera só o e-mail que entrou.
 *  - services/usuariosService.ts: credencialConfere(usuario | null, senha) e
 *    codigoConfere(usuario | null, codigo), com exatamente UM scrypt por chamada, exista a
 *    conta ou não (é o que impede o tempo de resposta de dizer quais e-mails existem).
 *  - Contador em `cache_resumo`, id = idDoLimite(email), fora do histórico.
 * Recusa por limite = 429, a mesma para e-mail que existe e que não existe.
 */
import { scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  const scryptSync = vi.fn(real.scryptSync);
  return { ...real, default: { ...real, scryptSync }, scryptSync };
});

const gravadas = vi.hoisted(() => [] as unknown[]);
let sessaoAtual: unknown = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessaoAtual,
  gravarSessao: async (s: unknown) => {
    gravadas.push(s);
  },
  limparSessao: async () => {},
}));
vi.mock("@/lib/firebaseAdmin", () => ({ obterAppAdmin: () => ({}) }));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: async () => ({ firebase: { sign_in_provider: "google.com" }, email: "vitima@x.com", email_verified: true }),
  }),
}));

import { getDataSource } from "@/lib/datasource";
import { JANELA_LIMITE_MS, LIMITE_TENTATIVAS, decidirTentativa, idDoLimite } from "@/lib/limiteLogin";
import { reiniciarBanco } from "@/lib/memoryStore";
import { hashSenha, normalizarCodigo, verificarSenha } from "@/lib/senha";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as primeiroAcesso } from "@/app/api/auth/primeiro-acesso/route";
import { POST as trocarSenha } from "@/app/api/auth/senha/route";
import { POST as loginGoogle } from "@/app/api/auth/google/route";
import type { Usuario } from "@/types";

const SENHA = "Vitima-senha-forte-2026";
const SENHA_ATACANTE = "Atacante-senha-forte-99";
const CODIGO = "K7M-4QP-92X";
const T0 = new Date("2030-03-05T13:00:00Z");
const MIN = 60 * 1000;

const req = (corpo: unknown) =>
  new Request("http://x/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const entrar = (email: unknown, senha: unknown) => login(req({ email, senha }));
const scrypts = () => vi.mocked(scryptSync).mock.calls.length;
const avancar = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
const ds = () => getDataSource();

async function conta(id: string, extra: Partial<Usuario> = {}) {
  await (await ds()).criar("usuarios", {
    id, nome: id, email: `${id}@x.com`, perfil: "coordenador", sede_id: "christus_dt", sedes_extra: "", ativo: true,
    senha_hash: "", convite_hash: "", convite_expira_em: "", versao_sessao: 0, criado_em: "", atualizado_em: "",
    ...extra,
  } as Usuario);
}

/** Erra `n` vezes e confere que cada erro foi um 401 comum (não o limite). */
async function errar(email: string, n: number) {
  for (let i = 0; i < n; i++) expect((await entrar(email, `errada-${i}-xyz`)).status).toBe(401);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  reiniciarBanco();
  gravadas.length = 0;
  sessaoAtual = null;
  await conta("vitima", { senha_hash: hashSenha(SENHA) });
  await conta("atacante", { senha_hash: hashSenha(SENHA_ATACANTE) });
  await conta("novata", {
    convite_hash: hashSenha(normalizarCodigo(CODIGO)),
    convite_expira_em: new Date(T0.getTime() + 7 * 24 * 60 * MIN).toISOString(),
  });
  await conta("vencida", { convite_hash: hashSenha(normalizarCodigo(CODIGO)), convite_expira_em: "2020-01-01T00:00:00Z" });
  vi.mocked(scryptSync).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("parâmetros (P)", () => {
  it("P1 limite e janela dentro do combinado: trava existe e nunca dura mais que 15 min", () => {
    expect(LIMITE_TENTATIVAS).toBeGreaterThanOrEqual(3);
    expect(LIMITE_TENTATIVAS).toBeLessThanOrEqual(10);
    expect(JANELA_LIMITE_MS).toBeGreaterThan(0);
    expect(JANELA_LIMITE_MS).toBeLessThanOrEqual(15 * MIN);
  });

  it("P2 o id não carrega o e-mail em claro e serve de id de documento", () => {
    const id = idDoLimite("vitima@x.com");
    expect(id).not.toMatch(/vitima/i);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(idDoLimite("vitima@x.com")).toBe(id);
    expect(idDoLimite("outra@x.com")).not.toBe(id);
  });

  it("P3 estado ilegível ou com data no futuro não trava por mais de uma janela", () => {
    const depois = new Date(T0.getTime() + JANELA_LIMITE_MS);
    const ruins = ["{quebrado", "null", "[]", JSON.stringify({ n: 99 }), JSON.stringify({ n: 99, desde: "2099-01-01T00:00:00Z" }), JSON.stringify({ n: "99", desde: T0.toISOString() })];
    for (const corpo of ruins) {
      const d1 = decidirTentativa(corpo, T0);
      const d2 = decidirTentativa(corpo, depois);
      expect(d1.liberado || d2.liberado, corpo).toBe(true);
    }
  });
});

describe("força bruta num e-mail (A)", () => {
  it("A1 depois do limite, nem a senha certa entra; e a recusa não lê o cadastro nem gasta scrypt", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    const banco = await ds();
    const listar = vi.spyOn(banco, "listar");
    vi.mocked(scryptSync).mockClear();
    const r = await entrar("vitima@x.com", SENHA);
    expect(r.status).toBe(429);
    expect(scrypts()).toBe(0);
    expect(listar).not.toHaveBeenCalledWith("usuarios");
    expect(gravadas).toHaveLength(0);
  });

  it("A2 caixa e espaços não abrem contador novo para a mesma conta", async () => {
    const variantes = ["Vitima@X.com", " vitima@x.com ", "VITIMA@X.COM", "vitima@x.com\t", "vitima@X.com"];
    for (let i = 0; i < LIMITE_TENTATIVAS; i++) expect((await entrar(variantes[i % variantes.length], "errada-abc")).status).toBe(401);
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(429);
  });

  it("A3 tipo errado no corpo é 400, sem conferir nada e sem 500", async () => {
    const casos: [unknown, unknown][] = [
      [["vitima@x.com"], SENHA], [{ $ne: "" }, SENHA], [123, SENHA], ["vitima@x.com", ["x"]], ["vitima@x.com", 0], ["", SENHA], ["   ", SENHA],
    ];
    for (const [email, senha] of casos) expect((await entrar(email, senha)).status, JSON.stringify([email, senha])).toBe(400);
    expect(scrypts()).toBe(0);
    expect(gravadas).toHaveLength(0);
  });
});

describe("travamento malicioso de colega (B): a trava tem prazo", () => {
  it("B1 a trava acaba no fim da janela, mesmo com tentativas durante ela", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    for (let i = 0; i < 20; i++) {
      avancar(JANELA_LIMITE_MS / 25);
      expect((await entrar("vitima@x.com", "errada-durante")).status).toBe(429);
    }
    vi.setSystemTime(new Date(T0.getTime() + JANELA_LIMITE_MS));
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(200);
    expect(gravadas).toHaveLength(1);
  });

  it("B2 documento corrompido ou com data no futuro não prende a conta além de uma janela", async () => {
    await (await ds()).criar("cache_resumo", {
      id: idDoLimite("vitima@x.com"), corpo: JSON.stringify({ n: 999, desde: "2099-01-01T00:00:00Z" }), expira_em: "2099-01-01T00:15:00Z", criado_em: "",
    });
    vi.setSystemTime(new Date(T0.getTime() + JANELA_LIMITE_MS));
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(200);
  });

  it("B3 com a senha travada, o login com Google continua entrando (a saída da vítima)", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(429);
    expect((await loginGoogle(req({ idToken: "token-qualquer" }))).status).toBe(200);
  });
});

describe("e-mail inexistente (C): mesma resposta, mesmo custo", () => {
  it("C1 errar com e-mail inexistente dá o mesmo status, o mesmo corpo e o mesmo número de scrypt", async () => {
    vi.mocked(scryptSync).mockClear();
    const existe = await entrar("vitima@x.com", "errada-1-abc");
    const nExiste = scrypts();
    vi.mocked(scryptSync).mockClear();
    const naoExiste = await entrar("ninguem@x.com", "errada-1-abc");
    const nNaoExiste = scrypts();
    expect(naoExiste.status).toBe(existe.status);
    expect(await naoExiste.json()).toEqual(await existe.json());
    expect(nExiste).toBe(1);
    expect(nNaoExiste).toBe(1);
  });

  it("C2 conta sem senha com código vencido, e código errado: também exatamente um scrypt", async () => {
    for (const email of ["vencida@x.com", "novata@x.com"]) {
      vi.mocked(scryptSync).mockClear();
      expect((await entrar(email, "AAA-BBB-CCC")).status).toBe(401);
      expect(scrypts(), email).toBe(1);
    }
  });

  it("C3 e-mail inexistente também trava no limite, com a mesma resposta de quem existe", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    await errar("ninguem@x.com", LIMITE_TENTATIVAS);
    const a = await entrar("vitima@x.com", "errada-z");
    const b = await entrar("ninguem@x.com", "errada-z");
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(await b.json()).toEqual(await a.json());
  });

  it("C4 a resposta de limite não ecoa o e-mail", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    const corpo = JSON.stringify(await (await entrar("vitima@x.com", "x-errada")).json());
    expect(corpo).not.toMatch(/vitima/i);
  });
});

describe("corrida (D)", () => {
  it("D1 tentativas em paralelo não passam do limite de senhas conferidas na janela", async () => {
    vi.mocked(scryptSync).mockClear();
    await errar("vitima@x.com", 1); // contador já existe: a corrida é no incremento
    const rajada = await Promise.all(Array.from({ length: 30 }, (_, i) => entrar("vitima@x.com", `paralela-${i}-xyz`)));
    const depois: Response[] = [];
    for (let i = 0; i < 10; i++) depois.push(await entrar("vitima@x.com", `seguida-${i}-xyz`));
    const st = [...rajada, ...depois].map((r) => r.status);
    expect(st.every((s) => s === 401 || s === 429), st.join(",")).toBe(true);
    expect(1 + st.filter((s) => s === 401).length).toBeLessThanOrEqual(LIMITE_TENTATIVAS);
    expect(scrypts()).toBeLessThanOrEqual(LIMITE_TENTATIVAS);
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(429);
  });

  it("D2 corrida no primeiro documento (nenhum contador ainda) também não vaza", async () => {
    vi.mocked(scryptSync).mockClear();
    const rs = await Promise.all(Array.from({ length: 12 }, () => entrar("ninguem-ainda@x.com", "paralela-abc")));
    expect(rs.filter((r) => r.status === 401).length).toBeLessThanOrEqual(LIMITE_TENTATIVAS);
    expect(scrypts()).toBeLessThanOrEqual(LIMITE_TENTATIVAS);
  });
});

describe("sucesso (E)", () => {
  it("E1 o sucesso do atacante na conta dele não zera o contador da vítima", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS - 1);
    expect((await entrar("atacante@x.com", SENHA_ATACANTE)).status).toBe(200);
    expect((await entrar("vitima@x.com", "mais-uma-errada")).status).toBe(401);
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(429);
  });

  it("E2 tem que passar: quem entra várias vezes seguidas (vários aparelhos) nunca é travado", async () => {
    for (let i = 0; i < LIMITE_TENTATIVAS * 3; i++) expect((await entrar("vitima@x.com", SENHA)).status).toBe(200);
  });

  it("E3 tem que passar: errar algumas vezes e acertar zera o próprio contador", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS - 1);
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(200);
    await errar("vitima@x.com", LIMITE_TENTATIVAS - 1);
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(200);
  });

  it("E4 tem que passar: o limite de um e-mail não afeta outro", async () => {
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    expect((await entrar("atacante@x.com", SENHA_ATACANTE)).status).toBe(200);
  });
});

describe("código de primeiro acesso (F)", () => {
  const pa = (email: string, senha_atual: string, nova_senha = "Nova-senha-forte-1") => primeiroAcesso(req({ email, senha_atual, nova_senha }));

  it("F1 chutar o código pelo login conta no mesmo limite", async () => {
    await errar("novata@x.com", LIMITE_TENTATIVAS);
    expect((await entrar("novata@x.com", CODIGO)).status).toBe(429);
  });

  it("F2 a rota de primeiro acesso divide o contador com o login, e travada não grava senha", async () => {
    await errar("novata@x.com", LIMITE_TENTATIVAS);
    expect((await pa("novata@x.com", CODIGO)).status).toBe(429);
    expect((await (await ds()).obter("usuarios", "novata"))?.senha_hash).toBeFalsy();
  });

  it("F3 errar o código no primeiro acesso conta, e gasta um scrypt mesmo com e-mail inexistente", async () => {
    vi.mocked(scryptSync).mockClear();
    expect((await pa("ninguem@x.com", "AAA-BBB-CCC")).status).toBe(401);
    expect(scrypts()).toBe(1);
    for (let i = 0; i < LIMITE_TENTATIVAS; i++) expect((await pa("novata@x.com", `AAA-BBB-CC${i}`)).status).toBe(401);
    expect((await entrar("novata@x.com", CODIGO)).status).toBe(429);
  });

  it("F4 tem que passar: senha nova fraca no primeiro acesso não gasta tentativa", async () => {
    for (let i = 0; i < LIMITE_TENTATIVAS + 2; i++) expect((await pa("novata@x.com", CODIGO, "1234567890")).status).toBe(400);
    expect((await pa("novata@x.com", CODIGO)).status).toBe(200);
  });
});

describe("troca da própria senha com sessão (G)", () => {
  const sessaoDaVitima = () => ({
    id: "vitima", nome: "vitima", email: "vitima@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"], sv: 0,
  });
  const trocar = (senhaAtual: string, senha = "Nova-senha-forte-1") => trocarSenha(req({ senhaAtual, senha }));
  const hashDaVitima = async () => (await (await ds()).obter("usuarios", "vitima"))?.senha_hash;

  it("G1 cookie roubado não testa a senha atual sem limite; travado, nem a certa troca", async () => {
    sessaoAtual = sessaoDaVitima();
    for (let i = 0; i < LIMITE_TENTATIVAS; i++) expect((await trocar(`chute-${i}-abc`)).status).not.toBe(200);
    expect((await trocar(SENHA)).status).toBe(429);
    expect(verificarSenha(SENHA, await hashDaVitima())).toBe(true);
  });

  it("G2 os chutes pela troca contam para o login (mesmo contador)", async () => {
    sessaoAtual = sessaoDaVitima();
    for (let i = 0; i < LIMITE_TENTATIVAS; i++) await trocar(`chute-${i}-abc`);
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(429);
  });

  it("G3 tem que passar: senha nova fraca repetida não trava quem sabe a atual", async () => {
    sessaoAtual = sessaoDaVitima();
    for (let i = 0; i < LIMITE_TENTATIVAS + 2; i++) expect((await trocar(SENHA, "1234567890")).status).not.toBe(429);
    expect((await trocar(SENHA)).status).toBe(200);
  });
});

describe("histórico, custo e falha do banco (H)", () => {
  it("H1 o histórico não ganha uma linha por tentativa", async () => {
    const antes = (await (await ds()).listar("historico")).length;
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    await entrar("vitima@x.com", SENHA);
    await errar("ninguem@x.com", LIMITE_TENTATIVAS);
    vi.setSystemTime(new Date(T0.getTime() + JANELA_LIMITE_MS));
    await entrar("vitima@x.com", SENHA);
    expect((await (await ds()).listar("historico")).length).toBe(antes);
  });

  it("H2 caminho feliz barato: no máximo 3 chamadas ao contador por login certo", async () => {
    const banco = await ds();
    const metodos = ["obter", "criar", "atualizar", "atualizarSe", "excluir", "gravarLote", "consultar", "listar", "contar"] as const;
    const espioes = metodos.map((m) => vi.spyOn(banco, m));
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(200);
    const noContador = espioes
      .flatMap((s) => s.mock.calls as unknown[][])
      .filter((c) => c[0] === "cache_resumo" || JSON.stringify(c[0] ?? "").includes("cache_resumo")).length;
    expect(noContador).toBeLessThanOrEqual(3);
  });

  it("H3 banco do contador fora do ar: fecha (503), sem conferir senha e sem sessão", async () => {
    const banco = await ds();
    const original = banco.obter.bind(banco);
    vi.spyOn(banco, "obter").mockImplementation((async (tabela: string, id: string) => {
      if (tabela === "cache_resumo") throw new Error("banco instável");
      return original(tabela as never, id);
    }) as typeof banco.obter);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(scryptSync).mockClear();
    expect((await entrar("vitima@x.com", SENHA)).status).toBe(503);
    expect(scrypts()).toBe(0);
    expect(gravadas).toHaveLength(0);
  });

  it("H4 o e-mail não vai para o log em nenhum caminho do limite", async () => {
    const saida: unknown[] = [];
    for (const m of ["log", "warn", "error", "info"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void saida.push(...a));
    await errar("vitima@x.com", LIMITE_TENTATIVAS);
    await entrar("vitima@x.com", SENHA);
    await errar("ninguem@x.com", LIMITE_TENTATIVAS);
    await entrar("ninguem@x.com", "mais-uma");
    expect(saida.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : String(x))).join(" ")).not.toMatch(/vitima@|ninguem@/i);
  });
});
