/**
 * Desmarcar o realizado (27/10/2026): "quando marca feito não tem como voltar
 * atrás, daí não posso desfazer a geração". Apaga o registro e a tarefa volta a
 * "planejada" — e aí o "Limpar o dia" consegue tirá-la. Pelas rotas: sessão
 * simulada, banco de memória.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import { limparDia } from "@/services/rotinasService";
import type { RotinaPlanejada } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { POST: desfazer } = await import("@/app/api/execucoes/desfazer/route");
const { POST: registrar } = await import("@/app/api/execucoes/route");

const SEDE = "christus_dt";
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };
const SUP: SessaoUsuario = { ...COORD, id: "s1", email: "s@x.com", perfil: "supervisor" };
const json = (c: unknown) => new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });

/** Dia útil passado: o bloco já terminou, dá para registrar. */
function diaUtilPassado(): string {
  let d = somarDias(hojeISO(), -7);
  while ([0, 6].includes(new Date(`${d}T12:00:00`).getDay())) d = somarDias(d, -1);
  return d;
}
const DIA = diaUtilPassado();
/** O dia útil mais recente antes de hoje (dentro da janela de 7 dias do supervisor). */
function ontemUtil(): string {
  let d = somarDias(hojeISO(), -1);
  while ([0, 6].includes(new Date(`${d}T12:00:00`).getDay())) d = somarDias(d, -1);
  return d;
}

async function bloco(id: string, extra: Partial<RotinaPlanejada> = {}) {
  const ds = await getDataSource();
  return ds.criar("rotinas_planejadas", {
    id, data: DIA, funcionario_id: "christus_f1", sede_id: SEDE, tarefa_id: "christus_t2", local_id: "christus_l1",
    inicio_planejado: "08:00", fim_planejado: "08:20", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 1,
    status: "planejada", observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "", ...extra,
  } as RotinaPlanejada);
}
const feita = (rotina_id: string) =>
  registrar(json({ rotina_id, status_realizado: "conforme_planejado", inicio_real: "08:00", fim_real: "08:20", tempo_real_min: 20, justificativa: "", observacao: "", epis_confirmados: "" }));
const registrosDe = async (rotina_id: string) =>
  (await getDataSource()).consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: rotina_id }]);

describe("desmarcar o realizado", () => {
  beforeEach(() => {
    reiniciarBanco();
    sessao = COORD;
  });

  it("feita → desmarcar: o registro some, a tarefa volta a planejada e o Limpar o dia consegue tirá-la", async () => {
    await bloco("m_r1");
    expect((await feita("m_r1")).status).toBe(201);
    expect((await (await getDataSource()).obter("rotinas_planejadas", "m_r1"))?.status).toBe("realizada");
    const r = await desfazer(json({ rotina_id: "m_r1" }));
    expect(r.status).toBe(200);
    expect((await r.json()).apagados).toBe(1);
    expect(await registrosDe("m_r1")).toEqual([]);
    expect((await (await getDataSource()).obter("rotinas_planejadas", "m_r1"))?.status).toBe("planejada");
    const limpo = await limparDia(SEDE, DIA, "geradas", "c@x.com");
    expect(limpo.preservadas).toBe(0);
    expect(await (await getDataSource()).obter("rotinas_planejadas", "m_r1")).toBeNull();
  });

  it("o supervisor desmarca o que ELE lançou; o registro do coordenador e o cancelado, não (revisão de segurança)", async () => {
    const recente = ontemUtil();
    // O próprio registro: desmarca.
    await bloco("m_r2", { data: recente });
    sessao = SUP;
    expect((await feita("m_r2")).status).toBe(201);
    expect((await desfazer(json({ rotina_id: "m_r2" }))).status).toBe(200);
    // Registro do coordenador: recusa, e o registro fica.
    sessao = COORD;
    await bloco("m_r2c", { data: recente, inicio_planejado: "09:30", fim_planejado: "09:50" });
    await feita("m_r2c");
    sessao = SUP;
    expect((await desfazer(json({ rotina_id: "m_r2c" }))).status).toBe(403);
    expect(await registrosDe("m_r2c")).toHaveLength(1);
    // Cancelada pelo coordenador: recusa.
    await bloco("m_r3", { data: recente, status: "cancelada", inicio_planejado: "10:00", fim_planejado: "10:20" });
    expect((await desfazer(json({ rotina_id: "m_r3" }))).status).toBe(403);
    expect((await (await getDataSource()).obter("rotinas_planejadas", "m_r3"))?.status).toBe("cancelada");
  });

  it("o supervisor não desmarca registro de mais de 7 dias; o coordenador desmarca", async () => {
    const antigo = somarDias(hojeISO(), -10);
    await bloco("m_velho", { data: antigo });
    sessao = SUP;
    await feita("m_velho");
    expect(await registrosDe("m_velho")).toHaveLength(1);
    expect((await desfazer(json({ rotina_id: "m_velho" }))).status).toBe(403);
    sessao = COORD;
    expect((await desfazer(json({ rotina_id: "m_velho" }))).status).toBe(200);
  });

  it("tarefa coberta por colega (Feita por) não se desmarca por aqui", async () => {
    await bloco("m_r4", { status: "realizada", titular_id: "christus_f2" });
    const r = await desfazer(json({ rotina_id: "m_r4" }));
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("coberta por um colega");
  });

  it("remanejada que voltaria por cima de outra tarefa: recusa, e o registro fica", async () => {
    await bloco("m_r5", { status: "remanejada" });
    const ds = await getDataSource();
    await ds.criar("execucoes_realizadas", {
      id: "e5", rotina_id: "m_r5", sede_id: SEDE, data_execucao: DIA, status_realizado: "remanejada", inicio_real: "", fim_real: "",
      tempo_real_min: 0, justificativa: "cedida", observacao: "", epis_confirmados: "", supervisor_id: "c1", criado_em: "", atualizado_em: "",
    } as never);
    await bloco("m_outra", { inicio_planejado: "08:00", fim_planejado: "08:20" }); // ocupa o mesmo horário
    expect((await desfazer(json({ rotina_id: "m_r5" }))).status).toBe(422);
    expect(await registrosDe("m_r5")).toHaveLength(1);
    expect((await ds.obter("rotinas_planejadas", "m_r5"))?.status).toBe("remanejada");
  });

  it("sede alheia, visualizador e pedido sem tarefa: recusados", async () => {
    await bloco("m_r6", { sede_id: "christus_ald" });
    await (await getDataSource()).atualizar("rotinas_planejadas", "m_r6", { status: "realizada" });
    expect((await desfazer(json({ rotina_id: "m_r6" }))).status).toBe(403);
    sessao = { ...COORD, perfil: "visualizador" };
    expect((await desfazer(json({ rotina_id: "m_r6" }))).status).toBe(403);
    sessao = COORD;
    expect((await desfazer(json({}))).status).toBe(422);
  });
});
