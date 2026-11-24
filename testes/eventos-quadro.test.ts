/**
 * Contrato de eventos do Quadro (v1), lado do Orkestria — "Orkestria → Cromos: contrato
 * de eventos do Quadro (v1)" no vault, com as emendas do `seguranca` e as decisões do dono
 * (13/11/2026): empresa em lista fechada, tipo no Desligar, troca de sede só pelo Transferir.
 *
 * O bloco "casos de ataque" tem UMA linha da tabela do `seguranca` por teste, com o nome
 * da linha. Pelas rotas: sessão simulada, banco de memória. Dados fictícios.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { MemoryDataSource, reiniciarBanco } from "@/lib/memoryStore";
import { MOTIVOS_DESLIGAMENTO, MOTIVOS_DO_CROMOS, pedidoDeVaga, validarDesligamento } from "@/lib/desligamento";
import { ehAsg, TETO_EVENTOS } from "@/lib/eventosQuadro";
import { analisarRota } from "@/lib/importacaoRota";
import { abrirVagaNoSgcp, substituirNoPosto, updateFuncionario } from "@/services/funcionariosService";
import type { NomeTabela } from "@/lib/schema";
import type { EventoQuadro, Funcionario } from "@/types";
import { cadastrarEmpresas } from "./fixtures";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { GET: feed, POST: feedPost, PUT: feedPut, DELETE: feedDelete, PATCH: feedPatch } = await import(
  "@/app/api/chromos/eventos-quadro/route"
);
const { POST: desligar } = await import("@/app/api/funcionarios/[id]/desligar/route");
const { POST: transferir } = await import("@/app/api/funcionarios/[id]/transferir/route");
const { POST: cadastrar } = await import("@/app/api/funcionarios/route");
const { PUT: editar, DELETE: excluir } = await import("@/app/api/funcionarios/[id]/route");
const { POST: importar } = await import("@/app/api/importar/aplicar/route");
const empresasRota = await import("@/app/api/empresas/route");
const { esquecerExpurgo } = await import("@/services/eventosQuadroService");

const COORD: SessaoUsuario = {
  id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt", "christus_ald"],
};
const ADMIN: SessaoUsuario = { id: "a1", nome: "Admin", email: "admin@x.com", perfil: "administrador", sede_id: "geral" };
const HOJE = "2026-11-16";
const KC = "chave-do-cromos-de-teste-com-32-caracteres";
const KO = "chave-do-orkestria-de-teste-com-32-caracteres";

const corpo = (c: unknown, metodo = "POST") =>
  new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedirFeed = (qs: string, autorizacao: string | null = `Bearer ${KC}`) =>
  feed(new Request(`http://x/api/chromos/eventos-quadro${qs}`, autorizacao === null ? {} : { headers: { authorization: autorizacao } }));
const diasAtras = (n: number) => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Uma ficha completa no quadro (dados fictícios). */
async function ficha(id: string, extra: Partial<Funcionario> = {}) {
  const ds = await getDataSource();
  const base = await ds.obter("funcionarios", "christus_f1");
  return ds.criar("funcionarios", {
    ...base!, id, nome: `Apelido ${id}`, nome_completo: `Nome Completo ${id}`, matricula: `M-${id}`, empresa: "APEL MATRIZ",
    data_admissao: "2024-01-15", cargo: "ASG", observacoes: "observação interna", desligado_em: "", ...extra,
  });
}
const eventos = async () => (await getDataSource()).listar("eventos_quadro");

/** Faz o `criar` do banco de memória falhar quando `quando` diz — dentro de um lote, o lote inteiro desfaz. */
function falharAoCriar(quando: (tabela: NomeTabela, registro: unknown) => boolean) {
  const original = MemoryDataSource.prototype.criar;
  return vi.spyOn(MemoryDataSource.prototype, "criar").mockImplementation((async function (this: MemoryDataSource, tabela: NomeTabela, registro: never) {
    if (quando(tabela, registro)) throw new Error("falha simulada no lote");
    return original.call(this, tabela, registro);
  }) as never);
}
const novaPessoa = (extra: Record<string, unknown> = {}) => ({
  nome: "Joana", nome_completo: "Joana Ficticia de Souza", matricula: "5001", empresa: "Apel - Matriz", data_admissao: "2025-03-10",
  sede_id: "christus_dt", turno: "integral", entrada: "07:00", saida: "16:00", cargo: "ASG", ...extra,
});

