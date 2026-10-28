/**
 * Quadro da Infra (Chromos) × cadastro daqui (23/10/2026). Os códigos O01…O46
 * são os casos de ataque da revisão de segurança feita ANTES de codar.
 *
 * O ponto central: o vínculo só vale com o nome conferindo. A matrícula é
 * digitável; se bastasse ela, um coordenador leria sede e desligamento de
 * alguém de outra sede (O18). Pelas rotas: sessão simulada, banco de memória,
 * `fetch` substituído.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import {
  cruzar,
  lerPessoas,
  mapaDeSedes,
  nomeConfere,
  nomeConfereNaSede,
  normalizarMatricula,
  TETO_PESSOAS,
  type FuncionarioCruzado,
  type PessoaQuadro,
} from "@/lib/quadroInfra";
import { esquecerQuadro } from "@/services/quadroInfraService";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { GET: getDivergencias } = await import("@/app/api/quadro-infra/divergencias/route");
const { POST: postVincular } = await import("@/app/api/quadro-infra/vincular/route");
const { PUT: putFuncionario } = await import("@/app/api/funcionarios/[id]/route");
const { POST: postFuncionario } = await import("@/app/api/funcionarios/route");
const { middleware } = await import("@/middleware");

const pessoa = (p: Partial<PessoaQuadro> & { id: string; nome: string; sede: string }): PessoaQuadro => ({
  matricula: "", empresa: "EMPRESA A", admissao: "2024-02-01", desligamento: "", situacao: "ATIVO", ...p,
});
const func = (f: Partial<FuncionarioCruzado> & { id: string; nome: string }): FuncionarioCruzado => ({
  sede_id: "dt", ativo: true, ...f,
});

describe("regras puras", () => {
  it("O14/O12/O13: mapa de sedes — grafias, exceções do dono e colisão fecham", () => {
    const m = mapaDeSedes([
      { id: "a", codigo: "sul 1" }, { id: "b", codigo: " SUL  2 " }, { id: "c", codigo: "DT" },
      { id: "d", codigo: "BN" }, { id: "e", codigo: "CES" }, { id: "f", codigo: "DT 2" }, { id: "g" },
    ]);
    expect(Object.fromEntries(m)).toEqual({ a: "SUL1", b: "SUL2", c: "DT1", d: "BEN", e: "CESIU", f: "DT2" });
    const colisao = mapaDeSedes([{ id: "x", codigo: "SUL 1" }, { id: "y", codigo: "SUL1" }, { id: "z", codigo: "PSUL" }]);
    expect([...colisao.keys()]).toEqual(["z"]);
  });

  it("O17: nome confere sem acento, caixa, ligação e com inicial; nome único não confere", () => {
    expect(nomeConfere("JOSÉ  da silva", "Jose da Silva")).toBe(true);
    expect(nomeConfere("Maria Souza", "MARIA APARECIDA DE SOUZA")).toBe(true);
    expect(nomeConfere("Maria A. Souza", "MARIA APARECIDA DE SOUZA")).toBe(true);
    expect(nomeConfere("Maria Souza", "Maria Lima")).toBe(false);
    expect(nomeConfere("Ana Souza", "Maria Souza")).toBe(false);
    expect(nomeConfere("Aurilene", "AURILENE SANTOS")).toBe(false);
  });

  it("O17b: inicial ou nome repetido não confere com o próprio primeiro nome (revisão pós-código)", () => {
    expect(nomeConfere("Joana J", "JOANA PEREIRA")).toBe(false);
    expect(nomeConfere("Joana Joana", "JOANA PEREIRA")).toBe(false);
    expect(nomeConfere("Aurilene A", "AURILENE SANTOS")).toBe(false);
    expect(nomeConfere("Maria M", "MARIA APARECIDA DE SOUZA")).toBe(false);
    expect(nomeConfere("Maria A. S.", "MARIA APARECIDA DE SOUZA")).toBe(false);
    // A inicial só casa com os nomes SEGUINTES: aqui o "M" só existe no primeiro.
    expect(nomeConfere("Maria M. Souza", "MARIA APARECIDA SOUZA")).toBe(false);
    expect(nomeConfere("Maria A. Souza", "MARIA APARECIDA DE SOUZA")).toBe(true);
    expect(nomeConfere("Maria das Graças Lima", "MARIA DAS GRACAS LIMA")).toBe(true);
  });

  it("O17c: a conferência tem direção — o nome daqui cabe no de lá, nunca o contrário (2ª revisão)", () => {
    const dicionario = "Joana Maria Aparecida Gracas Fatima Silva Santos Souza Pereira Lima Oliveira";
    expect(nomeConfere("Joana Silva Santos Souza Pereira Lima", "JOANA PEREIRA")).toBe(false);
    expect(nomeConfere(dicionario, "JOANA PEREIRA")).toBe(false);
    expect(nomeConfere(dicionario, "JOANA MARIA DA SILVA")).toBe(false);
    // O RH com o nome mais curto que o cadastro: "não confere" (o cadastro se corrige).
    expect(nomeConfere("Maria Aparecida Souza", "MARIA SOUZA")).toBe(false);
    expect(nomeConfere("Maria Souza", "MARIA APARECIDA SOUZA")).toBe(true);
  });

  it("O22: matrícula da planilha (\"9508.0\", espaços) é a mesma", () => {
    expect(normalizarMatricula("9508.0")).toBe("9508");
    expect(normalizarMatricula(" 9508 ")).toBe("9508");
    expect(normalizarMatricula(undefined)).toBe("");
  });

  it("O32/O43/O42: só os campos do contrato entram; item torto sai; resposta torta estoura", () => {
    const [p, ...resto] = lerPessoas({
      pessoas: [
        { id: "1", matricula: "10.0", empresa: "E", nome: "Ana Sigilosa", sede: "DT1", admissao: "", desligamento: "", situacao: "ATIVO", celular: "SENTINELA", motivoDesligamento: "SENTINELA" },
        { id: "2", matricula: 10, empresa: "E", nome: "X", sede: "DT1", admissao: "", desligamento: "", situacao: "ATIVO" },
        { id: "3", matricula: "1", empresa: "E", nome: { a: 1 }, sede: "DT1", admissao: "", desligamento: "", situacao: "ATIVO" },
        { id: "4", matricula: "1", empresa: "E", nome: "Y", sede: "DT1", admissao: "", desligamento: "", situacao: "AFASTADO" },
        { id: "5", matricula: "1", empresa: "E", nome: "x".repeat(1000), sede: "DT1", admissao: "", desligamento: "", situacao: "ATIVO" },
      ],
    });
    expect(resto).toEqual([]);
    expect(Object.keys(p).sort()).toEqual(["admissao", "desligamento", "empresa", "id", "matricula", "nome", "sede", "situacao"]);
    expect(JSON.stringify(p)).not.toContain("SENTINELA");
    expect(p.matricula).toBe("10");
    expect(() => lerPessoas({ pessoas: Array(TETO_PESSOAS + 1).fill({}) })).toThrow();
    expect(() => lerPessoas("<html>")).toThrow();
    expect(() => lerPessoas(null)).toThrow();
  });

  /** Sede daqui → do Chromos: "dt" é a DT1; "outra", a ALD. */
  const MAPA = new Map([["dt", "DT1"], ["outra", "ALD"]]);

  const QUADRO = [
    pessoa({ id: "q1", nome: "MARIA APARECIDA SOUZA", sede: "DT1", matricula: "100" }),
    pessoa({ id: "q2", nome: "MARIA SOUZA LIMA", sede: "BEN", matricula: "200" }),
    pessoa({ id: "q3", nome: "JOANA PEREIRA", sede: "BEN", matricula: "300", situacao: "INATIVO", desligamento: "2026-10-01" }),
    pessoa({ id: "q4", nome: "CARLA DIAS", sede: "DT1", matricula: "400", situacao: "INATIVO", desligamento: "2026-10-10" }),
    pessoa({ id: "q5", nome: "PAULA ROCHA", sede: "PDT", matricula: "500" }),
    pessoa({ id: "q6", nome: "RITA NUNES", sede: "DT1", matricula: "600" }),
    pessoa({ id: "q7", nome: "BIA SECRETA", sede: "BS", matricula: "700" }),
  ];

  it("O15/O16: sugestão só da MESMA sede; a homônima de outra sede não aparece", () => {
    const d = cruzar({
      sedeNoChromos: "DT1",
      daSede: [func({ id: "f1", nome: "Maria Souza" }), func({ id: "f2", nome: "Joana Pereira" })],
      todos: [],
      quadro: QUADRO,
      mapa: MAPA,
    });
    expect(d.semVinculo).toEqual([
      { funcionario_id: "f1", nome: "Maria Souza", sugestoes: [{ quadro_id: "q1", nome: "MARIA APARECIDA SOUZA", admissao: "2024-02-01", situacao: "ATIVO" }] },
      { funcionario_id: "f2", nome: "Joana Pereira", sugestoes: [] },
    ]);
    expect(JSON.stringify(d)).not.toContain("BEN");
    expect(JSON.stringify(d)).not.toContain("LIMA");
    expect(d.foraDoOrkestria).toBeNull();
  });

  it("O18: matrícula de outra sede com nome diferente → só \"não confere\", nada da pessoa de lá", () => {
    const f = func({ id: "f1", nome: "Rita Nunes", matricula: "300" }); // a 300 é JOANA, da BEN, desligada
    const d = cruzar({ sedeNoChromos: "DT1", daSede: [f], todos: [f], quadro: QUADRO, mapa: MAPA });
    expect(d.naoConfere).toEqual([{ funcionario_id: "f1", nome: "Rita Nunes" }]);
    // A lista "fora do Orkestria" é da PRÓPRIA sede (DT1) e aparece com razão;
    // nada da pessoa da BEN que a matrícula apontava.
    const texto = JSON.stringify(d);
    for (const vaza of ["BEN", "JOANA", "2026-10-01", "INATIVO"]) expect(texto).not.toContain(vaza);
  });

  it("O18b: só o primeiro nome + inicial (\"Joana J\") com a matrícula de lá → \"não confere\", nada de lá", () => {
    const fs = [
      func({ id: "f1", nome: "Joana J", matricula: "300" }),
      func({ id: "f2", nome: "Paula P", matricula: "500" }),
      func({ id: "f3", nome: "Joana Maria Aparecida Silva Santos Souza Pereira Lima Oliveira", matricula: "300" }),
    ];
    const d = cruzar({ sedeNoChromos: "DT1", daSede: fs, todos: fs, quadro: QUADRO, mapa: MAPA });
    expect(d.naoConfere.map((n) => n.funcionario_id)).toEqual(["f1", "f2", "f3"]);
    const texto = JSON.stringify({ ...d, foraDoOrkestria: null });
    for (const vaza of ["BEN", "PDT", "2026-10-01"]) expect(texto).not.toContain(vaza);
  });

  it("O19/O20/O09: mesma pessoa → desligada (com a data) ou em outra sede (só o código, filtro por sede e não por região)", () => {
    const fs = [
      func({ id: "a", nome: "Carla Dias", matricula: "400" }),
      func({ id: "b", nome: "Paula Rocha", matricula: "500" }),
      func({ id: "c", nome: "Rita Nunes", matricula: "600" }),
    ];
    const d = cruzar({ sedeNoChromos: "DT1", daSede: fs, todos: fs, quadro: QUADRO, mapa: MAPA });
    expect(d.desligados).toEqual([{ funcionario_id: "a", nome: "Carla Dias", data: "2026-10-10" }]);
    expect(d.outraSede).toEqual([{ funcionario_id: "b", nome: "Paula Rocha", sede: "PDT" }]);
    expect(d.naoConfere).toEqual([]);
    // Todos vinculados: agora aparece quem está no Quadro da DT1 e não aqui.
    expect(d.foraDoOrkestria).toEqual([{ nome: "MARIA APARECIDA SOUZA", admissao: "2024-02-01" }]);
  });

  it("O21: homônima desligada em outra sede, sem matrícula aqui → nenhum aviso de desligado/sede", () => {
    const d = cruzar({ sedeNoChromos: "DT1", daSede: [func({ id: "x", nome: "Joana Pereira" })], todos: [], quadro: QUADRO, mapa: MAPA });
    expect(d.desligados).toEqual([]);
    expect(d.outraSede).toEqual([]);
  });

  it("quem já tem vínculo em outra sede daqui não vira sugestão nem \"fora do Orkestria\"", () => {
    const outro = func({ id: "o", nome: "Maria Aparecida Souza", matricula: "100", sede_id: "outra" });
    const d = cruzar({ sedeNoChromos: "DT1", daSede: [func({ id: "f", nome: "Maria Souza" })], todos: [outro], quadro: QUADRO, mapa: MAPA });
    expect(d.semVinculo[0].sugestoes).toEqual([]);
  });

  it("empresa gravada tem de bater: mesma matrícula de outra empresa não é a pessoa", () => {
    const f = func({ id: "f", nome: "Rita Nunes", matricula: "600", empresa: "EMPRESA B" });
    expect(cruzar({ sedeNoChromos: "DT1", daSede: [f], todos: [f], quadro: QUADRO, mapa: MAPA }).naoConfere).toHaveLength(1);
  });

  it("desligado daqui (mesmo com data futura) fica fora das divergências", () => {
    const f = func({ id: "f", nome: "Carla Dias", matricula: "400", desligado_em: "2099-01-01" });
    const d = cruzar({ sedeNoChromos: "DT1", daSede: [f], todos: [f], quadro: QUADRO, mapa: MAPA });
    expect(d.desligados).toEqual([]);
  });

  it("nome repetido não estica o cadastro além do nome de lá; hífen separa nomes", () => {
    expect(nomeConfere("Joana Pereira Pereira", "JOANA PEREIRA")).toBe(false);
    expect(nomeConfere("Ana-Maria Silva", "ANA MARIA SILVA")).toBe(true);
  });

  it("na mesma sede o primeiro nome basta (110 dos 148 ativos têm uma palavra só); fora dela, não", () => {
    expect(nomeConfereNaSede("Rita", "RITA NUNES")).toBe(true);
    expect(nomeConfereNaSede("Rita", "RITINHA NUNES")).toBe(false);
    expect(nomeConfereNaSede("Maria M", "MARIA APARECIDA DE SOUZA")).toBe(false);
    const sugeridos = cruzar({ sedeNoChromos: "DT1", daSede: [func({ id: "f", nome: "Rita" })], todos: [], quadro: QUADRO, mapa: MAPA });
    expect(sugeridos.semVinculo[0].sugestoes.map((s) => s.quadro_id)).toEqual(["q6"]);
    // Vinculada na própria sede pelo primeiro nome: segue sendo achada (desligada lá → aviso).
    const carla = func({ id: "c", nome: "Carla", matricula: "400" });
    expect(cruzar({ sedeNoChromos: "DT1", daSede: [carla], todos: [carla], quadro: QUADRO, mapa: MAPA }).desligados).toHaveLength(1);
  });

  it("O18c: primeiro nome sozinho + matrícula de OUTRA sede → \"não confere\", nada de lá", () => {
    const fs = [func({ id: "j", nome: "Joana", matricula: "300" }), func({ id: "p", nome: "Paula", matricula: "500" })];
    const d = cruzar({ sedeNoChromos: "DT1", daSede: fs, todos: fs, quadro: QUADRO, mapa: MAPA });
    expect(d.naoConfere.map((n) => n.funcionario_id)).toEqual(["j", "p"]);
    const texto = JSON.stringify({ ...d, foraDoOrkestria: null });
    for (const vaza of ["BEN", "PDT", "2026-10-01"]) expect(texto).not.toContain(vaza);
  });

  it("desligado daqui não segura vínculo: a pessoa volta a ser sugerida para o cadastro novo", () => {
    const velho = func({ id: "v", nome: "Maria Aparecida Souza", matricula: "100", sede_id: "outra", desligado_em: "2026-09-01", ativo: false });
    const novo = func({ id: "n", nome: "Maria Souza" });
    const d = cruzar({ sedeNoChromos: "DT1", daSede: [novo], todos: [velho, novo], quadro: QUADRO, mapa: MAPA });
    expect(d.semVinculo[0].sugestoes.map((s) => s.quadro_id)).toEqual(["q1"]);
  });
});

