/**
 * "Assume o posto de" pela EDIÇÃO (27/10/2026): a coordenação cadastrou uma
 * pessoa num dia e só no outro soube que ela fica com a rota de quem saiu
 * (posto vago). O campo existia só no cadastro novo. Pelas rotas:
 * sessão simulada, banco de memória. Pessoas fictícias — o repo é público.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { PUT } = await import("@/app/api/funcionarios/[id]/route");

const SEDE = "christus_dt";
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };
const put = (id: string, corpo: unknown) =>
  PUT(new Request("http://x/api", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }), {
    params: Promise.resolve({ id }),
  });

async function pessoa(id: string, nome: string, extra: Record<string, unknown> = {}) {
  const ds = await getDataSource();
  const base = await ds.obter("funcionarios", "christus_f1");
  await ds.criar("funcionarios", { ...base!, id, nome, matricula: "", desligado_em: "", observacoes: "", ...extra });
}
async function item(id: string, funcionario_id: string, inicio: string) {
  const ds = await getDataSource();
  await ds.criar("modelos_rotina", {
    id: `rota-${funcionario_id}-${id}`, nome_modelo: "Rota padrão", sede_id: SEDE, funcionario_id, tarefa_id: "christus_t2",
    local_id: "christus_l1", inicio_planejado: inicio, duracao_min: 30, padrao: true, criado_em: "", atualizado_em: "",
  } as never);
}
const rotaDe = async (id: string) =>
  (await (await getDataSource()).consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }])).filter((m) => m.padrao);

describe("Assume o posto de, pela edição", () => {
  // Relógio fixo: a edição recusa data no passado, e as datas daqui (28/10 como
  // "amanhã") virariam passado com o tempo, quebrando o teste sozinho.
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    reiniciarBanco();
    sessao = COORD;
    // A que saiu: desligada, posto vago com rota. A nova: cadastrada, sem rota.
    await pessoa("f-saiu", "Pessoa Que Saiu", { ativo: false, desligado_em: "2026-10-27", motivo_desligamento: "Outros" });
    await item("a", "f-saiu", "07:00");
    await item("b", "f-saiu", "08:00");
    await pessoa("f-nova", "Pessoa Nova");
  });

  it("quem ainda não tem rota assume o posto vago: a rota passa e o posto sai da lista de vagos", async () => {
    const r = await put("f-nova", { nome: "Pessoa Nova", substitui: "f-saiu", substitui_desde: "2026-10-28" });
    expect(r.status).toBe(200);
    expect((await r.json()).substituicao).toMatchObject({ itensDeRota: 2 });
    expect((await rotaDe("f-nova")).map((m) => m.inicio_planejado).sort()).toEqual(["07:00", "08:00"]);
    expect(await rotaDe("f-saiu")).toEqual([]);
    expect((await (await getDataSource()).obter("funcionarios", "f-saiu"))?.substituido_por).toBe("f-nova");
  });

  it("quem já tem rota tem a rota TROCADA pela do posto; o realizado e o passado ficam (decisão do dono)", async () => {
    await item("x", "f-nova", "13:00");
    const ds = await getDataSource();
    const bloco = (id: string, data: string, status: string) =>
      ds.criar("rotinas_planejadas", {
        id, data, funcionario_id: "f-nova", sede_id: SEDE, tarefa_id: "christus_t2", local_id: "christus_l1",
        inicio_planejado: "13:00", fim_planejado: "13:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1,
        status, observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "",
      } as never);
    await bloco("b-passado", "2026-10-26", "planejada");
    await bloco("b-futuro", "2026-10-29", "planejada");
    await bloco("b-feito", "2026-10-29", "realizada");
    const r = await put("f-nova", { nome: "Pessoa Nova", substitui: "f-saiu", substitui_desde: "2026-10-28" });
    expect(r.status).toBe(200);
    expect((await r.json()).substituicao).toMatchObject({ itensTrocados: 1, blocosTrocados: 1, itensDeRota: 2 });
    expect((await rotaDe("f-nova")).map((m) => m.inicio_planejado).sort()).toEqual(["07:00", "08:00"]);
    expect(await ds.obter("rotinas_planejadas", "b-futuro")).toBeNull();
    expect(await ds.obter("rotinas_planejadas", "b-passado")).not.toBeNull();
    expect(await ds.obter("rotinas_planejadas", "b-feito")).not.toBeNull();
  });

  it("se a passagem é recusada, a rota que a pessoa já tinha fica intacta (as travas vêm antes de apagar)", async () => {
    await item("x", "f-nova", "13:00");
    // Data fora do formato (do jeito que se escreve na mão): recusa.
    expect((await put("f-nova", { substitui: "f-saiu", substitui_desde: "28/10/2026" })).status).toBe(422);
    expect((await rotaDe("f-nova")).map((m) => m.inicio_planejado)).toEqual(["13:00"]);
    // Posto já assumido: recusa.
    await (await getDataSource()).atualizar("funcionarios", "f-saiu", { substituido_por: "alguem" });
    expect((await put("f-nova", { substitui: "f-saiu" })).status).toBe(422);
    expect((await rotaDe("f-nova")).map((m) => m.inicio_planejado)).toEqual(["13:00"]);
  });

  it("posto de outra sede, o próprio posto ou posto já assumido: recusado", async () => {
    await pessoa("f-outra", "De Outra Sede", { sede_id: "christus_ald", ativo: false, desligado_em: "2026-10-27" });
    expect((await put("f-nova", { substitui: "f-outra" })).status).toBe(422);
    expect((await put("f-nova", { substitui: "f-nova" })).status).toBe(422);
    await (await getDataSource()).atualizar("funcionarios", "f-saiu", { substituido_por: "alguem" });
    expect((await put("f-nova", { substitui: "f-saiu" })).status).toBe(422);
    expect(await rotaDe("f-nova")).toEqual([]);
  });

  it("quem está desligado, inativo ou já substituído não assume posto — e a colega não é inativada (revisão)", async () => {
    await pessoa("f-colega", "Colega Ativa"); // ativa, na mesma sede
    await item("c", "f-colega", "10:00");
    await pessoa("f-deslig", "Desligada", { ativo: false, desligado_em: "2026-10-20", motivo_desligamento: "Outros" });
    await pessoa("f-subst", "Ja Substituida", { substituido_por: "f-outra" });
    await pessoa("f-extinto", "Posto Extinto", { posto_extinto: true });
    for (const quem of ["f-deslig", "f-subst", "f-extinto"])
      expect((await put(quem, { substitui: "f-colega" })).status).toBe(422);
    const ds = await getDataSource();
    const colega = await ds.obter("funcionarios", "f-colega");
    expect([colega?.ativo, colega?.substituido_por ?? ""]).toEqual([true, ""]);
    expect((await rotaDe("f-colega")).map((m) => m.inicio_planejado)).toEqual(["10:00"]);
  });

  it("na edição, data no passado ou que não é dia é recusada e nada é apagado (revisão)", async () => {
    {
      await item("x", "f-nova", "13:00");
      for (const data of ["2026-10-26", "0000-00-00", "2026-13-45"])
        expect((await put("f-nova", { substitui: "f-saiu", substitui_desde: data })).status).toBe(422);
      expect((await rotaDe("f-nova")).map((m) => m.inicio_planejado)).toEqual(["13:00"]);
      expect(await rotaDe("f-saiu")).toHaveLength(2);
      // Hoje vale.
      expect((await put("f-nova", { substitui: "f-saiu", substitui_desde: "2026-10-27" })).status).toBe(200);
    }
  });

  it("supervisor não faz; e editar sem substituição não grava 'substitui' nem troca o id", async () => {
    sessao = { ...COORD, perfil: "supervisor" };
    expect((await put("f-nova", { substitui: "f-saiu" })).status).toBe(403);
    sessao = COORD;
    expect((await put("f-nova", { nome: "Pessoa Nova", substitui: "", substitui_desde: "", id: "outro-id" })).status).toBe(200);
    const salvo = await (await getDataSource()).obter("funcionarios", "f-nova");
    expect(salvo).not.toHaveProperty("substitui");
    expect(salvo).not.toHaveProperty("substitui_desde");
    expect(salvo?.id).toBe("f-nova");
  });
});
