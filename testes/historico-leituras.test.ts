/**
 * Tela de Histórico: pede ao banco só os mais recentes, já ordenados e
 * limitados — lia ~6 mil registros (30 dias) para mostrar 500, e cada um é
 * leitura cobrada no Firestore (levantamento de leituras, 20/10/2026).
 */
import { beforeEach, expect, it, vi } from "vitest";
import { coberturaPorHistorico } from "@/lib/calculations";
import { getDataSource, ordenarELimitar } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { diasComPendencia, ultimoDiaComRotina } from "@/services/rotinasService";
import type { SessaoUsuario } from "@/lib/permissions";
import { reiniciarBanco } from "@/lib/memoryStore";

const ADMIN: SessaoUsuario = { id: "a", nome: "Adm", email: "a@x.com", perfil: "administrador", sede_id: "geral", sedes: [] };
let sessao: SessaoUsuario = ADMIN;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao }));
const { GET } = await import("@/app/api/historico/route");
const { GET: getPendentes } = await import("@/app/api/rotinas/pendentes/route");
const { GET: getUltimoDia } = await import("@/app/api/rotinas/ultimo-dia/route");

beforeEach(() => {
  reiniciarBanco();
  sessao = ADMIN;
});

async function bloco(id: string, data: string, status: string, sede_id = "christus_dt") {
  const ds = await getDataSource();
  await ds.criar("rotinas_planejadas", {
    id, data, funcionario_id: "christus_f1", sede_id, tarefa_id: "christus_t2", local_id: "christus_l1",
    inicio_planejado: "08:00", fim_planejado: "08:20", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 1,
    status, observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "",
  } as never);
}

it("as rotas novas só enxergam as sedes de quem pede", async () => {
  const hoje = hojeISO();
  await bloco("dt1", somarDias(hoje, -2), "planejada");
  await bloco("ald1", somarDias(hoje, -2), "planejada", "christus_ald");
  await bloco("ald2", somarDias(hoje, -2), "planejada", "christus_ald");
  sessao = { id: "s", nome: "Sup", email: "s@x.com", perfil: "supervisor", sede_id: "christus_dt", sedes: ["christus_dt"] };
  const pend = (await (await getPendentes(new Request("http://x/api/rotinas/pendentes?sede=christus_ald"))).json()) as [string, number][];
  expect(pend).toEqual([[somarDias(hoje, -2), 1]]); // a DT, não a Aldeota
  // O "repetir" é de quem monta a agenda: o supervisor não recebe nada.
  const doSupervisor = await (await getUltimoDia(new Request(`http://x/api/rotinas/ultimo-dia?sede=christus_dt&antes=${hoje}`))).json();
  expect(doSupervisor).toBeNull();
  sessao = { ...sessao, perfil: "coordenador" };
  const ultimo = await (await getUltimoDia(new Request(`http://x/api/rotinas/ultimo-dia?sede=christus_ald&antes=${hoje}`))).json();
  expect(ultimo).toEqual({ data: somarDias(hoje, -2), n: 1 }); // a DT, não a Aldeota
});

it("último dia: data inválida devolve nada sem gastar contagem", async () => {
  const ds = await getDataSource();
  const espiao = vi.spyOn(ds, "contar");
  for (const antes of ["2026-13-45", "0000-00-00", "ontem"]) {
    const r = await (await getUltimoDia(new Request(`http://x/api/rotinas/ultimo-dia?sede=christus_dt&antes=${antes}`))).json();
    expect(r, antes).toBeNull();
  }
  expect(espiao).not.toHaveBeenCalled();
  espiao.mockRestore();
});

it("último dia com rotina: o mais recente, sem contar cancelada e remanejada, e só contando", async () => {
  const hoje = hojeISO();
  await bloco("u1", somarDias(hoje, -1), "cancelada"); // dia só com cancelada não serve
  await bloco("u2", somarDias(hoje, -3), "planejada");
  await bloco("u3", somarDias(hoje, -3), "remanejada");
  await bloco("u4", somarDias(hoje, -3), "realizada");
  await bloco("u5", somarDias(hoje, -10), "planejada");
  const ds = await getDataSource();
  const espiao = vi.spyOn(ds, "consultar");
  expect(await ultimoDiaComRotina("christus_dt", hoje)).toEqual({ data: somarDias(hoje, -3), n: 2 });
  expect(espiao.mock.calls.filter(([t]) => t === "rotinas_planejadas").length).toBe(0);
  espiao.mockRestore();
  expect(await ultimoDiaComRotina("christus_ald", somarDias(hoje, -40))).toBeNull();
});

