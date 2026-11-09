/**
 * Trocar as tarefas do dia entre duas pessoas, de uma vez (pedido da coordenação,
 * 09/11/2026). Antes era bloco a bloco, e cada arrasto esbarrava nos blocos que o outro
 * ainda não tinha largado. Pelas rotas, com banco de memória.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { SessaoUsuario } from "@/lib/permissions";
import type { RotinaPlanejada } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao, gravarSessao: async () => {} }));
const { POST } = await import("@/app/api/rotinas/trocar/route");

const DIA = "2099-01-05"; // segunda
const SEDE = "christus_dt";
const A = "christus_f1"; // 06:00–16:00, intervalos 09:00, 11:30–13:00, 15:00
const B = "christus_f2"; // 07:00–17:00, intervalos 09:00, 13:00–14:00, 14:20
const COORD: SessaoUsuario = { id: "c", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };

const bloco = (id: string, funcionario_id: string, inicio: string, fim: string, extra: Partial<RotinaPlanejada> = {}) =>
  ({
    id, data: DIA, funcionario_id, sede_id: SEDE, tarefa_id: "tt", local_id: "christus_l1", inicio_planejado: inicio, fim_planejado: fim,
    tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "c", criado_em: "", atualizado_em: "", ...extra,
  }) as RotinaPlanejada;
const pedir = (corpo: unknown) => POST(new Request("http://x/api/rotinas/trocar", { method: "POST", body: JSON.stringify(corpo) }));
const troca = (extra: Record<string, unknown> = {}) => ({ data: DIA, sede_id: SEDE, a: A, b: B, ...extra });
const ler = async (id: string) => (await getDataSource()).obter("rotinas_planejadas", id);
const donos = async () => Object.fromEntries(((await (await getDataSource()).listar("rotinas_planejadas")).filter((r) => r.data === DIA)).map((r) => [r.id, r.funcionario_id]));

beforeEach(async () => {
  reiniciarBanco();
  sessao = COORD;
  const d = await getDataSource();
  const t1 = (await d.obter("tarefas", "christus_t1"))!;
  await d.criar("tarefas", { ...t1, id: "tt", nome_tarefa: "Limpar sala", requisitos: "" });
  for (const r of await d.listar("rotinas_planejadas")) if (r.data === DIA) await d.excluir("rotinas_planejadas", r.id);
  await d.criar("rotinas_planejadas", bloco("a1", A, "07:30", "08:00"));
  await d.criar("rotinas_planejadas", bloco("a2", A, "10:00", "10:30"));
  await d.criar("rotinas_planejadas", bloco("b1", B, "08:00", "08:30"));
  await d.criar("rotinas_planejadas", bloco("b2", B, "10:30", "11:00"));
});

describe("trocar as tarefas do dia", () => {
  it("sem confirmar, só mostra a proposta e não grava nada", async () => {
    const r = await pedir(troca());
    expect(r.status).toBe(200);
    const p = await r.json();
    expect(p).toMatchObject({ a: { recebe: 2 }, b: { recebe: 2 }, ficam: 0, bloqueia: false, pedeAutorizacao: false });
    expect(p.blocos.map((b: { rotina_id: string }) => b.rotina_id)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(await donos()).toEqual({ a1: A, a2: A, b1: B, b2: B });
  });

  it("confirmando, as de A vão para B e as de B para A, nos mesmos horários", async () => {
    const { assinatura } = await (await pedir(troca())).json();
    const r = await pedir(troca({ confirmar: true, assinatura }));
    expect(r.status).toBe(200);
    expect((await r.json()).gravados).toBe(4);
    expect(await donos()).toEqual({ a1: B, a2: B, b1: A, b2: A });
    expect(await ler("a1")).toMatchObject({ inicio_planejado: "07:30", fim_planejado: "08:00" });
  });

  it("bloco com realizado, cancelado ou remanejado fica com quem está", async () => {
    const d = await getDataSource();
    await d.atualizar("rotinas_planejadas", "a2", { status: "realizada" });
    await d.atualizar("rotinas_planejadas", "b2", { status: "cancelada" });
    const p = await (await pedir(troca())).json();
    expect(p).toMatchObject({ a: { recebe: 1 }, b: { recebe: 1 }, ficam: 2 });
    await pedir(troca({ confirmar: true, assinatura: p.assinatura }));
    expect(await donos()).toEqual({ a1: B, a2: A, b1: A, b2: B });
  });

  it("só um dos dois com tarefa: vira passar as tarefas", async () => {
    const d = await getDataSource();
    await d.excluir("rotinas_planejadas", "b1");
    await d.excluir("rotinas_planejadas", "b2");
    const p = await (await pedir(troca())).json();
    expect(p).toMatchObject({ a: { recebe: 0 }, b: { recebe: 2 } });
    await pedir(troca({ confirmar: true, assinatura: p.assinatura }));
    expect(await donos()).toEqual({ a1: B, a2: B });
  });

  it("fora do expediente do destino: pede autorização, recusa sem ela e grava com ela, registrado", async () => {
    await (await getDataSource()).criar("rotinas_planejadas", bloco("a0", A, "06:00", "06:30"));
    const p = await (await pedir(troca())).json();
    expect(p).toMatchObject({ bloqueia: false, pedeAutorizacao: true });
    expect(p.blocos.find((b: { rotina_id: string }) => b.rotina_id === "a0").alertas[0].codigo).toBe("FORA_DO_EXPEDIENTE");
    const sem = await pedir(troca({ confirmar: true, assinatura: p.assinatura }));
    expect(sem.status).toBe(422);
    expect((await donos()).a0).toBe(A);
    const com = await pedir(troca({ confirmar: true, forcar: true, assinatura: p.assinatura }));
    expect(com.status).toBe(200);
    expect(await ler("a0")).toMatchObject({ funcionario_id: B, observacao: "[Autorizado manualmente]" });
    expect((await ler("a1"))?.observacao).toBe("");
  });

  it("requisito que o destino não tem bloqueia, nem autorizando", async () => {
    const d = await getDataSource();
    const aud = { criado_por: "a", criado_em: "", atualizado_por: "a", atualizado_em: "" };
    await d.criar("requisitos", { id: "apt", nome: "Altura", tipo: "aptidao", descricao: "", ativo: true, ...aud });
    await d.atualizar("tarefas", "tt", { requisitos: "apt" });
    await d.criar("qualificacoes_funcionario", { id: "q", funcionario_id: A, requisito_id: "apt", sede_id: SEDE, validade: "", observacao: "", ...aud } as never);
    const p = await (await pedir(troca({ forcar: true }))).json();
    expect(p.bloqueia).toBe(true);
    expect((await pedir(troca({ confirmar: true, forcar: true, assinatura: p.assinatura }))).status).toBe(422);
    expect(await donos()).toEqual({ a1: A, a2: A, b1: B, b2: B });
  });

  it("a agenda mudou entre mostrar e confirmar: 409, e nada muda", async () => {
    const { assinatura } = await (await pedir(troca())).json();
    await (await getDataSource()).criar("rotinas_planejadas", bloco("b3", B, "15:30", "16:00"));
    const r = await pedir(troca({ confirmar: true, assinatura }));
    expect(r.status).toBe(409);
    expect(await donos()).toEqual({ a1: A, a2: A, b1: B, b2: B, b3: B });
  });

  it("recusa a mesma pessoa, ausente, de outra sede, sem tarefa nos dois e dados tortos", async () => {
    const d = await getDataSource();
    expect((await pedir(troca({ b: A }))).status).toBe(422);
    expect((await pedir(troca({ a: 5 }))).status).toBe(422);
    expect((await pedir(troca({ data: "amanhã" }))).status).toBe(422);
    await d.atualizar("funcionarios", "christus_f3", { sede_id: "christus_ald" });
    expect((await pedir(troca({ b: "christus_f3" }))).status).toBe(422);
    expect((await pedir(troca({ b: "christus_f4" }))).status).toBe(200); // sem tarefa: passa as de A
    await d.criar("ausencias", { id: "x", funcionario_id: B, sede_id: SEDE, tipo: "falta", data_inicio: DIA, data_fim: DIA, observacao: "" } as never);
    expect((await pedir(troca())).status).toBe(422);
    expect(await donos()).toEqual({ a1: A, a2: A, b1: B, b2: B });
  });

  it("nenhum dos dois com tarefa planejada: diz isso", async () => {
    const r = await pedir(troca({ a: "christus_f3", b: "christus_f4" }));
    expect(r.status).toBe(422);
    expect((await r.json()).erro).toContain("Nenhum dos dois");
  });

  it("supervisor e visualizador não trocam; coordenador só nas sedes dele", async () => {
    for (const perfil of ["supervisor", "visualizador"] as const) {
      sessao = { ...COORD, perfil };
      expect((await pedir(troca({ confirmar: true }))).status).toBe(403);
    }
    sessao = { ...COORD, sede_id: "christus_ald", sedes: ["christus_ald"] };
    expect((await pedir(troca())).status).toBe(403);
    expect((await pedir(null)).status).toBe(403);
    sessao = null;
    expect((await pedir(troca())).status).toBe(401);
    expect(await donos()).toEqual({ a1: A, a2: A, b1: B, b2: B });
  });

  it("a proposta mostra o que pede autorização mesmo se o pedido vier com forcar: a autorização é da confirmação", async () => {
    await (await getDataSource()).criar("rotinas_planejadas", bloco("a0", A, "06:00", "06:30"));
    const p = await (await pedir(troca({ forcar: true }))).json();
    expect(p).toMatchObject({ pedeAutorizacao: true, bloqueia: false });
    expect(p.blocos.find((b: { rotina_id: string }) => b.rotina_id === "a0").alertas[0].nivel).toBe("erro");
  });

  it("bloco que muda de horário entre ver e confirmar: 409, e a autorização não cobre o conflito novo", async () => {
    await (await getDataSource()).criar("rotinas_planejadas", bloco("a0", A, "06:00", "06:30"));
    const { assinatura } = await (await pedir(troca())).json();
    // Alguém leva o bloco de B para o intervalo de A (11:30–13:00).
    await (await getDataSource()).atualizar("rotinas_planejadas", "b1", { inicio_planejado: "11:40", fim_planejado: "12:10" });
    const r = await pedir(troca({ confirmar: true, forcar: true, assinatura }));
    expect(r.status).toBe(409);
    expect((await ler("b1"))?.funcionario_id).toBe(B);
    expect((await ler("b1"))?.observacao).toBe("");
  });

  it("bloco com realizado registrado fica com quem fez, mesmo com o status ainda em planejada", async () => {
    await (await getDataSource()).criar("execucoes_realizadas", {
      id: "e1", rotina_id: "a1", sede_id: SEDE, data_execucao: DIA, status_realizado: "conforme_planejado", tempo_real_min: 30,
      observacao: "", epis_confirmados: "", criado_em: "", atualizado_em: "",
    } as never);
    const p = await (await pedir(troca())).json();
    expect(p).toMatchObject({ b: { recebe: 1 }, ficam: 1 });
    await pedir(troca({ confirmar: true, assinatura: p.assinatura }));
    expect((await ler("a1"))?.funcionario_id).toBe(A);
  });

  it("o fim gravado é o real (início + previsto), como no arrasto", async () => {
    await (await getDataSource()).atualizar("rotinas_planejadas", "a1", { fim_planejado: "09:00" }); // legado torto
    const { assinatura } = await (await pedir(troca())).json();
    await pedir(troca({ confirmar: true, assinatura }));
    expect((await ler("a1"))?.fim_planejado).toBe("08:00");
  });

  describe("também na rota padrão", () => {
    const item = (id: string, funcionario_id: string, extra: Record<string, unknown> = {}) =>
      ({ id, nome_modelo: "Rota", sede_id: SEDE, funcionario_id, tarefa_id: "tt", local_id: "christus_l1", inicio_planejado: "07:30", padrao: true, ...extra }) as never;
    const donoDoItem = async (id: string) => (await (await getDataSource()).obter("modelos_rotina", id))?.funcionario_id;
    beforeEach(async () => {
      const d = await getDataSource();
      await d.criar("modelos_rotina", item("ra", A));
      await d.criar("modelos_rotina", item("rb", B));
      await d.criar("modelos_rotina", item("rb-sab", B, { dias_semana: "6" }));
      await d.criar("modelos_rotina", item("evento", A, { padrao: false, evento: true, nome_modelo: "Formatura" }));
      await d.criar("modelos_rotina", item("outro", A, { padrao: false, nome_modelo: "Modelo solto" }));
      await d.criar("modelos_rotina", item("colega", "christus_f3"));
    });

    it("a proposta conta os itens da rota padrão de cada um, sem evento nem modelo solto", async () => {
      expect((await (await pedir(troca())).json()).rota).toEqual({ a: 1, b: 2 });
    });

    it("marcado, troca a pessoa nos itens da rota padrão, junto com o dia", async () => {
      const { assinatura } = await (await pedir(troca())).json();
      expect((await pedir(troca({ confirmar: true, rota: true, assinatura }))).status).toBe(200);
      expect([await donoDoItem("ra"), await donoDoItem("rb"), await donoDoItem("rb-sab")]).toEqual([B, A, A]);
      expect([await donoDoItem("evento"), await donoDoItem("outro"), await donoDoItem("colega")]).toEqual([A, A, "christus_f3"]);
      expect(await donos()).toEqual({ a1: B, a2: B, b1: A, b2: A });
    });

    it("sem marcar, a rota fica como estava", async () => {
      const { assinatura } = await (await pedir(troca())).json();
      await pedir(troca({ confirmar: true, assinatura }));
      expect([await donoDoItem("ra"), await donoDoItem("rb")]).toEqual([A, B]);
    });

    it("rota mudada entre ver e confirmar: 409, e nada muda", async () => {
      const { assinatura } = await (await pedir(troca())).json();
      await (await getDataSource()).criar("modelos_rotina", item("ra2", A, { inicio_planejado: "10:00" }));
      expect((await pedir(troca({ confirmar: true, rota: true, assinatura }))).status).toBe(409);
      expect([await donoDoItem("ra"), await donoDoItem("ra2")]).toEqual([A, A]);
      expect(await donos()).toEqual({ a1: A, a2: A, b1: B, b2: B });
    });

    it("rota com tarefa que quem recebe não pode fazer: a proposta diz, e a confirmação com rota recusa", async () => {
      const d = await getDataSource();
      const aud = { criado_por: "a", criado_em: "", atualizado_por: "a", atualizado_em: "" };
      await d.criar("requisitos", { id: "apt", nome: "Altura", tipo: "aptidao", descricao: "", ativo: true, ...aud });
      const t1 = (await d.obter("tarefas", "christus_t1"))!;
      await d.criar("tarefas", { ...t1, id: "fachada", nome_tarefa: "Limpar fachada", requisitos: "apt", restricao_genero: "feminino" } as never);
      await d.criar("qualificacoes_funcionario", { id: "q", funcionario_id: A, requisito_id: "apt", sede_id: SEDE, validade: "", observacao: "", ...aud } as never);
      await d.criar("modelos_rotina", item("ra-fachada", A, { tarefa_id: "fachada", inicio_planejado: "14:00" }));
      for (const id of ["a1", "a2", "b1", "b2"]) await d.excluir("rotinas_planejadas", id);
      const p = await (await pedir(troca({ b: "christus_f3" }))).json(); // Do Vale: sem a aptidão e masculino
      expect(p.rotaRecusas).toEqual([expect.objectContaining({ item_id: "ra-fachada", dias: "", tarefa: "Limpar fachada", inicio: "14:00" })]);
      expect(p.rotaRecusas[0].motivo).toMatch(/Altura|feminino|gênero/iu);
      const r = await pedir(troca({ b: "christus_f3", confirmar: true, rota: true, forcar: true, assinatura: p.assinatura }));
      expect(r.status).toBe(422);
      expect(await donoDoItem("ra-fachada")).toBe(A);
      expect(await donoDoItem("ra")).toBe(A);
    });

    it("a mesma tarefa recusada em duas camadas aparece duas vezes, cada uma com o id do item e os dias", async () => {
      const d = await getDataSource();
      const t1 = (await d.obter("tarefas", "christus_t1"))!;
      await d.criar("tarefas", { ...t1, id: "wcfem", nome_tarefa: "WC feminino", requisitos: "", restricao_genero: "feminino" } as never);
      await d.criar("modelos_rotina", item("wc-semana", A, { tarefa_id: "wcfem", inicio_planejado: "14:00", dias_semana: "1,2,3,4,5" }));
      await d.criar("modelos_rotina", item("wc-sabado", A, { tarefa_id: "wcfem", inicio_planejado: "14:00", dias_semana: "6" }));
      const p = await (await pedir(troca({ b: "christus_f3" }))).json(); // Do Vale: masculino
      const wc = p.rotaRecusas.filter((r: { tarefa: string }) => r.tarefa === "WC feminino");
      expect(wc.map((r: { item_id: string }) => r.item_id).sort()).toEqual(["wc-sabado", "wc-semana"]);
      expect(new Set(wc.map((r: { dias: string }) => r.dias))).toEqual(new Set(["sáb", "seg, ter, qua, qui, sex"]));
    });

    it("depois da troca na rota, a substituição no posto leva o item para o substituto, sem apagá-lo", async () => {
      const { substituirNoPosto } = await import("@/services/funcionariosService");
      const { assinatura } = await (await pedir(troca())).json();
      await pedir(troca({ confirmar: true, rota: true, assinatura }));
      expect(await donoDoItem("ra")).toBe(B); // o id ainda carrega A
      await (await getDataSource()).atualizar("funcionarios", "christus_f4", { entrada: "07:00", saida: "17:00" });
      const r = await substituirNoPosto("christus_f4", B, DIA, "c@x.com");
      expect(await donoDoItem("ra")).toBe("christus_f4");
      expect(r.itensDeRota).toBe(1); // o item que só mudou de dono também conta
      expect(await (await getDataSource()).obter("modelos_rotina", "ra")).not.toBeNull();
    });

    it("dia sem tarefa: só a rota troca, e só se marcada", async () => {
      const d = await getDataSource();
      for (const id of ["a1", "a2", "b1", "b2"]) await d.excluir("rotinas_planejadas", id);
      const p = await (await pedir(troca())).json();
      expect(p.blocos).toEqual([]);
      expect((await pedir(troca({ confirmar: true, assinatura: p.assinatura }))).status).toBe(422);
      expect((await pedir(troca({ confirmar: true, rota: true, assinatura: p.assinatura }))).status).toBe(200);
      expect([await donoDoItem("ra"), await donoDoItem("rb")]).toEqual([B, A]);
    });
  });

  it("a troca entra no histórico, bloco a bloco", async () => {
    const { assinatura } = await (await pedir(troca())).json();
    await pedir(troca({ confirmar: true, assinatura }));
    const h = (await (await getDataSource()).listar("historico")).filter((x) => x.tabela === "rotinas_planejadas" && x.acao === "atualizar" && ["a1", "a2", "b1", "b2"].includes(x.registro_id));
    expect(h).toHaveLength(4);
    expect(h[0].resumo).toContain("funcionario_id");
  });
});
