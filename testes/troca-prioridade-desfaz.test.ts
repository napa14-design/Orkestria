/**
 * Troca por prioridade: se mover a tarefa falha depois de as cedidas já estarem
 * gravadas, as cedidas voltam — ninguém perde a tarefa numa troca que não
 * aconteceu. Arquivo à parte porque precisa forçar a falha do `updateRotina`.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { hojeISO } from "@/lib/dateUtils";
import type { SessaoUsuario } from "@/lib/permissions";
import { reiniciarBanco } from "@/lib/memoryStore";

vi.mock("@/services/rotinasService", async (original) => ({
  ...(await original<typeof import("@/services/rotinasService")>()),
  updateRotina: async () => {
    throw new Error("falha simulada ao mover");
  },
}));
const { resolverProximaExcecao } = await import("@/services/centralDiaService");

const SEDE = "s-tp";
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T13:00:00Z"));
  reiniciarBanco();
  const hoje = hojeISO();
  const d = await getDataSource();
  await d.criar("sedes", { ...(await d.obter("sedes", "christus_dt"))!, id: SEDE });
  const pessoa = (await d.obter("funcionarios", "christus_f1"))!;
  for (const id of ["fa", "fb", "fc"]) await d.criar("funcionarios", { ...pessoa, id, nome: `Pessoa ${id}`, sede_id: SEDE });
  const local = (await d.obter("locais", "christus_l1"))!;
  await d.criar("locais", { ...local, id: "lb", sede_id: SEDE, tipo_local: "banheiro" });
  await d.criar("locais", { ...local, id: "le", sede_id: SEDE, tipo_local: "escada" });
  const tarefa = (await d.obter("tarefas", "christus_t2"))!;
  await d.criar("tarefas", { ...tarefa, id: "tB", local_id: "lb", sede_id: SEDE, requisitos: "" });
  await d.criar("tarefas", { ...tarefa, id: "tE", local_id: "le", sede_id: SEDE, requisitos: "" });
  await d.criar("ausencias", { id: "a1", funcionario_id: "fa", sede_id: SEDE, tipo: "falta", data_inicio: hoje, data_fim: hoje, observacao: "", criado_em: "", atualizado_em: "" } as never);
  const r = (id: string, funcionario_id: string, tarefa_id: string, local_id: string) =>
    d.criar("rotinas_planejadas", {
      id, data: hoje, funcionario_id, sede_id: SEDE, tarefa_id, local_id, inicio_planejado: "10:00", fim_planejado: "10:30",
      tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "",
    });
  await r("rFalta", "fa", "tB", "lb");
  await r("rAlta", "fb", "tB", "lb");
  await r("rBaixa", "fc", "tE", "le");
});
afterEach(() => vi.useRealTimers());

it("falhou ao mover: a cedida volta a planejada e o registro de remanejada some", async () => {
  await expect(resolverProximaExcecao(COORD, "rFalta", "fc", ["rBaixa"], SEDE)).rejects.toThrow("falha simulada");
  const d = await getDataSource();
  expect((await d.obter("rotinas_planejadas", "rBaixa"))?.status).toBe("planejada");
  expect(await d.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: "rBaixa" }])).toEqual([]);
});
