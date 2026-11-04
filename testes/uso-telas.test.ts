/**
 * Coleta temporária de uso das telas (04/11/2026): por dia, perfil e sede, sem
 * pessoa. Casos da revisão de segurança, feita antes do código: forjar, sair do
 * escopo, passar da data, entrar no histórico. Pelas rotas, com banco de memória.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { SessaoUsuario } from "@/lib/permissions";
import { coletaAtiva, USO_APAGAR_ATE, USO_FIM, USO_INICIO } from "@/lib/usoTelas";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { POST } = await import("@/app/api/uso-telas/route");
const { GET: getFicha } = await import("@/app/api/fichas/pdf/route");

const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
const GERAL: SessaoUsuario = { ...COORD, sede_id: "geral", sedes: [] };
const SUP: SessaoUsuario = { ...COORD, id: "s1", perfil: "supervisor" };
const enviar = (corpo: unknown) =>
  POST(new Request("http://x/api/uso-telas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }));
const docs = async () => (await getDataSource()).listar("uso_telas");
const ok = { tela: "dia", sede_id: "christus_dt" };

describe("coleta de uso das telas", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T13:00:00Z"));
    reiniciarBanco();
    sessao = COORD;
  });

  it("grava dia, perfil, sede e tela, e nada que identifique a pessoa", async () => {
    expect((await enviar(ok)).status).toBe(204);
    expect(await docs()).toEqual([
      { id: "2026-11-10__coordenador__christus_dt__dia", dia: "2026-11-10", perfil: "coordenador", sede_id: "christus_dt", tela: "dia" },
    ]);
  });

  it("corpo não forja perfil, dia, usuário nem id", async () => {
    await enviar({ ...ok, perfil: "administrador", dia: "2020-01-01", usuario_id: "adm", id: "x", criado_em: "y" });
    const [d] = await docs();
    expect(d).toEqual({ id: "2026-11-10__coordenador__christus_dt__dia", dia: "2026-11-10", perfil: "coordenador", sede_id: "christus_dt", tela: "dia" });
  });

  it("sem sessão: 401 e nada gravado", async () => {
    sessao = null;
    expect((await enviar(ok)).status).toBe(401);
    expect(await docs()).toEqual([]);
  });

  it("tela fora da lista é recusada, inclusive a ficha, que só o servidor registra", async () => {
    for (const tela of ["usuarios", "", null, 1, ["dia"], "DIA", "dia ", "__proto__", "constructor", "x".repeat(10000), "ficha_pdf"])
      expect((await enviar({ tela, sede_id: "christus_dt" })).status).toBe(422);
    expect(await docs()).toEqual([]);
  });

  it("sede com nome reservado do Firestore nem chega ao banco", async () => {
    sessao = GERAL;
    const ds = await getDataSource();
    const obter = vi.spyOn(ds, "obter");
    await enviar({ tela: "dia", sede_id: "__x__" });
    expect(obter).not.toHaveBeenCalled();
    obter.mockRestore();
  });

  it("com o banco fora, a tela recebe 204: quem abriu não tem o que fazer com o erro", async () => {
    const ds = await getDataSource();
    const obter = vi.spyOn(ds, "obter").mockRejectedValue(new Error("banco fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await enviar(ok)).status).toBe(204);
    obter.mockRestore();
    erro.mockRestore();
  });

  it("corpo que não é JSON não vira erro 500", async () => {
    const r = await POST(new Request("http://x/api/uso-telas", { method: "POST", body: "{quebrado" }));
    expect(r.status).toBe(422);
  });

  it("sede fora do escopo, inexistente ou malformada: nada gravado, sem cair na sede principal", async () => {
    for (const sede_id of ["christus_ald", "geral", "", null, ["christus_dt"], "christus_dt/x", "../usuarios/x", "x".repeat(2000)])
      expect((await enviar({ tela: "dia", sede_id })).status).toBe(204);
    expect(await docs()).toEqual([]);
    sessao = GERAL;
    for (const sede_id of ["nao-existe", "geral", "__x__"]) await enviar({ tela: "dia", sede_id });
    expect(await docs()).toEqual([]);
  });

  it("coordenador 'geral' registra na sede pedida, se ela existir", async () => {
    sessao = GERAL;
    await enviar({ tela: "semana", sede_id: "christus_ald" });
    expect((await docs()).map((d) => d.sede_id)).toEqual(["christus_ald"]);
  });

  it("supervisor registra as telas dele, mas não a Central, que só o redireciona", async () => {
    sessao = SUP;
    await enviar({ tela: "central", sede_id: "christus_dt" });
    expect(await docs()).toEqual([]);
    await enviar({ tela: "acompanhamento", sede_id: "christus_dt" });
    expect((await docs()).map((d) => [d.perfil, d.tela])).toEqual([["supervisor", "acompanhamento"]]);
  });

  it("administrador e gerência não entram: seriam ruído", async () => {
    for (const perfil of ["administrador", "visualizador"] as const) {
      sessao = { ...GERAL, perfil };
      expect((await enviar({ tela: "dia", sede_id: "christus_dt" })).status).toBe(204);
    }
    expect(await docs()).toEqual([]);
  });

  it("repetir não grava de novo: gravar seria uma escrita paga a cada abertura", async () => {
    const ds = await getDataSource();
    const criar = vi.spyOn(ds, "criar");
    for (let i = 0; i < 5; i++) await enviar(ok);
    expect(criar.mock.calls.filter(([t]) => t === "uso_telas")).toHaveLength(1);
    criar.mockRestore();
    expect(await docs()).toHaveLength(1);
  });

  it("sedes com _ e telas diferentes não colidem", async () => {
    sessao = GERAL;
    await enviar({ tela: "dia", sede_id: "christus_dt" });
    await enviar({ tela: "semana", sede_id: "christus_dt" });
    await enviar({ tela: "dia", sede_id: "christus_ald" });
    expect(await docs()).toHaveLength(3);
  });

  it("não entra no histórico: lá sobreviveria ao apagamento", async () => {
    await enviar(ok);
    const hist = await (await getDataSource()).listar("historico");
    expect(hist.filter((h) => h.tabela === "uso_telas")).toEqual([]);
  });

  describe("o prazo", () => {
    it("o último dia ainda grava, no fuso de Fortaleza; o seguinte não", async () => {
      vi.setSystemTime(new Date("2026-11-19T02:59:00Z")); // 23:59 de 18/11 em Fortaleza
      await enviar(ok);
      expect((await docs()).map((d) => d.dia)).toEqual(["2026-11-18"]);
      vi.setSystemTime(new Date("2026-11-19T03:00:00Z")); // 00:00 de 19/11
      await enviar({ tela: "semana", sede_id: "christus_dt" });
      expect(await docs()).toHaveLength(1);
    });

    it("antes do início não grava, e depois do fim nem lê o banco", async () => {
      vi.setSystemTime(new Date("2026-11-04T13:00:00Z"));
      await enviar(ok);
      expect(await docs()).toEqual([]);
      vi.setSystemTime(new Date("2026-11-20T13:00:00Z"));
      const ds = await getDataSource();
      const obter = vi.spyOn(ds, "obter");
      expect((await enviar(ok)).status).toBe(204);
      expect(obter).not.toHaveBeenCalled();
      obter.mockRestore();
    });

    it("a coleta dura no máximo 14 dias e o apagamento vem até 30 dias depois", () => {
      const dias = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
      expect(dias(USO_INICIO, USO_FIM)).toBeLessThanOrEqual(14);
      expect(dias(USO_FIM, USO_APAGAR_ATE)).toBeLessThanOrEqual(30);
    });

    it("data inválida desliga", () => {
      expect(coletaAtiva("")).toBe(false);
      expect(coletaAtiva("9999-99-99")).toBe(false);
    });
  });

  describe("a ficha em PDF", () => {
    const ficha = (q: string) => getFicha(new Request(`http://x/api/fichas/pdf?${q}`));

    it("registra depois de gerar, na sede efetiva", async () => {
      const r = await ficha("data=2026-11-10&sede=christus_dt");
      expect(r.status).toBe(200);
      expect((await docs()).map((d) => [d.sede_id, d.tela])).toEqual([["christus_dt", "ficha_pdf"]]);
    });

    it("pedido inválido e supervisor, que não imprime: nada registrado", async () => {
      expect((await ficha("data=2026-11-10")).status).toBe(400);
      sessao = SUP;
      expect((await ficha("data=2026-11-10&sede=christus_dt")).status).toBe(403);
      expect(await docs()).toEqual([]);
    });

    it("se a anotação falhar, a ficha sai do mesmo jeito", async () => {
      const ds = await getDataSource();
      const criar = vi.spyOn(ds, "criar").mockRejectedValue(new Error("banco fora"));
      const erro = vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await ficha("data=2026-11-10&sede=christus_dt")).status).toBe(200);
      criar.mockRestore();
      erro.mockRestore();
    });
  });
});