beforeEach(async () => {
  esquecerExpurgo();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HOJE}T15:00:00Z`));
  reiniciarBanco();
  sessao = COORD;
  vi.stubEnv("CHAVE_CROMOS", KC);
  vi.stubEnv("CHAVE_ORKESTRIA", KO);
  vi.stubEnv("CHAVE_CROMOS_ANTERIOR", "");
  vi.stubEnv("CHAVE_ORKESTRIA_ANTERIOR", "");
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("SGCP_VAGAS_URL", ""); // nenhuma vaga sai daqui nestes testes
  const ds = await getDataSource();
  await ds.atualizar("sedes", "christus_dt", { codigo: "DT" });
  await ds.atualizar("sedes", "christus_ald", { codigo: "ALD" });
  await ficha("f-asg");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Casos de ataque do `seguranca` (13/11/2026): uma linha, um teste ─────────────────
describe("casos de ataque — lado do Orkestria", () => {
  it("sem cabeçalho: 401, sem dados no corpo", async () => {
    const r = await pedirFeed(`?desde=${HOJE}`, null);
    expect(r.status).toBe(401);
    expect(Object.keys(await r.json())).toEqual(["erro"]);
  });

  it("chave de outro sistema (Bearer <CHAVE_ORKESTRIA>): 401", async () => {
    expect((await pedirFeed(`?desde=${HOJE}`, `Bearer ${KO}`)).status).toBe(401);
  });

  it("chave curta ou ausente: 503", async () => {
    vi.stubEnv("CHAVE_CROMOS", "a".repeat(31));
    expect((await pedirFeed(`?desde=${HOJE}`, `Bearer ${"a".repeat(31)}`)).status).toBe(503);
    vi.stubEnv("CHAVE_CROMOS", "");
    expect((await pedirFeed(`?desde=${HOJE}`, "Bearer ")).status).toBe(503);
  });

  it("chave igual a outra ou ao CRON_SECRET: 503", async () => {
    vi.stubEnv("CHAVE_ORKESTRIA", KC);
    expect((await pedirFeed(`?desde=${HOJE}`)).status).toBe(503);
    vi.stubEnv("CHAVE_ORKESTRIA", KO);
    vi.stubEnv("CRON_SECRET", KC);
    expect((await pedirFeed(`?desde=${HOJE}`)).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "outro-segredo");
    expect((await pedirFeed(`?desde=${HOJE}`)).status).toBe(200);
  });

  it("portão em toda rota app/api/chromos/*: confere a chave antes de ler a query", async () => {
    const raiz = path.resolve(import.meta.dirname, "../app/api/chromos");
    const rotas: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (statSync(p).isDirectory()) varrer(p);
        else if (nome === "route.ts") rotas.push(p);
      }
    };
    varrer(raiz);
    expect(rotas.length).toBeGreaterThanOrEqual(2); // resumo e eventos-quadro
    for (const arquivo of rotas) {
      const fonte = readFileSync(arquivo, "utf8");
      const portao = fonte.indexOf("recusaSeNaoForOChromos(req.headers");
      const leituras = ["searchParams", "req.url", "nextUrl", "req.json"].map((t) => fonte.indexOf(t)).filter((i) => i >= 0);
      expect([arquivo, portao >= 0]).toEqual([arquivo, true]);
      expect([arquivo, leituras.every((i) => i > portao)]).toEqual([arquivo, true]);
      // E de fato: sem chave e com query torta, a resposta é do portão (401), nunca 400.
      const mod = (await import(arquivo)) as { GET: (r: Request) => Promise<Response> };
      expect([arquivo, (await mod.GET(new Request("http://x/api/chromos/x?desde=lixo&de=lixo&ate=lixo"))).status]).toEqual([arquivo, 401]);
    }
  });

  it("desde inválido (2026-02-30, com hora, dd/mm/aaaa, repetido, vazio): 400", async () => {
    for (const qs of ["?desde=2026-02-30", "?desde=2026-11-01T00:00", "?desde=13/11/2026", `?desde=${HOJE}&desde=${HOJE}`, "?desde=", ""])
      expect([qs, (await pedirFeed(qs)).status]).toEqual([qs, 400]);
  });

  it("desde fora da janela (hoje − 61, hoje + 1): 400, sem cortar a janela por conta própria", async () => {
    expect((await pedirFeed(`?desde=${diasAtras(61)}`)).status).toBe(400);
    expect((await pedirFeed(`?desde=${diasAtras(-1)}`)).status).toBe(400);
    expect((await pedirFeed(`?desde=${diasAtras(60)}`)).status).toBe(200);
  });

  it("teto estourado: 413, nunca lista cortada", async () => {
    const ds = await getDataSource();
    const um = (i: number): EventoQuadro => ({
      id: `adm_${String(i).padStart(36, "0")}`, tipo: "admissao", dataEfetiva: HOJE, registradoEm: `${HOJE}T10:00:00.000Z`,
      matricula: String(i), empresa: "APEL MATRIZ", nome: "Fulano", admissao: HOJE, funcao: "ASG", identidadeAlteradaEm: "",
      sedeDe: "", sedePara: "DT", autor: "a@x.com", funcionarioId: String(i),
    });
    await ds.gravarLote(Array.from({ length: TETO_EVENTOS + 1 }, (_, i) => ({ tipo: "criar" as const, tabela: "eventos_quadro" as const, registro: um(i) })));
    const r = await pedirFeed(`?desde=${HOJE}`);
    expect(r.status).toBe(413);
    expect((await r.json()).eventos).toBeUndefined();
  });

  it("parâmetro estranho (?sede=X&campos=*&todos=1): mesma resposta que sem eles", async () => {
    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg"));
    const sem = await (await pedirFeed(`?desde=${HOJE}`)).json();
    const com = await (await pedirFeed(`?desde=${HOJE}&sede=X&campos=*&todos=1`)).json();
    expect(sem.eventos).toHaveLength(1);
    expect(com).toEqual(sem);
  });

  it("outros métodos (POST, PUT, DELETE, PATCH): 405", async () => {
    for (const metodo of [feedPost, feedPut, feedDelete, feedPatch]) {
      const r = await metodo();
      expect(r.status).toBe(405);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("só ASG: evento de cargo que não é ASG não aparece — e nem é gerado", async () => {
    await ficha("f-porteiro", { cargo: "Porteiro" });
    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-porteiro"));
    expect(await eventos()).toEqual([]);
    // Gravado à mão com função de outro cargo: o feed não entrega.
    const ds = await getDataSource();
    await ds.gravarLote([{ tipo: "criar", tabela: "eventos_quadro", registro: {
      id: "desl_x", tipo: "desligamento", dataEfetiva: HOJE, registradoEm: `${HOJE}T10:00:00.000Z`, matricula: "1", empresa: "APEL MATRIZ",
      nome: "Outro", funcao: "Porteiro", identidadeAlteradaEm: "", sedeDe: "DT", sedePara: "", motivo: "", autor: "a@x.com", funcionarioId: "x",
    } }]);
    expect((await (await pedirFeed(`?desde=${HOJE}`)).json()).eventos).toEqual([]);
  });

  it("só os campos do contrato: ficha com observações, nome curto e setor → campos do contrato; motivo convertido; setor só como \"setor\"", async () => {
    await ficha("f-setor");
    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Dispensa sem justa causa", abrirVaga: false }), ctx("f-asg"));
    await transferir(corpo({ setor: "Cantina do bloco B", data: HOJE }), ctx("f-setor"));
    const { eventos: lista } = await (await pedirFeed(`?desde=${HOJE}`)).json();
    const desl = lista.find((e: { tipo: string }) => e.tipo === "desligamento");
    const transf = lista.find((e: { tipo: string }) => e.tipo === "transferencia");
    const COMUNS = ["id", "tipo", "dataEfetiva", "registradoEm", "matricula", "empresa", "nome", "funcao", "identidadeAlteradaEm", "sedeDe", "sedePara", "autor", "funcionarioId"];
    expect(Object.keys(desl).sort()).toEqual([...COMUNS, "motivo"].sort());
    expect(Object.keys(transf).sort()).toEqual([...COMUNS].sort());
    expect(desl).toMatchObject({ nome: "Nome Completo f-asg", motivo: "Dispensa sem justa causa", sedeDe: "DT", sedePara: "" });
    expect(transf).toMatchObject({ sedePara: "setor", sedeDe: "DT", id: "transf_f-setor" });
    expect(JSON.stringify(lista)).not.toMatch(/observação interna|Cantina|Apelido/);
  });

  it("cabeçalhos da resposta: Cache-Control no-store, sem CORS — em qualquer resposta", async () => {
    const respostas = [
      await pedirFeed(`?desde=${HOJE}`), await pedirFeed("?desde=lixo"), await pedirFeed(`?desde=${HOJE}`, null), await feedPost(),
    ];
    vi.stubEnv("CHAVE_CROMOS", "");
    respostas.push(await pedirFeed(`?desde=${HOJE}`));
    expect(respostas.map((r) => r.status)).toEqual([200, 400, 401, 405, 503]);
    for (const r of respostas) {
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect([...r.headers.keys()].filter((k) => k.startsWith("access-control-"))).toEqual([]);
    }
  });

  it("desligar com falha no lote: nem a ficha muda nem o evento é gravado", async () => {
    falharAoCriar((tabela) => tabela === "eventos_quadro");
    const r = await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg"));
    expect(r.status).toBe(500);
    const f = await (await getDataSource()).obter("funcionarios", "f-asg");
    expect(f?.desligado_em).toBe("");
    expect(f?.ativo).toBe(true);
    expect(await eventos()).toEqual([]);
  });

  it("evento lido do banco, não do corpo: matricula, autor e sedeDe extras no /desligar são ignorados", async () => {
    await desligar(
      corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false, matricula: "999", autor: "falso@x.com", sedeDe: "ALD", empresa: "IPADE", nome: "Outro" }),
      ctx("f-asg"),
    );
    const [e] = await eventos();
    expect(e).toMatchObject({
      id: "desl_f-asg", matricula: "M-f-asg", empresa: "APEL MATRIZ", nome: "Nome Completo f-asg", sedeDe: "DT", autor: "coord@x.com", motivo: "",
    });
  });

  it("\"Transferência\" no /desligar: recusado, nada gravado", async () => {
    const r = await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Transferência", abrirVaga: false }), ctx("f-asg"));
    expect(r.status).toBe(422);
    expect((await (await getDataSource()).obter("funcionarios", "f-asg"))?.desligado_em).toBe("");
    expect(await eventos()).toEqual([]);
  });

  it("\"saiu do posto\": nenhum evento", async () => {
    const r = await desligar(corpo({ tipo: "saiu_do_posto", data: HOJE }), ctx("f-asg"));
    expect(r.status).toBe(200);
    expect(await eventos()).toEqual([]);
  });

  it("PUT com sede_id de ASG: recusado (também para o administrador); só pelo Transferir", async () => {
    expect((await editar(corpo({ sede_id: "christus_ald" }, "PUT"), ctx("f-asg"))).status).toBe(422);
    sessao = ADMIN;
    const r = await editar(corpo({ sede_id: "christus_ald" }, "PUT"), ctx("f-asg"));
    expect(r.status).toBe(422);
    expect((await r.json()).alertas[0].codigo).toBe("SEDE_SO_PELO_TRANSFERIR");
    expect((await (await getDataSource()).obter("funcionarios", "f-asg"))?.sede_id).toBe("christus_dt");
    // A mesma sede de volta (o formulário manda a ficha inteira) continua passando.
    expect((await editar(corpo({ sede_id: "christus_dt", entrada: "06:30" }, "PUT"), ctx("f-asg"))).status).toBe(200);
  });

  it("importação com ASG novo: adm_ no mesmo lote; falha no lote não deixa nem ficha nem evento", async () => {
    const linha = { funcionario: "Rosa", entrada: "07:00", saida: "16:00", inicio: "07:00", fim: "08:00", tarefa: "Varrer", local: "Pátio",
      nome_completo: "Rosa Ficticia Lima", matricula: "7001", empresa: "IPADE", admissao: "01/02/2025" };
    const analise = analisarRota([linha]);
    const espiao = falharAoCriar((tabela) => tabela === "eventos_quadro");
    expect((await importar(corpo({ sede_id: "christus_dt", data: "2026-11-20", analise }))).status).toBe(500);
    const ds = await getDataSource();
    expect((await ds.listar("funcionarios")).filter((f) => f.nome === "Rosa")).toEqual([]);
    expect(await eventos()).toEqual([]);
    espiao.mockRestore();

    expect((await importar(corpo({ sede_id: "christus_dt", data: "2026-11-20", analise }))).status).toBe(200);
    const rosa = (await ds.listar("funcionarios")).find((f) => f.nome === "Rosa")!;
    expect(await eventos()).toEqual([
      expect.objectContaining({ id: `adm_${rosa.id}`, tipo: "admissao", admissao: "2025-02-01", matricula: "7001", empresa: "IPADE", sedePara: "DT", autor: "coord@x.com" }),
    ]);
  });

  it("DELETE depois de adm_: recusado (e a ficha nova de uma transferência também)", async () => {
    const r = await cadastrar(corpo(novaPessoa()));
    const { id } = await r.json();
    const d = await excluir(new Request("http://x", { method: "DELETE" }), ctx(id));
    expect(d.status).toBe(422);
    expect((await d.json()).alertas[0].codigo).toBe("FICHA_JA_NO_QUADRO");
    expect(await (await getDataSource()).obter("funcionarios", id)).not.toBeNull();

    const t = await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-asg"));
    const { novo } = await t.json();
    expect((await excluir(new Request("http://x", { method: "DELETE" }), ctx(novo.id))).status).toBe(422);
    // ASG no quadro SEM evento guardado (a carga de 13/11, ou o evento já expirado pela
    // retenção de 90 dias): também recusada — sai pelo Desligar (seguranca/auditor, 16/11/2026).
    await ficha("f-sem-evento");
    expect((await excluir(new Request("http://x", { method: "DELETE" }), ctx("f-sem-evento"))).status).toBe(422);
    // Quem não é ASG, sem vínculo, continua podendo ser excluído.
    await ficha("f-encarregada", { cargo: "Encarregada" });
    expect((await excluir(new Request("http://x", { method: "DELETE" }), ctx("f-encarregada"))).status).toBe(200);
  });

  it("depois que a retenção apaga o adm_ (90 dias), a ficha ASG continua sem poder ser excluída", async () => {
    const r = await cadastrar(corpo(novaPessoa()));
    const { id } = await r.json();
    // Simula a expiração: o evento some da coleção (o único caminho real é o expurgo do feed).
    const ds = await getDataSource();
    const interno = (ds as unknown as { interno?: { excluir: (t: string, i: string) => Promise<void> } }).interno;
    if (interno) await interno.excluir("eventos_quadro", `adm_${id}`);
    expect(await ds.obter("eventos_quadro", `adm_${id}`)).toBeNull();
    const d = await excluir(new Request("http://x", { method: "DELETE" }), ctx(id));
    expect(d.status).toBe(422);
    expect((await d.json()).alertas[0].codigo).toBe("FICHA_JA_NO_QUADRO");
  });

  it("transferência com falha no meio (erro ao criar a ficha de destino): nada gravado", async () => {
    falharAoCriar((tabela, registro) => tabela === "funcionarios" && Boolean((registro as Funcionario).transferido_de));
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-asg"));
    expect(r.status).toBe(500);
    const ds = await getDataSource();
    const origem = await ds.obter("funcionarios", "f-asg");
    expect(origem).toMatchObject({ desligado_em: "", ativo: true });
    expect(origem?.transferido_para ?? "").toBe("");
    expect((await ds.listar("funcionarios")).filter((f) => f.transferido_de === "f-asg")).toEqual([]);
    expect(await eventos()).toEqual([]);
  });

  it("evento é só de inclusão: atualizar ou excluir na coleção de eventos lança erro", async () => {
    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg"));
    const ds = await getDataSource();
    await expect(ds.atualizar("eventos_quadro", "desl_f-asg", { motivo: "x" })).rejects.toThrow(/só de inclusão/);
    await expect(ds.atualizarSe("eventos_quadro", "desl_f-asg", () => true, { motivo: "x" })).rejects.toThrow(/só de inclusão/);
    await expect(ds.excluir("eventos_quadro", "desl_f-asg")).rejects.toThrow(/só de inclusão/);
    await expect(ds.gravarLote([{ tipo: "excluir", tabela: "eventos_quadro", id: "desl_f-asg" }])).rejects.toThrow(/só de inclusão/);
    await expect(ds.gravarLote([{ tipo: "atualizar", tabela: "eventos_quadro", id: "desl_f-asg", mudancas: { motivo: "x" } }])).rejects.toThrow(/só de inclusão/);
    const [e] = await eventos();
    await expect(ds.criar("eventos_quadro", { ...e, motivo: "x" })).rejects.toThrow(/só de inclusão/);
    await expect(ds.gravarLote([{ tipo: "criar", tabela: "eventos_quadro", registro: { ...e, motivo: "x" } }])).rejects.toThrow(/só de inclusão/);
    expect(await eventos()).toEqual([e]);
    // O banco de memória sozinho (sem o decorator) também recusa o id repetido no lote, como o `create` do Firestore.
    await expect(new MemoryDataSource().gravarLote([{ tipo: "criar", tabela: "eventos_quadro", registro: e }])).rejects.toThrow(/já existe/);
  });

  it("identidade alterada: trocar matrícula, empresa ou nome e depois desligar → o evento leva identidadeAlteradaEm", async () => {
    const ds = await getDataSource();
    await editar(corpo({ observacoes: "só isto" }, "PUT"), ctx("f-asg"));
    expect((await ds.obter("funcionarios", "f-asg"))?.identidade_alterada_em ?? "").toBe("");
    for (const [i, mudanca] of ([{ matricula: "M-nova" }, { empresa: "IPADE" }, { nome_completo: "Nome Corrigido" }] as const).entries()) {
      vi.setSystemTime(new Date(`${HOJE}T1${i}:00:00Z`));
      expect((await editar(corpo(mudanca, "PUT"), ctx("f-asg"))).status).toBe(200);
      expect((await ds.obter("funcionarios", "f-asg"))?.identidade_alterada_em).toBe(`${HOJE}T1${i}:00:00.000Z`);
    }
    // O corpo não escolhe o carimbo.
    expect((await editar(corpo({ identidade_alterada_em: "" }, "PUT"), ctx("f-asg"))).status).toBe(422);
    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg"));
    expect((await eventos())[0]).toMatchObject({ identidadeAlteradaEm: `${HOJE}T12:00:00.000Z`, matricula: "M-nova", empresa: "IPADE", nome: "Nome Corrigido" });
  });

  it("cadastro incompleto de ASG (sem matrícula, sem empresa, sem admissão; empresa fora da lista): recusado, sem evento", async () => {
    for (const falta of [{ matricula: "" }, { empresa: "" }, { data_admissao: "" }, { empresa: "Empresa Inventada" }]) {
      const r = await cadastrar(corpo(novaPessoa(falta)));
      expect([falta, r.status]).toEqual([falta, 422]);
    }
    const r = await cadastrar(corpo(novaPessoa({ empresa: "Empresa Inventada" })));
    expect((await r.json()).alertas[0].codigo).toBe("EMPRESA_FORA_DO_CADASTRO");
    expect((await getDataSource()).listar("funcionarios").then((l) => l.filter((f) => f.nome === "Joana"))).resolves.toEqual([]);
    expect(await eventos()).toEqual([]);
  });
});

// ── Formato fixado pelo Chromos ao implementar o recebimento (16/11/2026) ─────────────
describe("formato que o Chromos recebe", () => {
  const ID_DO_CROMOS = /^(adm|desl|transf)_[0-9a-f-]{36}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("envelope exatamente { eventos }; funcionarioId UUID minúsculo; o id recalculado de tipo + funcionarioId bate; admissão com a sede em sedePara", async () => {
    const r = await cadastrar(corpo(novaPessoa()));
    const { id } = await r.json();
    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Término de contrato", abrirVaga: false }), ctx(id));
    const outra = await (await cadastrar(corpo(novaPessoa({ nome: "Ana", matricula: "5003", nome_completo: "Ana Ficticia" })))).json();
    await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx(outra.id));

    const resposta = await (await pedirFeed(`?desde=${HOJE}`)).json();
    expect(Object.keys(resposta)).toEqual(["eventos"]);
    const lista = resposta.eventos as Array<Record<string, string>>;
    expect(lista.map((e) => e.tipo).sort()).toEqual(["admissao", "admissao", "desligamento", "transferencia"]);
    const PREFIXO: Record<string, string> = { admissao: "adm", desligamento: "desl", transferencia: "transf" };
    for (const e of lista) {
      expect(e.funcionarioId).toMatch(UUID);
      expect(e.id).toMatch(ID_DO_CROMOS);
      expect(e.id).toBe(`${PREFIXO[e.tipo]}_${e.funcionarioId}`);
    }
    for (const adm of lista.filter((e) => e.tipo === "admissao")) expect(adm).toMatchObject({ sedeDe: "", sedePara: "DT" });
    expect(lista.find((e) => e.tipo === "transferencia")).toMatchObject({ funcionarioId: outra.id, sedeDe: "DT", sedePara: "ALD" });
    expect(lista.find((e) => e.tipo === "desligamento")).toMatchObject({ funcionarioId: id, motivo: "Término de contrato", sedePara: "" });
  });

  it("acima de 512 KB (mesmo com menos de 500 eventos): 413, nunca lista cortada", async () => {
    const ds = await getDataSource();
    const grande = "x".repeat(1200);
    await ds.gravarLote(Array.from({ length: 450 }, (_, i) => ({ tipo: "criar" as const, tabela: "eventos_quadro" as const, registro: {
      id: `adm_${String(i).padStart(36, "0")}`, tipo: "admissao" as const, dataEfetiva: HOJE, registradoEm: `${HOJE}T10:00:00.000Z`,
      matricula: String(i), empresa: "APEL MATRIZ", nome: grande, admissao: HOJE, funcao: "ASG", identidadeAlteradaEm: "",
      sedeDe: "", sedePara: "DT", autor: "a@x.com", funcionarioId: String(i),
    } })));
    const r = await pedirFeed(`?desde=${HOJE}`);
    expect(r.status).toBe(413);
    expect((await r.json()).eventos).toBeUndefined();
  });
});

// ── Emissão no mesmo lote ────────────────────────────────────────────────────────────
describe("emissão dos eventos", () => {
  it("cadastro de ASG → adm_ com os dados GRAVADOS (empresa normalizada); cargo de outra função → sem evento", async () => {
    const r = await cadastrar(corpo(novaPessoa({ observacoes: "nada a ver" })));
    expect(r.status).toBe(201);
    const { id } = await r.json();
    expect(await eventos()).toEqual([{
      id: `adm_${id}`, tipo: "admissao", dataEfetiva: "2025-03-10", registradoEm: `${HOJE}T15:00:00.000Z`, matricula: "5001",
      empresa: "APEL MATRIZ", nome: "Joana Ficticia de Souza", admissao: "2025-03-10", funcao: "ASG", identidadeAlteradaEm: "",
      sedeDe: "", sedePara: "DT", autor: "coord@x.com", funcionarioId: id,
    }]);
    await cadastrar(corpo(novaPessoa({ nome: "Pedro", matricula: "5002", cargo: "Jardineiro" })));
    expect(await eventos()).toHaveLength(1);
  });

  it("cadastro com falha no lote: nem a ficha nem o evento", async () => {
    falharAoCriar((tabela) => tabela === "eventos_quadro");
    expect((await cadastrar(corpo(novaPessoa()))).status).toBe(500);
    expect((await (await getDataSource()).listar("funcionarios")).filter((f) => f.nome === "Joana")).toEqual([]);
  });

  it("transferência entre sedes → transf_<origem> com os códigos das duas sedes; a ficha nova leva o carimbo de identidade", async () => {
    const ds = await getDataSource();
    await ds.atualizar("funcionarios", "f-asg", { identidade_alterada_em: "2026-11-01T10:00:00.000Z" });
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-asg"));
    expect(r.status).toBe(200);
    const { novo } = await r.json();
    expect(await eventos()).toEqual([expect.objectContaining({
      id: "transf_f-asg", tipo: "transferencia", funcionarioId: "f-asg", sedeDe: "DT", sedePara: "ALD", dataEfetiva: HOJE,
      identidadeAlteradaEm: "2026-11-01T10:00:00.000Z", matricula: "M-f-asg",
    })]);
    expect((await ds.obter("funcionarios", novo.id))?.identidade_alterada_em).toBe("2026-11-01T10:00:00.000Z");
    expect((await eventos())[0].motivo).toBeUndefined();
  });

  it("dois cliques no mesmo desligamento: um grava, o outro falha inteiro (o evento não é sobrescrito)", async () => {
    const [a, b] = await Promise.all([
      desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg")),
      desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Acordo", abrirVaga: false }), ctx("f-asg")),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 500]);
    const lista = await eventos();
    expect(lista).toHaveLength(1);
    const f = await (await getDataSource()).obter("funcionarios", "f-asg");
    expect(f?.observacoes).toContain(a.status === 200 ? "Outros" : "Acordo");
    expect(f?.observacoes).not.toContain(a.status === 200 ? "Acordo" : "Outros");
  });

  it("ehAsg: ASG e Auxiliar de Serviços Gerais em qualquer grafia; vazio e outros cargos, não", () => {
    for (const c of ["ASG", "asg", " A.S.G. ", "Auxiliar de Serviços Gerais", "AUXILIAR DE SERVICOS  GERAIS"]) expect([c, ehAsg(c)]).toEqual([c, true]);
    for (const c of ["", undefined, "Porteiro", "ASG Líder", "Encarregado de ASG"]) expect([c, ehAsg(c)]).toEqual([c, false]);
  });
});

// ── Decisão B: tipo no Desligar e motivos ────────────────────────────────────────────
describe("Desligar com tipo", () => {
  it("sem tipo, ou tipo desconhecido: recusado, nada gravado", async () => {
    for (const tipo of [undefined, "", "saiu", "posto"]) {
      const r = await desligar(corpo({ tipo, data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg"));
      expect([tipo, r.status]).toEqual([tipo, 422]);
    }
    expect((await (await getDataSource()).obter("funcionarios", "f-asg"))?.desligado_em).toBe("");
  });

  it("saiu do posto: a pessoa continua ativa, sem rota; a rota vira um posto vago que alguém pode assumir", async () => {
    const ds = await getDataSource();
    const item = (id: string, inicio: string) => ({
      id, nome_modelo: "Rota padrão", sede_id: "christus_dt", funcionario_id: "f-asg", tarefa_id: "christus_t1",
      local_id: "christus_l1", inicio_planejado: inicio, duracao_min: 30, padrao: true, criado_por: "t", criado_em: "",
    });
    await ds.criar("modelos_rotina", item("rota-f-asg-1", "07:00"));
    await ds.criar("modelos_rotina", item("troca-de-outra-pessoa", "08:00")); // id sem a pessoa (veio de uma troca)
    const bloco = (id: string, data: string, status = "planejada") => ({
      id, data, funcionario_id: "f-asg", sede_id: "christus_dt", tarefa_id: "christus_t1", local_id: "christus_l1",
      inicio_planejado: "07:00", fim_planejado: "07:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2,
      status, observacao: "", supervisor_id: "u", criado_em: "", atualizado_em: "",
    });
    await ds.criar("rotinas_planejadas", bloco("b-ontem", "2026-11-13") as never);
    await ds.criar("rotinas_planejadas", bloco("b-amanha", "2026-11-17") as never);
    await ds.criar("rotinas_planejadas", bloco("b-feito", "2026-11-17", "realizada") as never);

    const r = await desligar(corpo({ tipo: "saiu_do_posto", data: HOJE }), ctx("f-asg"));
    expect(r.status).toBe(200);
    const res = await r.json();
    expect(res).toMatchObject({ itensDeRotaMovidos: 2, blocosRemovidos: 1, blocosPreservados: 1 });

    const pessoa = await ds.obter("funcionarios", "f-asg");
    expect(pessoa).toMatchObject({ ativo: true, desligado_em: "", sede_id: "christus_dt" });
    expect(await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: "f-asg" }])).toEqual([]);
    expect(await ds.obter("rotinas_planejadas", "b-amanha")).toBeNull();
    expect(await ds.obter("rotinas_planejadas", "b-ontem")).not.toBeNull();
    expect(await ds.obter("rotinas_planejadas", "b-feito")).not.toBeNull();

    const posto = await ds.obter("funcionarios", res.postoVagoId);
    expect(posto).toMatchObject({
      nome: "Posto de Apelido f-asg", sede_id: "christus_dt", ativo: false, desligado_em: HOJE, motivo_desligamento: "Saiu do posto",
      entrada: pessoa?.entrada, saida: pessoa?.saida, cargo: "ASG",
    });
    expect(posto?.matricula ?? "").toBe("");
    expect(posto?.nome_completo ?? "").toBe("");
    const doPosto = await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: posto!.id }]);
    expect(doPosto.map((i) => i.id).sort()).toEqual([`rota-${posto!.id}-1`, "troca-de-outra-pessoa"].sort());
    expect(await abrirVagaNoSgcp(posto!.id, { nome: "x" })).toMatchObject({ aberta: false, motivo: expect.stringMatching(/continua na sede/) });

    // Quem chega assume o posto vago pelo "Assume o posto de".
    await ficha("f-chega", { matricula: "M-chega" });
    await substituirNoPosto("f-chega", posto!.id, "2026-11-17", "t@t.com");
    expect(await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: "f-chega" }])).toHaveLength(2);
    expect((await ds.obter("funcionarios", posto!.id))?.substituido_por).toBe("f-chega");
    expect(await eventos()).toEqual([]);
  });

  it("saiu do posto não aceita extinguir o posto nem abrir vaga, e recusa quem já saiu", async () => {
    expect((await desligar(corpo({ tipo: "saiu_do_posto", data: HOJE, extinguirPosto: true }), ctx("f-asg"))).status).toBe(422);
    expect((await desligar(corpo({ tipo: "saiu_do_posto", data: HOJE, abrirVaga: true }), ctx("f-asg"))).status).toBe(422);
    expect((await desligar(corpo({ tipo: "saiu_do_posto", data: "2026-02-30" }), ctx("f-asg"))).status).toBe(422);
    await ficha("f-saiu", { desligado_em: "2026-11-01", ativo: false });
    expect((await desligar(corpo({ tipo: "saiu_do_posto", data: HOJE }), ctx("f-saiu"))).status).toBe(422);
  });

  it("motivos: os 6 do Chromos (grafia exata) e os 5 daqui; o evento leva os 6 como estão e os 5 vazios", async () => {
    expect(MOTIVOS_DESLIGAMENTO).toEqual([
      "Término de contrato", "Dispensa sem justa causa", "Dispensa por justa causa", "Pedido de demissão — trabalhado",
      "Pedido de demissão — não trabalhado", "Aviso prévio indenizado",
      "Término de experiência", "Acordo", "Aposentadoria", "Abandono de emprego", "Outros",
    ]);
    expect(MOTIVOS_DO_CROMOS.filter((m) => m.includes("—")).every((m) => m.includes("—"))).toBe(true);
    for (const [i, motivo] of MOTIVOS_DESLIGAMENTO.entries()) {
      await ficha(`f-m${i}`, { matricula: `MM-${i}` });
      const r = await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo, abrirVaga: false }), ctx(`f-m${i}`));
      expect([motivo, r.status]).toEqual([motivo, 200]);
      const e = (await eventos()).find((x) => x.id === `desl_f-m${i}`);
      expect([motivo, e?.motivo]).toEqual([motivo, (MOTIVOS_DO_CROMOS as readonly string[]).includes(motivo) ? motivo : ""]);
    }
  });

  it("motivos antigos: recusados no corpo, mas a ficha gravada com eles ainda abre a vaga; justa causa (nova ou antiga) vai como \"Desligamento\"", async () => {
    for (const antigo of ["Pedido de demissão", "Demissão sem justa causa", "Demissão por justa causa", "Transferência", "Pedido de demissão - trabalhado"])
      expect([antigo, validarDesligamento({ data: HOJE, motivo: antigo })]).toEqual([antigo, "Escolha o motivo do desligamento."]);
    for (const antigo of ["Pedido de demissão", "Demissão sem justa causa", "Demissão por justa causa", "Transferência"])
      expect([antigo, validarDesligamento({ data: HOJE, motivo: antigo }, { gravado: true })]).toEqual([antigo, null]);

    const ds = await getDataSource();
    await ds.atualizar("funcionarios", "f-asg", { desligado_em: "2026-10-01", ativo: false, motivo_desligamento: "Demissão sem justa causa" });
    vi.stubEnv("SGCP_VAGAS_URL", "https://sgcp.test/api/vagas-externas");
    const chamadas: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      chamadas.push(String(init?.body));
      return Response.json({ codigo: "123" }, { status: 201 });
    });
    expect(await abrirVagaNoSgcp("f-asg", { nome: "x" })).toEqual({ aberta: true, codigo: "123" });
    expect(JSON.parse(chamadas[0]).motivo).toBe("Demissão sem justa causa");

    const base = { id: "x", nome: "X", cargo: "ASG", desligado_em: HOJE };
    const sede = { codigo: "DT", nome_sede: "DT" };
    for (const m of ["Dispensa por justa causa", "Demissão por justa causa"])
      expect(pedidoDeVaga({ funcionario: { ...base, motivo_desligamento: m }, sede, rota: [], solicitante: { nome: "s" } }).motivo).toBe("Desligamento");
  });
});

// ── Decisão A: empresa em lista fechada ──────────────────────────────────────────────
describe("cadastro de empresas e lista fechada", () => {
  const listarEmpresas = (qs = "") => empresasRota.GET(new Request(`http://x/api/empresas${qs}`));

  it("GET: quem cadastra recebe só os nomes das ativas; o cadastro inteiro (?todas=1) só o administrador", async () => {
    const ds = await getDataSource();
    await cadastrarEmpresas("CTEC 2");
    await ds.atualizar("empresas", "emp_CTEC_2", { ativo: false });
    expect(await (await listarEmpresas()).json()).toEqual(["APEL 7", "APEL MATRIZ", "IPADE"]);
    expect((await listarEmpresas("?todas=1")).status).toBe(403);
    sessao = { ...COORD, perfil: "supervisor" };
    expect((await listarEmpresas()).status).toBe(403);
    sessao = ADMIN;
    const todas = await (await listarEmpresas("?todas=1")).json();
    expect(todas).toContainEqual({ id: "emp_CTEC_2", nome: "CTEC 2", ativo: false });
    expect(Object.keys(todas[0]).sort()).toEqual(["ativo", "id", "nome"]);
  });

  it("POST/PUT só do administrador; nome normalizado e único; sem renomear; DELETE não existe", async () => {
    expect((await empresasRota.POST(corpo({ nome: "Nova Empresa" }))).status).toBe(403);
    expect((await empresasRota.PUT(corpo({ id: "emp_IPADE", ativo: false }, "PUT"))).status).toBe(403);
    sessao = ADMIN;
    const r = await empresasRota.POST(corpo({ nome: "Ctec - Filial 06" }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: "emp_CTEC_6", nome: "CTEC 6", ativo: true });
    for (const nome of ["CTEC 6", "ctec-filial 6", "Apel Filial", "", "=HYPERLINK(\"x\")", "Nome\u0007"]) {
      const x = await empresasRota.POST(corpo({ nome }));
      expect([nome, x.status]).toEqual([nome, 422]);
    }
    expect((await empresasRota.PUT(corpo({ id: "emp_CTEC_6", nome: "CTEC 7", ativo: true }, "PUT"))).status).toBe(422);
    expect((await empresasRota.PUT(corpo({ id: "emp_CTEC_6", nome: "CTEC 6", ativo: false }, "PUT"))).status).toBe(200);
    expect((await (await getDataSource()).obter("empresas", "emp_CTEC_6"))?.ativo).toBe(false);
    expect("DELETE" in empresasRota).toBe(false);
  });

  it("empresa fora do cadastro ATIVO é recusada no cadastro, na edição que muda a empresa e na transferência", async () => {
    const ds = await getDataSource();
    await ds.atualizar("empresas", "emp_IPADE", { ativo: false });
    const codigo = async (r: Response) => (await r.json()).alertas?.[0]?.codigo;
    expect(await codigo(await cadastrar(corpo(novaPessoa({ empresa: "Ipade" }))))).toBe("EMPRESA_FORA_DO_CADASTRO");
    expect(await codigo(await editar(corpo({ empresa: "IPADE" }, "PUT"), ctx("f-asg")))).toBe("EMPRESA_FORA_DO_CADASTRO");
    // Editar outra coisa de quem já tem empresa (mesmo desativada depois) não esbarra.
    await ficha("f-ipade", { empresa: "IPADE", matricula: "M-ip" });
    expect((await editar(corpo({ entrada: "06:30", empresa: "Ipade" }, "PUT"), ctx("f-ipade"))).status).toBe(200);
    // Transferir quem é de empresa desativada: recusa ANTES de encerrar a origem.
    expect(await codigo(await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-ipade")))).toBe("EMPRESA_FORA_DO_CADASTRO");
    expect((await ds.obter("funcionarios", "f-ipade"))?.desligado_em).toBe("");
    expect(await eventos()).toEqual([]);
  });

  it("importação com empresa fora do cadastro: recusada antes de gravar", async () => {
    const analise = analisarRota([{ funcionario: "Lia", entrada: "07:00", saida: "16:00", inicio: "07:00", fim: "08:00", tarefa: "Varrer", local: "Pátio",
      nome_completo: "Lia Ficticia", matricula: "8001", empresa: "Empresa Inventada", admissao: "01/02/2025" }]);
    const r = await importar(corpo({ sede_id: "christus_dt", data: "2026-11-20", analise }));
    expect(r.status).toBe(422);
    expect((await r.json()).alertas.map((a: { codigo: string }) => a.codigo)).toContain("EMPRESA_FORA_DO_CADASTRO");
    expect((await (await getDataSource()).listar("funcionarios")).filter((f) => f.nome === "Lia")).toEqual([]);
  });

  it("nome e nome completo com caractere de controle ou começando com = + - @: recusados", async () => {
    for (const extra of [{ nome: "=SOMA(A1)" }, { nome: "@Joana" }, { nome_completo: "+Joana Souza" }, { nome_completo: " -Joana" }, { nome: "Jo\u0000ana" }]) {
      const r = await cadastrar(corpo(novaPessoa(extra)));
      expect([extra, r.status, (await r.json()).alertas?.some((a: { codigo: string }) => a.codigo === "NOME_INVALIDO")]).toEqual([extra, 422, true]);
    }
    await expect(updateFuncionario("f-asg", { nome: "=x" }, "t@t.com")).rejects.toThrow(/caractere de controle/);
  });
});

// ── Segunda rodada: bloqueio do `seguranca` e ressalvas do auditor (16/11/2026) ───────
describe("segunda rodada (seguranca e auditor, 16/11/2026)", () => {
  const ninguemInativoSemDesligamento = async () =>
    (await (await getDataSource()).listar("funcionarios")).filter((f) => f.ativo === false && !f.desligado_em).map((f) => f.id);

  it("1. Assume o posto de: só posto vago — ativa, inativa sem desligamento e posto extinto são recusados", async () => {
    await ficha("f-chega", { matricula: "M-chega" });
    await ficha("f-inativa", { matricula: "M-in", ativo: false });
    await ficha("f-extinto", { matricula: "M-ex", desligado_em: "2026-11-01", ativo: false, posto_extinto: true });
    for (const antigo of ["f-asg", "f-inativa", "f-extinto"]) {
      const erro = await substituirNoPosto("f-chega", antigo, HOJE, "t@t.com").catch((e) => e);
      expect([antigo, erro?.alertas?.[0]?.codigo]).toEqual([antigo, "POSTO_NAO_VAGO"]);
    }
    expect(await (await getDataSource()).obter("funcionarios", "f-asg")).toMatchObject({ ativo: true, desligado_em: "" });
    // Pelas rotas (cadastro novo e edição com "substitui"): a ASG ativa continua ativa.
    expect((await cadastrar(corpo({ ...novaPessoa(), substitui: "f-asg", substitui_desde: HOJE }))).status).toBe(422);
    expect((await editar(corpo({ substitui: "f-asg", substitui_desde: HOJE }, "PUT"), ctx("f-chega"))).status).toBe(422);
    expect(await ninguemInativoSemDesligamento()).toEqual(["f-inativa"]); // só a que já nasceu assim no teste
    // Posto vago de verdade (desligado, sem quem assumiu) continua podendo ser assumido.
    await ficha("f-saiu", { matricula: "M-saiu", desligado_em: "2026-11-10", ativo: false });
    await expect(substituirNoPosto("f-chega", "f-saiu", HOJE, "t@t.com")).resolves.toBeTruthy();
  });

  it("2. importação: nome com fórmula ou caractere de controle é recusado, nada gravado", async () => {
    const casos: Array<Record<string, string>> = [
      { funcionario: "=HYPERLINK(\"http://x\")" }, { funcionario: "@SOMA(1)" }, { funcionario: "+Rosa" },
      { funcionario: "Ro\u0007sa" }, { funcionario: "Rosa", nome_completo: "-Rosa Ficticia" },
    ];
    for (const caso of casos) {
      const analise = analisarRota([{ entrada: "07:00", saida: "16:00", inicio: "07:00", fim: "08:00", tarefa: "Varrer", local: "Pátio",
        nome_completo: "Rosa Ficticia", matricula: "7101", empresa: "IPADE", admissao: "01/02/2025", ...caso }]);
      expect([caso, analise.erros]).toEqual([caso, []]); // a recusa é a do cadastro, não da planilha
      const r = await importar(corpo({ sede_id: "christus_dt", data: "2026-11-20", analise }));
      expect([caso, r.status]).toEqual([caso, 422]);
      expect(JSON.stringify(await r.json())).toMatch(/caractere de controle/);
    }
    const ds = await getDataSource();
    expect((await ds.listar("funcionarios")).filter((f) => f.matricula === "7101")).toEqual([]);
    expect(await eventos()).toEqual([]);
  });

  it("3. cargo: a EDIÇÃO não muda nem grava o cargo; o evento leva funcao \"ASG\" normalizado", async () => {
    const codigo = async (r: Response) => (r.status === 200 ? 200 : (await r.json()).alertas?.[0]?.codigo);
    expect(await codigo(await editar(corpo({ cargo: "Porteiro" }, "PUT"), ctx("f-asg")))).toBe("CARGO_SO_PELO_TRANSFERIR");
    await ficha("f-porteiro", { cargo: "Porteiro", matricula: "M-port" });
    expect(await codigo(await editar(corpo({ cargo: "ASG" }, "PUT"), ctx("f-porteiro")))).toBe("CARGO_SO_PELO_TRANSFERIR");
    expect(await codigo(await editar(corpo({ cargo: "Jardineiro" }, "PUT"), ctx("f-porteiro")))).toBe("CARGO_SO_PELO_TRANSFERIR");
    expect(await codigo(await editar(corpo({ cargo: "Porteiro", entrada: "06:30" }, "PUT"), ctx("f-porteiro")))).toBe(200); // o formulário manda a ficha inteira
    expect(await codigo(await editar(corpo({ cargo: "A.S.G." }, "PUT"), ctx("f-asg")))).toBe(200); // continua ASG
    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg"));
    expect((await eventos())[0].funcao).toBe("ASG");
  });

  it("4. ordem do lote: a ficha e o evento vão nas primeiras escritas (o Firestore parte o lote a cada 500)", async () => {
    const ds = await getDataSource();
    const blocos = (dono: string) => Array.from({ length: 600 }, (_, i) => ({ tipo: "criar" as const, tabela: "rotinas_planejadas" as const, registro: {
      id: `b-${dono}-${i}`, data: "2026-11-20", funcionario_id: dono, sede_id: "christus_dt", tarefa_id: "christus_t1", local_id: "christus_l1",
      inicio_planejado: "07:00", fim_planejado: "07:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2,
      status: "planejada", observacao: "", supervisor_id: "u", criado_em: "", atualizado_em: "",
    } as never }));
    await ficha("f-vai", { matricula: "M-vai" });
    await ds.gravarLote([...blocos("f-asg"), ...blocos("f-vai")]);
    const espiao = vi.spyOn(MemoryDataSource.prototype, "gravarLote");
    const primeiros500 = () => espiao.mock.calls.at(-1)![0].slice(0, 500).map((o) => `${o.tipo}:${o.tabela}`);

    await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx("f-asg"));
    expect(primeiros500().slice(0, 2)).toEqual(["atualizar:funcionarios", "criar:eventos_quadro"]);
    await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"));
    expect(primeiros500().slice(0, 3)).toEqual(["atualizar:funcionarios", "criar:funcionarios", "criar:eventos_quadro"]);

    const analise = analisarRota([{ funcionario: "Rosa", entrada: "07:00", saida: "16:00", inicio: "07:00", fim: "08:00", tarefa: "Varrer", local: "Pátio Novo",
      nome_completo: "Rosa Ficticia Lima", matricula: "7001", empresa: "IPADE", admissao: "01/02/2025" }]);
    await importar(corpo({ sede_id: "christus_dt", data: "2026-11-20", analise }));
    expect(primeiros500().slice(0, 2)).toEqual(["criar:funcionarios", "criar:eventos_quadro"]);
  });

  describe("5. expurgo dos eventos com mais de 90 dias, de carona no feed (sem cron nem segredo novo)", () => {
    const evento = (id: string, registradoEm: string): EventoQuadro => ({
      id, tipo: "admissao", dataEfetiva: "2026-01-01", registradoEm, matricula: "1", empresa: "APEL MATRIZ", nome: "N", admissao: "2026-01-01",
      funcao: "ASG", identidadeAlteradaEm: "", sedeDe: "", sedePara: "DT", autor: "a@x.com", funcionarioId: id,
    });
    const ids = async () => (await eventos()).map((e) => e.id).sort();
    beforeEach(async () => {
      // hoje − 90 = 2026-08-18; o limite é 00:00 de Fortaleza desse dia (03:00Z).
      await (await getDataSource()).gravarLote([
        { tipo: "criar", tabela: "eventos_quadro", registro: evento("velho", "2026-08-18T02:59:59.999Z") },
        { tipo: "criar", tabela: "eventos_quadro", registro: evento("no-limite", "2026-08-18T03:00:00.000Z") },
        { tipo: "criar", tabela: "eventos_quadro", registro: evento("novo", `${HOJE}T10:00:00.000Z`) },
      ]);
    });

    it("feed 200 apaga o velho e não o novo; a resposta é a mesma de sempre; registra no histórico", async () => {
      const r = await pedirFeed(`?desde=${HOJE}`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ eventos: [expect.objectContaining({ id: "novo" })] });
      expect(await ids()).toEqual(["no-limite", "novo"]);
      const hist = (await (await getDataSource()).listar("historico")).filter((h) => h.tabela === "eventos_quadro");
      expect(hist).toEqual([expect.objectContaining({ acao: "excluir", registro_id: "expurgo", usuario: "chromos:expurgo-eventos-quadro" })]);
    });

    it("401, 400 e 413 não expurgam", async () => {
      expect((await pedirFeed(`?desde=${HOJE}`, null)).status).toBe(401);
      expect((await pedirFeed(`?desde=${HOJE}`, `Bearer ${KO}`)).status).toBe(401);
      expect((await pedirFeed("?desde=2026-02-30")).status).toBe(400);
      const ds = await getDataSource();
      await ds.gravarLote(Array.from({ length: TETO_EVENTOS + 1 }, (_, i) => ({ tipo: "criar" as const, tabela: "eventos_quadro" as const,
        registro: evento(`enchimento-${i}`, `${HOJE}T11:00:00.000Z`) })));
      expect((await pedirFeed(`?desde=${HOJE}`)).status).toBe(413);
      expect((await ids()).filter((id) => !id.startsWith("enchimento-"))).toEqual(["no-limite", "novo", "velho"]);
    });

    it("erro no expurgo não muda a resposta do feed", async () => {
      const { HistoricoDataSource } = await import("@/lib/historico");
      vi.spyOn(HistoricoDataSource.prototype, "expurgarEventosQuadroAntigos").mockRejectedValue(new Error("falha simulada no expurgo"));
      const r = await pedirFeed(`?desde=${HOJE}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(await r.json()).toEqual({ eventos: [expect.objectContaining({ id: "novo" })] });
      expect(await ids()).toEqual(["no-limite", "novo", "velho"]);
    });

    it("no máximo uma vez por dia; no dia seguinte, de novo — e parâmetro nenhum muda o limite", async () => {
      const { HistoricoDataSource } = await import("@/lib/historico");
      const espiao = vi.spyOn(HistoricoDataSource.prototype, "expurgarEventosQuadroAntigos");
      await pedirFeed(`?desde=${HOJE}&dias=0&limite=2099-01-01`);
      await pedirFeed(`?desde=${HOJE}`);
      expect(espiao).toHaveBeenCalledTimes(1);
      expect(await ids()).toEqual(["no-limite", "novo"]); // o "no-limite" não caiu, apesar do ?limite=
      vi.setSystemTime(new Date("2026-11-17T15:00:00Z")); // amanhã: o "no-limite" passa a ter mais de 90 dias
      await pedirFeed("?desde=2026-11-17");
      expect(espiao).toHaveBeenCalledTimes(2);
      expect(await ids()).toEqual(["novo"]);
    });

    it("a aplicação continua sem poder excluir evento — nem o velho, nem o novo", async () => {
      const ds = await getDataSource();
      await expect(ds.excluir("eventos_quadro", "novo")).rejects.toThrow(/só de inclusão/);
      await expect(ds.excluir("eventos_quadro", "velho")).rejects.toThrow(/só de inclusão/);
      expect(await eventos()).toHaveLength(3);
    });
  });

  it("6. saiu do posto: data futura recusada; dois pedidos simultâneos dão um posto só", async () => {
    const r = await desligar(corpo({ tipo: "saiu_do_posto", data: "2026-11-17" }), ctx("f-asg"));
    expect(r.status).toBe(422);
    expect((await r.json()).alertas[0].codigo).toBe("SAIU_DO_POSTO_DATA_FUTURA");
    const ds = await getDataSource();
    await ds.criar("modelos_rotina", {
      id: "rota-f-asg-1", nome_modelo: "Rota padrão", sede_id: "christus_dt", funcionario_id: "f-asg", tarefa_id: "christus_t1",
      local_id: "christus_l1", inicio_planejado: "07:00", duracao_min: 30, padrao: true, criado_por: "t", criado_em: "",
    });
    const [a, b] = await Promise.all([
      desligar(corpo({ tipo: "saiu_do_posto", data: HOJE }), ctx("f-asg")),
      desligar(corpo({ tipo: "saiu_do_posto", data: HOJE }), ctx("f-asg")),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const postos = (await ds.listar("funcionarios")).filter((f) => f.motivo_desligamento === "Saiu do posto");
    expect(postos.map((p) => p.id)).toEqual([`posto_f-asg_${HOJE}`]);
    expect(await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: postos[0].id }])).toHaveLength(1);
  });
});
