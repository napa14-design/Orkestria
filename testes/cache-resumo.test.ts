/**
 * Cache do resumo do Chromos no banco (22/10/2026). Cada geração relê o mês
 * inteiro de todas as sedes (~9,5 mil leituras em outubro); o cache em memória
 * não passa de uma instância da Vercel para outra, e trocar o período no painel
 * gerou picos de 40 mil leituras numa hora. No banco, a releitura custa uma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { resumoExecutivo } from "@/services/resumoExecutivoService";

const MIN = 60 * 1000;
/** Meio de março de 2099 em Fortaleza: março é o mês aberto; janeiro, fechado. */
const T0 = new Date("2099-03-15T12:00:00-03:00");
const depois = (ms: number) => new Date(T0.getTime() + ms);

describe("resumo do Chromos com cache no banco", () => {
  beforeEach(() => reiniciarBanco());
  afterEach(() => vi.restoreAllMocks());

  it("a primeira geração lê o período e guarda; depois de vencer a memória, a releitura vem do banco", async () => {
    const ds = await getDataSource();
    const consultar = vi.spyOn(ds, "consultar");
    const primeiro = await resumoExecutivo("2099-03", "2099-03", T0);
    expect(consultar).toHaveBeenCalled();
    const guardado = await ds.obter("cache_resumo", "2099-03_2099-03");
    expect(guardado?.expira_em).toBe(depois(30 * MIN).toISOString());

    consultar.mockClear();
    // 6 min: o cache em memória (5 min) já venceu — é a "outra instância".
    const segundo = await resumoExecutivo("2099-03", "2099-03", depois(6 * MIN));
    expect(consultar).not.toHaveBeenCalled();
    expect(segundo).toEqual(primeiro);
  });

  it("mês aberto vence em 30 min; período fechado, em um dia", async () => {
    const ds = await getDataSource();
    await resumoExecutivo("2099-03", "2099-03", T0);
    await resumoExecutivo("2099-01", "2099-01", T0);
    const consultar = vi.spyOn(ds, "consultar");
    await resumoExecutivo("2099-01", "2099-01", depois(20 * 60 * MIN)); // 20 h: fechado ainda vale
    expect(consultar).not.toHaveBeenCalled();
    await resumoExecutivo("2099-03", "2099-03", depois(31 * MIN)); // aberto venceu
    expect(consultar).toHaveBeenCalled();
    consultar.mockClear();
    await resumoExecutivo("2099-01", "2099-01", depois(25 * 60 * MIN)); // fechado venceu
    expect(consultar).toHaveBeenCalled();
  });

  it("o cache não entra no histórico de alterações (é dado derivado)", async () => {
    const ds = await getDataSource();
    await resumoExecutivo("2099-03", "2099-03", T0);
    expect((await ds.listar("historico")).filter((h) => h.tabela === "cache_resumo")).toEqual([]);
  });

  it("cache ilegível ou banco instável não derrubam o resumo: recalcula", async () => {
    const ds = await getDataSource();
    await ds.criar("cache_resumo", { id: "2099-03_2099-03", corpo: "{quebrado", expira_em: depois(60 * MIN).toISOString(), criado_em: T0.toISOString() });
    const r1 = await resumoExecutivo("2099-03", "2099-03", T0);
    expect(r1).toMatchObject({ de: "2099-03", ate: "2099-03" });
    const original = ds.obter.bind(ds);
    vi.spyOn(ds, "obter").mockImplementation((async (tabela: string, id: string) => {
      if (tabela === "cache_resumo") throw new Error("banco instável");
      return original(tabela as never, id);
    }) as never);
    const r2 = await resumoExecutivo("2099-02", "2099-02", T0);
    expect(r2).toMatchObject({ de: "2099-02", ate: "2099-02" });
  });
});
