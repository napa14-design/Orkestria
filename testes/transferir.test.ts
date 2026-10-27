/**
 * Transferir de sede (27/10/2026): botão próprio, porque "fica muito ruim no
 * desligar". Encerra a ficha de origem (motivo "Transferência", rota guardada
 * como posto vago, vaga no SGCP só se pedida) e cria a ficha no destino com o
 * mesmo horário e matrícula. Pelas rotas: sessão simulada, banco de memória.
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

const { POST: transferir } = await import("@/app/api/funcionarios/[id]/transferir/route");
const { PUT } = await import("@/app/api/funcionarios/[id]/route");
const { POST: criar } = await import("@/app/api/funcionarios/route");

const COORD_DUAS: SessaoUsuario = {
  id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt", "christus_ald"],
};
const corpo = (c: unknown, metodo = "POST") =>
  new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const HOJE = "2026-10-27";

describe("transferir de sede", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    reiniciarBanco();
    sessao = COORD_DUAS;
    const ds = await getDataSource();
    const base = await ds.obter("funcionarios", "christus_f1");
    await ds.criar("funcionarios", {
      ...base!, id: "f-vai", nome: "Pessoa Que Vai", matricula: "321", empresa: "EMPRESA A", desligado_em: "",
      entrada_sabado: "07:00", saida_sabado: "11:15", intervalos_sabado: "09:00-09:15", escala: "seg_sab",
    });
    await ds.criar("modelos_rotina", {
      id: "rota-f-vai-1", nome_modelo: "Rota padrão", sede_id: "christus_dt", funcionario_id: "f-vai", tarefa_id: "christus_t2",
      local_id: "christus_l1", inicio_planejado: "07:00", duracao_min: 30, padrao: true, criado_em: "", atualizado_em: "",
    } as never);
  });

  it("encerra a ficha daqui como transferência e cria a ficha lá, com o mesmo horário, matrícula e empresa", async () => {
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"));
    expect(r.status).toBe(200);
    const { novo, vaga } = await r.json();
    expect(vaga.aberta).toBe(false); // desmarcada por padrão
    const ds = await getDataSource();
    const origem = await ds.obter("funcionarios", "f-vai");
    expect(origem).toMatchObject({ desligado_em: HOJE, motivo_desligamento: "Transferência", transferido_para: "christus_ald", ativo: false });
    expect(origem?.vaga_sgcp ?? "").toBe("");
    expect(origem?.posto_extinto ?? false).toBe(false);
    // A rota fica na origem como posto vago.
    expect((await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: "f-vai" }])).length).toBe(1);
    const lá = await ds.obter("funcionarios", novo.id);
    expect(lá).toMatchObject({
      nome: "Pessoa Que Vai", sede_id: "christus_ald", matricula: "321", empresa: "EMPRESA A", transferido_de: "f-vai", ativo: true,
      entrada: origem?.entrada, saida: origem?.saida, escala: "seg_sab", entrada_sabado: "07:00", intervalos_sabado: "09:00-09:15",
    });
    expect(lá?.observacoes).toContain("Transferida de");
  });

  it("quem não opera a sede de destino não transfere — e nada muda", async () => {
    sessao = { ...COORD_DUAS, sedes: ["christus_dt"] };
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"));
    expect(r.status).toBe(403);
    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
    expect((await ds.listar("funcionarios")).filter((f) => f.transferido_de === "f-vai")).toEqual([]);
  });

  it("supervisor e visualizador não transferem", async () => {
    for (const perfil of ["supervisor", "visualizador"]) {
      sessao = { ...COORD_DUAS, perfil: perfil as SessaoUsuario["perfil"] };
      expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"))).status).toBe(403);
    }
  });

  it("sem destino, para a mesma sede, data inválida ou pessoa já desligada: recusa", async () => {
    expect((await transferir(corpo({ sede_id: "christus_dt", data: HOJE }), ctx("f-vai"))).status).toBe(422);
    expect((await transferir(corpo({ sede_id: "christus_ald", data: "27/10/2026" }), ctx("f-vai"))).status).toBe(422);
    expect((await transferir(corpo({ data: HOJE }), ctx("f-vai"))).status).toBe(403);
    const ds = await getDataSource();
    await ds.atualizar("funcionarios", "f-vai", { desligado_em: "2026-10-20", ativo: false });
    expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"))).status).toBe(422);
  });

  it("se a ficha nova seria recusada (matrícula já ativa no destino), a origem NÃO é desligada", async () => {
    const ds = await getDataSource();
    const base = await ds.obter("funcionarios", "christus_f1");
    await ds.criar("funcionarios", { ...base!, id: "f-ja-la", nome: "Outra", sede_id: "christus_ald", matricula: "321", empresa: "EMPRESA A", desligado_em: "" });
    expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"))).status).toBe(422);
    expect((await ds.obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
  });

  it("matrícula ativa em ficha de OUTRA empresa: recusa antes de desligar a origem (revisão de segurança)", async () => {
    const ds = await getDataSource();
    const base = await ds.obter("funcionarios", "christus_f1");
    await ds.criar("funcionarios", { ...base!, id: "f-outra-empresa", nome: "Outra", sede_id: "christus_dt", matricula: "321", empresa: "EMPRESA B", desligado_em: "" });
    expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE, abrirVaga: true }), ctx("f-vai"))).status).toBe(422);
    const origem = await ds.obter("funcionarios", "f-vai");
    expect(origem?.desligado_em).toBe("");
    expect(origem?.transferido_para ?? "").toBe("");
    expect(origem?.vaga_sgcp ?? "").toBe("");
  });

  it("a vaga no SGCP só é tentada quando pedida", async () => {
    vi.stubEnv("SGCP_VAGAS_URL", "");
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE, abrirVaga: true }), ctx("f-vai"));
    const { vaga } = await r.json();
    expect(vaga.motivo).toContain("não está configurada"); // pedida: foi tentar (e sem SGCP configurado, avisa)
    vi.unstubAllEnvs();
  });

  it("os campos da transferência não entram pelo cadastro nem pela edição comuns", async () => {
    expect((await PUT(corpo({ transferido_para: "christus_ald" }, "PUT"), ctx("f-vai"))).status).toBe(422);
    expect((await criar(corpo({ nome: "X Y", sede_id: "christus_dt", transferido_de: "f-vai" }))).status).toBe(422);
  });
});