// ─── Pelas rotas ─────────────────────────────────────────────────────────────

const COORD_DT: SessaoUsuario = { id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
const ADMIN: SessaoUsuario = { id: "a1", nome: "Admin", email: "admin@x.com", perfil: "administrador", sede_id: "geral", sedes: [] };

const RESPOSTA = {
  pessoas: [
    { id: "q1", matricula: "100", empresa: "EMPRESA A", nome: "MARIA APARECIDA SOUZA", sede: "DT1", admissao: "2024-02-01", desligamento: "", situacao: "ATIVO" },
    { id: "q2", matricula: "200", empresa: "EMPRESA A", nome: "PESSOA DE OUTRA SEDE", sede: "ALD", admissao: "2023-01-01", desligamento: "", situacao: "ATIVO" },
    { id: "q3", matricula: "300", empresa: "EMPRESA A", nome: "CARLA DIAS", sede: "DT1", admissao: "2022-01-01", desligamento: "2026-10-10", situacao: "INATIVO" },
    // Homônima de outra sede: o nome confere com "Maria Souza", a sede não.
    { id: "q4", matricula: "400", empresa: "EMPRESA A", nome: "MARIA SOUZA RAMOS", sede: "ALD", admissao: "2021-01-01", desligamento: "", situacao: "ATIVO" },
  ],
  geradoEm: "2026-10-23T12:00:00Z",
};

let chamadas: { url: string; init?: RequestInit }[] = [];
let responder: () => Promise<Response> = async () => Response.json(RESPOSTA);
const original = globalThis.fetch;

const pedirGet = (sede?: string) => getDivergencias(new Request(`http://x/api/quadro-infra/divergencias${sede ? `?sede=${sede}` : ""}`));
const json = (corpo: unknown, metodo = "POST") =>
  new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function cadastro(id: string, nome: string, extra: Record<string, unknown> = {}) {
  const ds = await getDataSource();
  const base = await ds.obter("funcionarios", "christus_f1");
  // A base vem da seed, que o beforeEach desliga: o desligamento não pode vir junto.
  await ds.criar("funcionarios", { ...base!, id, nome, matricula: "", desligado_em: "", ...extra });
}

describe("rotas do Quadro", () => {
  beforeEach(async () => {
    reiniciarBanco();
    esquecerQuadro();
    sessao = COORD_DT;
    chamadas = [];
    responder = async () => Response.json(RESPOSTA);
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return responder();
    }) as typeof fetch;
    vi.stubEnv("CHROMOS_QUADRO_URL", "https://chromos.test/api/quadro-externo");
    vi.stubEnv("CHAVE_ORKESTRIA", "chave-do-orkestria-de-teste-com-32-caracteres");
    const ds = await getDataSource();
    await ds.atualizar("sedes", "christus_dt", { codigo: "DT" });
    await ds.atualizar("sedes", "christus_ald", { codigo: "ALD" });
    // Os da seed têm nome de uma palavra só: não conferem com ninguém e só
    // poluiriam as listas.
    for (const f of await ds.listar("funcionarios")) await ds.atualizar("funcionarios", f.id, { desligado_em: "2020-01-01" });
  });
  afterEach(() => {
    globalThis.fetch = original;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("O01: a rota não está no prefixo público do middleware", async () => {
    const r = middleware(new NextRequest("http://x/api/quadro-infra/divergencias?sede=christus_dt"));
    expect(r.status).toBe(401);
  });

  it("O02–O05: sem sessão 401; supervisor, visualizador e perfil desconhecido 403 sem buscar nada", async () => {
    sessao = null;
    expect((await pedirGet("christus_dt")).status).toBe(401);
    for (const perfil of ["supervisor", "visualizador", "gerente"]) {
      sessao = { ...COORD_DT, perfil: perfil as SessaoUsuario["perfil"] };
      expect((await pedirGet("christus_dt")).status).toBe(403);
      expect((await postVincular(json({ funcionario_id: "x", quadro_id: "q1" }))).status).toBe(403);
    }
    expect(chamadas).toEqual([]);
  });

  it("O07/O31: coordenador pedindo sede alheia recebe a dele; nada da outra sede no corpo", async () => {
    await cadastro("f-dt", "Maria Souza");
    await cadastro("f-ald", "Pessoa De Outra Sede", { sede_id: "christus_ald" });
    const r = await pedirGet("christus_ald");
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.sedeNoChromos).toBe("DT1");
    expect(JSON.stringify(corpo)).not.toMatch(/OUTRA SEDE|Outra Sede/u);
    expect(corpo.semVinculo).toEqual([
      { funcionario_id: "f-dt", nome: "Maria Souza", sugestoes: [{ quadro_id: "q1", nome: "MARIA APARECIDA SOUZA", admissao: "2024-02-01", situacao: "ATIVO" }] },
    ]);
  });

  it("O44/O39: sem cache no navegador; o token vai no cabeçalho, sem seguir redirecionamento e com prazo", async () => {
    const r = await pedirGet("christus_dt");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("https://chromos.test/api/quadro-externo");
    expect(chamadas[0].url).not.toContain("segredo");
    expect((chamadas[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer chave-do-orkestria-de-teste-com-32-caracteres");
    expect(chamadas[0].init?.redirect).toBe("error");
    expect(chamadas[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("O35: dez pedidos seguidos (com ?atualizar=1) custam uma leitura do Chromos", async () => {
    for (let i = 0; i < 10; i++) await getDivergencias(new Request("http://x/api/quadro-infra/divergencias?sede=christus_dt&atualizar=1"));
    expect(chamadas).toHaveLength(1);
  });

  it("O37/O38: sem configuração, ou URL http, é 503 e o token não sai", async () => {
    vi.stubEnv("CHAVE_ORKESTRIA", "");
    expect((await pedirGet("christus_dt")).status).toBe(503);
    vi.stubEnv("CHAVE_ORKESTRIA", "chave-do-orkestria-de-teste-com-32-caracteres");
    vi.stubEnv("CHROMOS_QUADRO_URL", "http://chromos.test/api/quadro-externo");
    const r = await pedirGet("christus_dt");
    expect(r.status).toBe(503);
    expect((await r.json()).configurado).toBe(false);
    expect(chamadas).toEqual([]);
  });

  it("O40/O41/O33: falha do Chromos vira mensagem fixa, sem corpo nem endereço — e não fica guardada", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    responder = async () => new Response("Ana Sigilosa at stack Bearer vazou", { status: 500 });
    const r1 = await pedirGet("christus_dt");
    expect(r1.status).toBe(503);
    const t1 = await r1.text();
    responder = async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:443"); };
    const t2 = await (await pedirGet("christus_dt")).text();
    // Error vira "{}" no JSON: o log é lido pela mensagem e pela pilha.
    const logado = log.mock.calls.flat().map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" ");
    for (const t of [t1, t2, logado]) {
      expect(t).not.toMatch(/Sigilosa|vazou|10\.0\.0\.5|chromos\.test|segredo/u);
    }
    responder = async () => Response.json(RESPOSTA);
    expect((await pedirGet("christus_dt")).status).toBe(200);
  });

  it("lista vazia não fica guardada (pode ser defeito de lá)", async () => {
    responder = async () => Response.json({ pessoas: [] });
    await pedirGet("christus_dt");
    responder = async () => Response.json(RESPOSTA);
    await pedirGet("christus_dt");
    expect(chamadas).toHaveLength(2);
  });

  it("sede sem correspondente no Chromos não vai buscar nada", async () => {
    const ds = await getDataSource();
    await ds.atualizar("sedes", "christus_dt", { codigo: "" });
    const corpo = await (await pedirGet("christus_dt")).json();
    expect(corpo.sedeNoChromos).toBeNull();
    expect(chamadas).toEqual([]);
  });

  it("administrador sem sede escolhida: 400, sem buscar nada", async () => {
    sessao = ADMIN;
    expect((await pedirGet()).status).toBe(400);
    expect(chamadas).toEqual([]);
  });

  it("O30: Vincular grava a matrícula e a empresa DO QUADRO, com autoria no histórico", async () => {
    await cadastro("f-dt", "Maria Souza");
    const r = await postVincular(json({ funcionario_id: "f-dt", quadro_id: "q1", matricula: "999" }));
    expect(r.status).toBe(200);
    const ds = await getDataSource();
    const f = await ds.obter("funcionarios", "f-dt");
    expect([f?.matricula, f?.empresa]).toEqual(["100", "EMPRESA A"]);
    const hist = (await ds.listar("historico")).filter((h) => h.tabela === "funcionarios" && h.registro_id === "f-dt");
    expect(hist.at(-1)?.usuario).toBe("coord@x.com");
    // Vinculada, sai do "sem vínculo".
    const corpo = await (await pedirGet("christus_dt")).json();
    expect(corpo.semVinculo).toEqual([]);
  });

  it("O29/O23: pessoa do Quadro de outra sede, nome que não confere ou funcionário de sede alheia → recusado, nada gravado", async () => {
    await cadastro("f-dt", "Maria Souza");
    await cadastro("f-ald", "Pessoa De Outra Sede", { sede_id: "christus_ald" });
    expect((await postVincular(json({ funcionario_id: "f-dt", quadro_id: "q2" }))).status).toBe(422);
    expect((await postVincular(json({ funcionario_id: "f-dt", quadro_id: "q4" }))).status).toBe(422);
    expect((await postVincular(json({ funcionario_id: "f-dt", quadro_id: "q3" }))).status).toBe(422);
    expect((await postVincular(json({ funcionario_id: "f-ald", quadro_id: "q2" }))).status).toBe(403);
    expect((await postVincular(json({ funcionario_id: "f-dt" }))).status).toBe(422);
    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", "f-dt"))?.matricula).toBe("");
    expect((await ds.obter("funcionarios", "f-ald"))?.matricula).toBe("");
  });

  it("O25: matrícula já em outro cadastro (qualquer sede) → 422 sem dizer quem", async () => {
    await cadastro("f-dt", "Maria Souza");
    await cadastro("f-ald", "Outra Pessoa", { sede_id: "christus_ald", matricula: "100" });
    const r = await postVincular(json({ funcionario_id: "f-dt", quadro_id: "q1" }));
    expect(r.status).toBe(422);
    expect(await r.text()).not.toMatch(/Outra Pessoa|christus_ald|f-ald/u);
  });

  it("transferência: cadastro novo na DT recebe a matrícula que o cadastro desligado da ALD tinha (auditoria)", async () => {
    await cadastro("f-velho", "Maria Aparecida Souza", { sede_id: "christus_ald", matricula: "100", empresa: "EMPRESA A", desligado_em: "2026-09-01", ativo: false });
    await cadastro("f-novo", "Maria Souza");
    const corpo = await (await pedirGet("christus_dt")).json();
    expect(corpo.semVinculo).toEqual([expect.objectContaining({ funcionario_id: "f-novo", sugestoes: [expect.objectContaining({ quadro_id: "q1" })] })]);
    expect((await postVincular(json({ funcionario_id: "f-novo", quadro_id: "q1" }))).status).toBe(200);
    // E à mão também: outro cadastro novo pega a matrícula de quem saiu.
    await cadastro("f-outro", "Outra Pessoa", { sede_id: "christus_ald", matricula: "777", desligado_em: "2026-09-01" });
    await cadastro("f-mao", "Mais Uma");
    expect((await putFuncionario(json({ matricula: "777" }, "PUT"), ctx("f-mao"))).status).toBe(200);
  });

  it("já vinculado ou desligado não se vincula de novo", async () => {
    await cadastro("f-1", "Maria Souza", { matricula: "55" });
    await cadastro("f-2", "Maria A Souza", { desligado_em: "2026-01-01" });
    expect((await postVincular(json({ funcionario_id: "f-1", quadro_id: "q1" }))).status).toBe(422);
    expect((await postVincular(json({ funcionario_id: "f-2", quadro_id: "q1" }))).status).toBe(422);
  });

  it("O27/O28: o PUT do cadastro não grava empresa nem desligamento", async () => {
    await cadastro("f-dt", "Maria Souza");
    for (const corpo of [{ empresa: "EMPRESA A" }, { matricula: "1", ativo: false }, { desligado_em: "2026-01-01" }]) {
      expect((await putFuncionario(json(corpo, "PUT"), ctx("f-dt"))).status).toBe(422);
    }
    expect((await postFuncionario(json({ nome: "Nova Pessoa", sede_id: "christus_dt", empresa: "X" }))).status).toBe(422);
  });

  it("matrícula única também no cadastro; trocar a matrícula à mão apaga a empresa do vínculo", async () => {
    await cadastro("f-1", "Maria Souza", { matricula: "100", empresa: "EMPRESA A" });
    await cadastro("f-2", "Outra Pessoa");
    expect((await putFuncionario(json({ matricula: "100.0" }, "PUT"), ctx("f-2"))).status).toBe(422);
    expect((await putFuncionario(json({ matricula: "100" }, "PUT"), ctx("f-1"))).status).toBe(200);
    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", "f-1"))?.empresa).toBe("EMPRESA A");
    expect((await putFuncionario(json({ matricula: "101" }, "PUT"), ctx("f-1"))).status).toBe(200);
    expect(await ds.obter("funcionarios", "f-1")).toMatchObject({ matricula: "101", empresa: "" });
  });

  it("O45: nenhuma variável do Chromos é pública", async () => {
    const { readFileSync } = await import("node:fs");
    for (const arq of ["services/quadroInfraService.ts", "app/api/quadro-infra/divergencias/route.ts", "app/(app)/funcionarios/page.tsx"]) {
      expect(readFileSync(arq, "utf8")).not.toMatch(/NEXT_PUBLIC_\w*CHROMOS/u);
    }
  });
});
