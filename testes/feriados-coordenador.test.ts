/**
 * Feriados pelo coordenador (decisão do dono, 27/10/2026): o "Dia do Servidor
 * Público" estava cadastrado para todas as sedes e fechou a agenda de uma sede
 * que trabalhava — o coordenador não tinha como abrir. Agora administrador e
 * coordenador cuidam de qualquer feriado, inclusive o de todas as sedes; quem
 * mudou fica no histórico. Pelas rotas: sessão simulada, banco de memória.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { POST } = await import("@/app/api/feriados/route");
const { PUT, DELETE } = await import("@/app/api/feriados/[id]/route");

const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
const json = (corpo: unknown, metodo = "POST") =>
  new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const FERIADO = { nome: "Dia do Servidor Público", sede_id: "", data_inicio: "2026-10-28", data_fim: "2026-10-28", ativo: true };

describe("feriados pelo coordenador", () => {
  beforeEach(() => {
    reiniciarBanco();
    sessao = COORD;
  });

  it("coordenador cria, edita e apaga feriado de TODAS as sedes; o histórico guarda quem foi", async () => {
    const r = await POST(json(FERIADO));
    expect(r.status).toBe(201);
    const { id } = await r.json();
    expect((await PUT(json({ nome: "Servidor Público (só quem fecha)" }, "PUT"), ctx(id))).status).toBe(200);
    expect((await DELETE(json({}, "DELETE"), ctx(id))).status).toBe(200);
    const ds = await getDataSource();
    expect(await ds.obter("feriados", id)).toBeNull();
    const hist = (await ds.listar("historico")).filter((h) => h.tabela === "feriados" && h.registro_id === id);
    expect(hist.map((h) => [h.acao, h.usuario])).toEqual([
      ["criar", "coord@x.com"],
      ["atualizar", "coord@x.com"],
      ["excluir", "coord@x.com"],
    ]);
  });

  it("supervisor, visualizador e perfil desconhecido não criam, não editam e não apagam", async () => {
    const ds = await getDataSource();
    const criado = await ds.criar("feriados", { ...FERIADO, id: "fer1", criado_em: "", atualizado_em: "" } as never);
    for (const perfil of ["supervisor", "visualizador", "gerente"]) {
      sessao = { ...COORD, perfil: perfil as SessaoUsuario["perfil"] };
      expect((await POST(json(FERIADO))).status).toBe(403);
      expect((await PUT(json({ nome: "x" }, "PUT"), ctx(criado.id))).status).toBe(403);
      expect((await DELETE(json({}, "DELETE"), ctx(criado.id))).status).toBe(403);
    }
    sessao = null;
    expect((await POST(json(FERIADO))).status).toBe(401);
    expect((await ds.obter("feriados", "fer1"))?.nome).toBe(FERIADO.nome);
  });

  it("datas e nome: só data real, no máximo 62 dias; nome é texto de até 120 (revisão de segurança)", async () => {
    const recusa = async (extra: Record<string, unknown>) => expect((await POST(json({ ...FERIADO, ...extra }))).status).toBe(422);
    await recusa({ data_inicio: "0000-01-01", data_fim: "9999-12-31" });
    await recusa({ data_inicio: "0", data_fim: "9" });
    await recusa({ data_inicio: "2026-13-45", data_fim: "2026-13-45" });
    await recusa({ data_inicio: 20261028, data_fim: 20261028 });
    await recusa({ data_inicio: "2026-10-28", data_fim: "2027-10-28" }); // o ano errado
    await recusa({ data_inicio: "2026-10-30", data_fim: "2026-10-28" });
    await recusa({ nome: null });
    await recusa({ nome: "x".repeat(121) });
    // O recesso de julho inteiro passa; 62 dias passa; 63 não.
    expect((await POST(json({ ...FERIADO, nome: "Recesso de julho", data_inicio: "2026-07-01", data_fim: "2026-07-31" }))).status).toBe(201);
    expect((await POST(json({ ...FERIADO, data_inicio: "2026-01-01", data_fim: "2026-03-03" }))).status).toBe(201);
    await recusa({ data_inicio: "2026-01-01", data_fim: "2026-03-04" });
    // O PUT passa pela mesma régua.
    const { id } = await (await POST(json(FERIADO))).json();
    expect((await PUT(json({ data_fim: "2027-10-28" }, "PUT"), ctx(id))).status).toBe(422);
    expect((await PUT(json({ data_inicio: "2026-10-30" }, "PUT"), ctx(id))).status).toBe(422);
  });

  it("apagar ou editar um feriado que não existe é recusado, sem 'excluir' fantasma no histórico", async () => {
    expect((await DELETE(json({}, "DELETE"), ctx("nao-existe"))).status).toBe(500);
    expect((await PUT(json({ nome: "x" }, "PUT"), ctx("nao-existe"))).status).toBe(500);
    const hist = (await (await getDataSource()).listar("historico")).filter((h) => h.registro_id === "nao-existe");
    expect(hist).toEqual([]);
  });

  it("o corpo não falsifica autoria nem grava campo estranho; sede inexistente é recusada", async () => {
    const r = await POST(json({ ...FERIADO, criado_por: "admin@x.com", id: "forjado", lixo: "x" }));
    const criado = await r.json();
    expect(criado.id).not.toBe("forjado");
    expect(criado.criado_por).toBe("coord@x.com");
    expect(criado).not.toHaveProperty("lixo");
    await PUT(json({ criado_por: "admin@x.com", atualizado_por: "admin@x.com", lixo: "y" }, "PUT"), ctx(criado.id));
    const depois = await (await getDataSource()).obter("feriados", criado.id);
    expect(depois).toMatchObject({ criado_por: "coord@x.com", atualizado_por: "coord@x.com" });
    expect(depois).not.toHaveProperty("lixo");
    expect((await PUT(json({ sede_id: "nao-existe" }, "PUT"), ctx(criado.id))).status).toBe(500);
    expect((await POST(json({ ...FERIADO, sede_id: "nao-existe" }))).status).toBe(500);
  });
});
