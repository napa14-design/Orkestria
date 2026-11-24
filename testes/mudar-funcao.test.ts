/**
 * "Transferir › Outra função" (24/11/2026): a promoção não espera o RH. A pessoa continua na sede, com
 * a ficha, a agenda e a rota; quem deixa de ser ASG gera o `transf_` para "setor", que no Chromos vai
 * para a lista do RH e nunca é aplicado sozinho. Pelas rotas: sessão simulada, banco de memória.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { MemoryDataSource, reiniciarBanco } from "@/lib/memoryStore";
import type { Funcionario } from "@/types";
import { cadastrarEmpresas } from "./fixtures";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao, gravarSessao: async () => {} }));

const { POST: transferir } = await import("@/app/api/funcionarios/[id]/transferir/route");
const { POST: desligar } = await import("@/app/api/funcionarios/[id]/desligar/route");
const { PUT, DELETE } = await import("@/app/api/funcionarios/[id]/route");
const { POST: cadastrar } = await import("@/app/api/funcionarios/route");
const { GET: feed } = await import("@/app/api/chromos/eventos-quadro/route");

const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt", "christus_ald"] };
const HOJE = "2026-11-24";
const KC = "chave-do-cromos-de-teste-com-32-caracteres";
const corpo = (c: unknown, metodo = "POST") =>
  new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const mudar = (c: Record<string, unknown>, id = "f1") => transferir(corpo({ data: HOJE, ...c }), ctx(id));
const codigo = async (r: Response) => (r.status === 200 ? 200 : ((await r.json()).alertas?.[0]?.codigo ?? r.status));
const eventos = async () => (await getDataSource()).listar("eventos_quadro");
const obter = async (id = "f1") => (await (await getDataSource()).obter("funcionarios", id))!;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HOJE}T15:00:00Z`));
  reiniciarBanco();
  await cadastrarEmpresas("EMPRESA A");
  sessao = COORD;
  vi.stubEnv("CHAVE_CROMOS", KC);
  vi.stubEnv("CHAVE_CROMOS_ANTERIOR", "");
  vi.stubEnv("SGCP_VAGAS_URL", "");
  const ds = await getDataSource();
  await ds.atualizar("sedes", "christus_dt", { codigo: "DT" });
  await ds.atualizar("sedes", "christus_ald", { codigo: "ALD" });
  const base = (await ds.obter("funcionarios", "christus_f1"))!;
  const ficha = (id: string, x: Partial<Funcionario> = {}) =>
    ds.criar("funcionarios", { ...base, id, nome: `Apelido ${id}`, nome_completo: `Nome Completo ${id}`, matricula: `M-${id}`, empresa: "EMPRESA A", data_admissao: "2024-01-15", cargo: "ASG", observacoes: "interno", desligado_em: "", ...x });
  await ficha("f1");
  await ficha("f-outra", { sede_id: "christus_sul" });
  await ds.criar("modelos_rotina", { id: "item-f1", nome_modelo: "Rota", sede_id: "christus_dt", funcionario_id: "f1", tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", padrao: true, criado_por: "", criado_em: "" } as never);
  await ds.criar("rotinas_planejadas", { id: "b-f1", data: HOJE, funcionario_id: "f1", sede_id: "christus_dt", tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", fim_planejado: "07:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "", criado_em: "", atualizado_em: "" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("mudar de função", () => {
  it("a ficha muda, a agenda e a rota ficam, e o Quadro recebe a saída de ASG sem a função nova", async () => {
    const r = await mudar({ funcao: "  Ascensorista " });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ blocosRemovidos: 0, funcao: "Ascensorista", avisouQuadro: true });
    const f = await obter();
    expect(f).toMatchObject({ cargo: "Ascensorista", sede_id: "christus_dt", ativo: true, desligado_em: "", deixou_asg_em: HOJE, atualizado_por: "coord@x.com" });
    expect(f.observacoes).toBe("interno · Função mudou de ASG para Ascensorista em 24/11/2026.");
    const ds = await getDataSource();
    expect((await ds.obter("modelos_rotina", "item-f1"))?.funcionario_id).toBe("f1");
    expect((await ds.obter("rotinas_planejadas", "b-f1"))?.funcionario_id).toBe("f1");
    expect(await eventos()).toMatchObject([{ id: "transf_f1", tipo: "transferencia", funcao: "ASG", sedeDe: "DT", sedePara: "setor", matricula: "M-f1", dataEfetiva: HOJE, autor: "coord@x.com" }]);
    const texto = await (await feed(new Request(`http://x/api/chromos/eventos-quadro?desde=${HOJE}`, { headers: { authorization: `Bearer ${KC}` } }))).text();
    expect(texto).toContain("transf_f1"); // o RH recebe
    expect(texto).not.toMatch(/Ascensorista|interno/); // texto livre não sai
  });

  it("entre funções que não são ASG: muda sem evento, e não mexe no dia em que deixou de ser ASG", async () => {
    await mudar({ funcao: "Ascensorista", data: "2026-11-20" });
    expect(await (await mudar({ funcao: "Porteiro" })).json()).toMatchObject({ avisouQuadro: false });
    expect(await obter()).toMatchObject({ cargo: "Porteiro", deixou_asg_em: "2026-11-20" });
    expect(await eventos()).toHaveLength(1);
  });

  it("depois: transferir e desligar não geram evento, e o dia da saída vai junto na ficha nova", async () => {
    await mudar({ funcao: "Ascensorista" });
    const { novo } = await (await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f1"))).json();
    expect(novo).toMatchObject({ cargo: "Ascensorista", deixou_asg_em: HOJE, sede_id: "christus_ald" });
    expect(await desligar(corpo({ tipo: "saiu_da_empresa", data: HOJE, motivo: "Outros", abrirVaga: false }), ctx(novo.id))).toHaveProperty("status", 200);
    expect((await eventos()).map((e) => e.id)).toEqual(["transf_f1"]);
  });

  it("transferir primeiro e mudar a função depois: os dois eventos saem", async () => {
    const { novo } = await (await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f1"))).json();
    expect((await mudar({ funcao: "Ascensorista" }, novo.id)).status).toBe(200);
    expect((await eventos()).map((e) => [e.id, e.sedeDe, e.sedePara]).sort()).toEqual(
      [["transf_f1", "DT", "ALD"], [`transf_${novo.id}`, "ALD", "setor"]].sort(),
    );
  });
});

describe("mudar de função: recusas, e nada gravado", () => {
  const nadaMudou = async () => {
    expect(await obter()).toMatchObject({ cargo: "ASG", observacoes: "interno" });
    expect(await eventos()).toEqual([]);
  };

  it("função vazia, longa, invisível, fórmula, ou que continua ASG", async () => {
    for (const funcao of ["", "   ", null, 5, ["x"], "a".repeat(61), "=HYPERLINK(1)", "+x", "@x", "-x", "123", "Por​teiro", "Por\u0007teiro", "АSG", "ＡＳＧ", "A⠀SG", "Porteiro\tNoite"])
      expect([funcao, await codigo(await mudar({ funcao }))]).toEqual([funcao, "FUNCAO_INVALIDA"]);
    for (const funcao of ["ASG", "asg", "A.S.G.", "A S G", "ASG 1", "ASG Líder", "Auxiliar de Serviços Gerais", "Auxiliar Serviços Gerais", "Aux. de Serv. Gerais", "Serviços Gerais", "Agente de Serviços Gerais", "Aux. S. Gerais", "Aux. Serv. Ger.", "Asgs"])
      expect([funcao, await codigo(await mudar({ funcao }))]).toEqual([funcao, "FUNCAO_ASG"]);
    await nadaMudou();
  });

  it("data futura, torta ou ausente; função junto com sede ou setor", async () => {
    for (const data of ["2026-11-25", "2026-13-45", "", null, 20261124, "2024-01-14"])
      expect([data, await codigo(await mudar({ funcao: "Porteiro", data }))]).toEqual([data, "TRANSFERENCIA_DATA"]);
    expect(await codigo(await mudar({ funcao: "Porteiro", sede_id: "christus_ald" }))).toBe("TRANSFERENCIA_DESTINO_DUPLO");
    expect(await codigo(await mudar({ funcao: "Porteiro", setor: "Cantina" }))).toBe("TRANSFERENCIA_DESTINO_DUPLO");
    await nadaMudou();
  });

  it("quem não pode: outra sede, supervisor, visualizador, sem sessão", async () => {
    expect((await mudar({ funcao: "Porteiro" }, "f-outra")).status).toBe(403);
    for (const perfil of ["supervisor", "visualizador"] as const) {
      sessao = { ...COORD, perfil };
      expect((await mudar({ funcao: "Porteiro" })).status).toBe(403);
    }
    sessao = null;
    expect((await mudar({ funcao: "Porteiro" })).status).toBe(401);
    await nadaMudou();
    expect((await obter("f-outra")).cargo).toBe("ASG");
  });

  it("desligado(a) ou em aviso prévio; a mesma função; voltar a ASG", async () => {
    const ds = await getDataSource();
    await ds.atualizar("funcionarios", "f1", { desligado_em: "2026-12-10" });
    expect(await codigo(await mudar({ funcao: "Porteiro" }))).toBe("TRANSFERENCIA_FORA_DO_QUADRO");
    await ds.atualizar("funcionarios", "f1", { desligado_em: "" });
    await mudar({ funcao: "Porteiro" });
    expect(await codigo(await mudar({ funcao: "porteiro" }))).toBe("FUNCAO_MESMA");
    expect(await codigo(await mudar({ funcao: "ASG" }))).toBe("FUNCAO_ASG");
    expect(await codigo(await PUT(corpo({ cargo: "ASG" }, "PUT"), ctx("f1")))).toBe("CARGO_SO_PELO_TRANSFERIR");
    expect((await obter()).cargo).toBe("Porteiro");
  });

  it("falha no lote: nem a função muda nem o evento sai; evento repetido: 409 sem detalhe do banco, e o de antes fica como está", async () => {
    const original = MemoryDataSource.prototype.criar;
    const espiao = vi.spyOn(MemoryDataSource.prototype, "criar").mockImplementation((async function (this: MemoryDataSource, tabela: never, registro: never) {
      if (tabela === "eventos_quadro") throw new Error("falha simulada no lote");
      return original.call(this, tabela, registro);
    }) as never);
    expect((await mudar({ funcao: "Porteiro" })).status).not.toBe(200);
    espiao.mockRestore();
    await nadaMudou();
    const ds = await getDataSource();
    await ds.criar("eventos_quadro", { id: "transf_f1", tipo: "transferencia", autor: "antes" } as never);
    const r = await mudar({ funcao: "Porteiro" });
    expect(r.status).toBe(409);
    expect(await r.text()).not.toMatch(/eventos_quadro|transf_/);
    expect(await obter()).toMatchObject({ cargo: "ASG" });
    expect((await ds.obter("eventos_quadro", "transf_f1"))?.autor).toBe("antes");
  });

  it("corrida com a edição: quem salvou o horário com a tela velha não devolve a pessoa a ASG", async () => {
    const ds = await getDataSource();
    // O PUT já leu a ficha (ASG) e vai gravar; a mudança de função entra no meio.
    const gravar = MemoryDataSource.prototype.atualizar;
    let entrou = false;
    vi.spyOn(MemoryDataSource.prototype, "atualizar").mockImplementation((async function (this: MemoryDataSource, t: never, id: string, m: never) {
      if (t === "funcionarios" && !entrou) {
        entrou = true;
        expect((await mudar({ funcao: "Porteiro" })).status).toBe(200);
      }
      return gravar.call(this, t, id, m);
    }) as never);
    expect((await PUT(corpo({ cargo: "ASG", entrada: "06:30" }, "PUT"), ctx("f1"))).status).toBe(200);
    expect(await ds.obter("funcionarios", "f1")).toMatchObject({ cargo: "Porteiro", entrada: "06:30", deixou_asg_em: HOJE });
    // E a tela velha salva depois: recusa clara, nada gravado.
    expect(await codigo(await PUT(corpo({ cargo: "ASG", entrada: "05:00" }, "PUT"), ctx("f1")))).toBe("CARGO_SO_PELO_TRANSFERIR");
    expect(await obter()).toMatchObject({ cargo: "Porteiro", entrada: "06:30" });
  });

  it("a edição nunca grava o cargo, nem torto", async () => {
    for (const cargo of ["=HYPERLINK(1)", ["Porteiro"], "Porteiro", null])
      expect([cargo, await codigo(await PUT(corpo({ cargo }, "PUT"), ctx("f1")))]).toEqual([cargo, "CARGO_SO_PELO_TRANSFERIR"]);
    expect(await codigo(await PUT(corpo({ cargo: "A.S.G." }, "PUT"), ctx("f1")))).toBe(200);
    expect((await obter()).cargo).toBe("ASG");
  });

  it("o supervisor não recebe `deixou_asg_em`", async () => {
    await mudar({ funcao: "Porteiro" });
    const { GET } = await import("@/app/api/funcionarios/route");
    sessao = { ...COORD, perfil: "supervisor" };
    const lista = (await (await GET(new Request("http://x/api/funcionarios?sede=christus_dt"))).json()) as Funcionario[];
    expect(lista.find((f) => f.id === "f1")).toMatchObject({ cargo: "Porteiro", deixou_asg_em: "" });
  });

  it("`deixou_asg_em` não vem do corpo, e a ficha que deixou ASG não se exclui (nem depois de o evento expirar)", async () => {
    expect(await codigo(await PUT(corpo({ deixou_asg_em: "" }, "PUT"), ctx("f1")))).toBe("CAMPO_NAO_EDITAVEL");
    const novo = { nome: "Joana", nome_completo: "Joana Ficticia", matricula: "5001", empresa: "EMPRESA A", data_admissao: "2025-03-10", sede_id: "christus_dt", turno: "integral", entrada: "07:00", saida: "16:00", cargo: "ASG", deixou_asg_em: HOJE };
    expect(await codigo(await cadastrar(corpo(novo)))).toBe("CAMPO_NAO_EDITAVEL");
    await mudar({ funcao: "Porteiro" });
    const ds = await getDataSource();
    for (const [t, i] of [["rotinas_planejadas", "b-f1"], ["modelos_rotina", "item-f1"]] as const) await ds.excluir(t, i);
    await ds.excluir("eventos_quadro", "transf_f1").catch(() => {});
    expect(await codigo(await DELETE(corpo({}, "DELETE"), ctx("f1")))).toBe("FICHA_JA_NO_QUADRO");
  });
});