it("Acompanhamento: dias da semana passada com blocos sem registro, contados sem trazer as rotinas", async () => {
  const ds = await getDataSource();
  const hoje = hojeISO();
  const bloco = (id: string, data: string, status: string) =>
    ds.criar("rotinas_planejadas", {
      id, data, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t2", local_id: "christus_l1",
      inicio_planejado: "08:00", fim_planejado: "08:20", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 1,
      status, observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "",
    } as never);
  await bloco("p1", somarDias(hoje, -2), "planejada");
  await bloco("p2", somarDias(hoje, -2), "pendente");
  await bloco("p3", somarDias(hoje, -2), "realizada");
  await bloco("p4", somarDias(hoje, -9), "planejada"); // fora da semana
  await bloco("p5", hoje, "planejada"); // hoje ainda não é "dia anterior"
  await bloco("p6", somarDias(hoje, -7), "planejada"); // a ponta da semana entra
  const espiao = vi.spyOn(ds, "consultar");
  const dias = await diasComPendencia("christus_dt", hoje);
  expect(dias.find(([d]) => d === somarDias(hoje, -2))?.[1]).toBe(2);
  expect(dias.some(([d]) => d === somarDias(hoje, -9))).toBe(false);
  expect(dias.some(([d]) => d === hoje)).toBe(false);
  expect(dias.some(([d]) => d === somarDias(hoje, -7))).toBe(true);
  expect(espiao.mock.calls.filter(([t]) => t === "rotinas_planejadas").length).toBe(0); // contou, não leu
  espiao.mockRestore();
});

it("Agenda: só a periódica sem dia fixo precisa de histórico", () => {
  expect(coberturaPorHistorico({ frequencia: "diaria" } as never)).toBe(false);
  expect(coberturaPorHistorico({ frequencia: "semanal", dias_semana: "2,4" } as never)).toBe(false);
  expect(coberturaPorHistorico({ frequencia: "semanal", dias_semana: "" } as never)).toBe(true);
  expect(coberturaPorHistorico({ frequencia: "quinzenal" } as never)).toBe(true);
  expect(coberturaPorHistorico({ frequencia: "mensal" } as never)).toBe(true);
});

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

it("com filtro de tabela também pede só os mais recentes; sem o índice publicado, cai no jeito antigo", async () => {
  // Levantamento de 22/10/2026: o histórico de rotinas passa de 20 mil linhas.
  const ds = await getDataSource();
  const agora = Date.now();
  for (let i = 0; i < 5; i++) {
    await ds.criar("historico", {
      id: `r${i}`, tabela: "rotinas_planejadas", registro_id: "x", acao: "atualizar", usuario: "a@x.com",
      resumo: "", criado_em: new Date(agora - i * 60_000).toISOString(),
    } as never);
  }
  await ds.criar("historico", {
    id: "outra", tabela: "sedes", registro_id: "x", acao: "atualizar", usuario: "a@x.com", resumo: "", criado_em: new Date(agora).toISOString(),
  } as never);
  const original = ds.consultar.bind(ds); // ANTES do espião, senão ele chama a si mesmo
  const espiao = vi.spyOn(ds, "consultar");
  const pedir = async () =>
    ((await (await GET(new Request("http://x/api/historico?tabela=rotinas_planejadas&limite=2"))).json()) as { id: string }[]).map((h) => h.id);
  expect(await pedir()).toEqual(["r0", "r1"]);
  expect(espiao.mock.calls.find(([t]) => t === "historico")?.[2]).toEqual({ ordenarPor: "criado_em", decrescente: true, limite: 2 });

  // Firestore sem o índice composto: recusa a consulta ordenada → lê sem ordenar e corta aqui.
  espiao.mockImplementation((async (tabela: string, cond: never, opcoes?: { ordenarPor?: string }) => {
    if (tabela === "historico" && opcoes?.ordenarPor) throw new Error("FAILED_PRECONDITION: The query requires an index");
    return original(tabela as never, cond, opcoes as never);
  }) as never);
  expect(await pedir()).toEqual(["r0", "r1"]);
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
