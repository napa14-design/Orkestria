/**
 * Parâmetros de várias sedes numa chamada (22/10/2026). O Panorama pedia uma
 * vez por sede, e cada pedido relia a tabela inteira de parâmetros (~11 leituras
 * × 22 sedes por abertura). Agora: uma leitura, e só as sedes que a sessão alcança.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao }));
const { GET } = await import("@/app/api/parametros/route");

const ADMIN: SessaoUsuario = { id: "a", nome: "Adm", email: "a@x.com", perfil: "administrador", sede_id: "geral", sedes: [] };
const COORD: SessaoUsuario = { id: "c", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
const pedir = async (q: string) => (await GET(new Request(`http://x/api/parametros?${q}`))).json();

describe("GET /api/parametros?resolvidos=1&sedes=", () => {
  beforeEach(async () => {
    reiniciarBanco();
    sessao = ADMIN;
    // Aldeota com meta de ocupação própria; a DT fica com a global (85).
    await (await getDataSource()).criar("parametros", {
      id: "p-ald", chave: "ocupacao_adequada", valor: "90", tipo: "percentual", descricao: "", sede_id: "christus_ald",
      editavel_por_supervisor: true, ativo: true, criado_por: "t", criado_em: "", atualizado_por: "t", atualizado_em: "",
    } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("cada sede com os seus, lendo a tabela UMA vez", async () => {
    const ds = await getDataSource();
    const listar = vi.spyOn(ds, "listar");
    const r = await pedir("resolvidos=1&sedes=christus_dt,christus_ald");
    expect(r.christus_dt.ocupacao_adequada).toBe(85);
    expect(r.christus_ald.ocupacao_adequada).toBe(90);
    expect(listar.mock.calls.filter(([t]) => t === "parametros")).toHaveLength(1);
  });

  it("coordenador só recebe as sedes que alcança; as outras ficam de fora", async () => {
    sessao = COORD;
    const r = await pedir("resolvidos=1&sedes=christus_dt,christus_ald");
    expect(Object.keys(r)).toEqual(["christus_dt"]);
  });

  it("sem sessão: 401", async () => {
    sessao = null;
    expect((await GET(new Request("http://x/api/parametros?resolvidos=1&sedes=christus_dt"))).status).toBe(401);
  });
});
