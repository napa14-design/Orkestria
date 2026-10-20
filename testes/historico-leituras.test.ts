/**
 * Tela de Histórico: pede ao banco só os mais recentes, já ordenados e
 * limitados — lia ~6 mil registros (30 dias) para mostrar 500, e cada um é
 * leitura cobrada no Firestore (levantamento de leituras, 20/10/2026).
 */
import { beforeEach, expect, it, vi } from "vitest";
import { getDataSource, ordenarELimitar } from "@/lib/datasource";
import type { SessaoUsuario } from "@/lib/permissions";
import { reiniciarBanco } from "@/lib/memoryStore";

const ADMIN: SessaoUsuario = { id: "a", nome: "Adm", email: "a@x.com", perfil: "administrador", sede_id: "geral", sedes: [] };
vi.mock("@/lib/session", () => ({ obterSessao: async () => ADMIN }));
const { GET } = await import("@/app/api/historico/route");

beforeEach(() => reiniciarBanco());

it("ordenar em memória deixa de fora quem não tem o campo, como o orderBy do Firestore", () => {
  const r = ordenarELimitar([{ id: "a", t: "2" }, { id: "b" }, { id: "c", t: "9" }] as Record<string, unknown>[], {
    ordenarPor: "t",
    decrescente: true,
  });
  expect(r.map((x) => x.id)).toEqual(["c", "a"]);
});

it("pede ao banco os mais recentes já ordenados e limitados, e devolve esses", async () => {
  const ds = await getDataSource();
  const agora = Date.now();
  for (let i = 0; i < 5; i++) {
    await ds.criar("historico", {
      id: `h${i}`, tabela: "sedes", registro_id: "x", acao: "atualizar", usuario: "a@x.com",
      dados_anteriores: "", dados_novos: "", criado_em: new Date(agora - i * 60_000).toISOString(),
    } as never);
  }
  const espiao = vi.spyOn(ds, "consultar");
  const lista = (await (await GET(new Request("http://x/api/historico?limite=2"))).json()) as { id: string }[];
  expect(lista.map((h) => h.id)).toEqual(["h0", "h1"]);
  const chamada = espiao.mock.calls.find(([t]) => t === "historico");
  expect(chamada?.[2]).toEqual({ ordenarPor: "criado_em", decrescente: true, limite: 2 });
  espiao.mockRestore();
});

it("limite inválido na URL vira o padrão, nunca negativo ou fracionário", async () => {
  const ds = await getDataSource();
  const espiao = vi.spyOn(ds, "consultar");
  for (const [valor, esperado] of [["-5", 500], ["2.7", 2], ["abc", 500], ["99999", 2000]] as const) {
    espiao.mockClear();
    await GET(new Request(`http://x/api/historico?limite=${valor}`));
    expect(espiao.mock.calls.find(([t]) => t === "historico")?.[2]?.limite, valor).toBe(esperado);
  }
  espiao.mockRestore();
});
