/**
 * "Remanejos do dia" depois dos caminhos REAIS que mexem no bloco: arrasto, "Trocar tarefas", a
 * Central e o remanejo automático. A auditoria de 24/11/2026 reprovou a primeira versão por casos
 * assim: a regra pura estava certa e a junção dizia "coberta" para tarefa que ninguém faria.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { hojeISO } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { SessaoUsuario } from "@/lib/permissions";
import { getCentralDia, remanejarCriticasDeAusentes, resolverProximaExcecao } from "@/services/centralDiaService";
import { registrarExecucao } from "@/services/execucoesService";
import { getRemanejosDoDia } from "@/services/remanejosDoDiaService";
import { trocarTarefasDoDia, updateRotina } from "@/services/rotinasService";
import type { RotinaPlanejada, Tarefa } from "@/types";
import { ocuparResto } from "./equipeCheia";

const SEDE = "s-ra";
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };
let hoje = "";

const falta = async (f: string) =>
  (await getDataSource()).criar("ausencias", { id: `aus-${f}`, funcionario_id: f, sede_id: SEDE, tipo: "falta", data_inicio: hoje, data_fim: hoje, observacao: "", criado_em: "", atualizado_em: "" } as never);
/** O item da rota e o bloco do dia que nasceu dele. */
async function bloco(id: string, f: string, tarefa: string, local: string, extra: Partial<RotinaPlanejada> = {}) {
  const d = await getDataSource();
  await d.criar("modelos_rotina", { id: `i-${id}`, nome_modelo: "Rota", sede_id: SEDE, funcionario_id: f, tarefa_id: tarefa, local_id: local, inicio_planejado: "10:00", padrao: true, criado_por: "", criado_em: "" } as never);
  await d.criar("rotinas_planejadas", {
    id, data: hoje, funcionario_id: f, sede_id: SEDE, tarefa_id: tarefa, local_id: local, inicio_planejado: "10:00", fim_planejado: "10:30",
    tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1",
    criado_em: "", atualizado_em: "", origem_item_id: `i-${id}`, origem_inicio: "10:00", ...extra,
  });
}
const ver = async () =>
  (await getRemanejosDoDia(SEDE, hoje)).flatMap((p) => p.tarefas.map((t) => ({ lista: p.nome, ...t })));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
  reiniciarBanco();
  hoje = hojeISO();
  const d = await getDataSource();
  await d.criar("sedes", { ...(await d.obter("sedes", "christus_dt"))!, id: SEDE, nome_sede: "Sede Teste" });
  const p = (await d.obter("funcionarios", "christus_f1"))!;
  for (const [id, nome] of [["fa", "ANA"], ["fb", "BIA"], ["fc", "CAIO"]]) await d.criar("funcionarios", { ...p, id, nome, sede_id: SEDE, observacoes: "" });
  const l = (await d.obter("locais", "christus_l1"))!;
  for (const [id, tipo_local] of [["lb", "banheiro"], ["ls", "sala"], ["le", "escada"]] as const) await d.criar("locais", { ...l, id, sede_id: SEDE, tipo_local, nome_local: id } as never);
  const t0 = (await d.obter("tarefas", "christus_t2"))!;
  const t = (id: string, local_id: string, x: Partial<Tarefa> = {}) => d.criar("tarefas", { ...t0, id, nome_tarefa: id, local_id, sede_id: SEDE, prioridade: "media", requisitos: "", ...x });
  await t("tCritica", "lb", { critica: true, qualquer_horario: true });
  await t("tSala", "ls", { qualquer_horario: true });
  await t("tEscada", "le");
  await t("tOcupado", "ls", { critica: true });
});
afterEach(() => {
  vi.useRealTimers();
});

it("arrastada para quem depois também faltou: sem ninguém, e a Central aponta o mesmo", async () => {
  await bloco("r1", "fa", "tSala", "ls");
  await updateRotina("r1", { funcionario_id: "fb" });
  await falta("fb");
  expect((await getCentralDia(COORD, SEDE)).proxima.id).toBe("agenda-indisponivel");
  expect(await ver()).toMatchObject([{ lista: "BIA", rotina_id: "r1", situacao: "sem_ninguem" }]);
});

it("\"Trocar tarefas\" do dia e depois uma falta: a que ficou com ela está sem ninguém; a dela, com a colega", async () => {
  await bloco("ra", "fa", "tSala", "ls");
  await bloco("rb", "fb", "tEscada", "le");
  const p = await trocarTarefasDoDia({ data: hoje, sedeId: SEDE, aId: "fa", bId: "fb" });
  await trocarTarefasDoDia({ data: hoje, sedeId: SEDE, aId: "fa", bId: "fb", confirmar: true, assinatura: p.assinatura });
  await falta("fb");
  const l = await ver();
  expect(l.find((t) => t.rotina_id === "ra")).toMatchObject({ lista: "BIA", situacao: "sem_ninguem" });
  expect(l.find((t) => t.rotina_id === "rb")).toMatchObject({ lista: "BIA", situacao: "passou", para: "ANA", como: "a_mao" });
});

it("a tarefa da Ana arrastada para a Bia, que também faltou, e o automático passou ao Caio: está na lista da Ana", async () => {
  await falta("fa");
  await bloco("r1", "fa", "tCritica", "lb");
  await updateRotina("r1", { funcionario_id: "fb" });
  await falta("fb");
  await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
  expect((await ver()).find((t) => t.rotina_id === "r1")).toMatchObject({ lista: "ANA", situacao: "passou", para: "CAIO", como: "automatico" });
});

it("trocada à mão, feita por quem recebeu, e depois ela adoece: já registrada, nunca 'passou' para ela mesma", async () => {
  vi.setSystemTime(new Date("2026-10-19T20:00:00Z"));
  await bloco("r1", "fa", "tSala", "ls");
  await updateRotina("r1", { funcionario_id: "fb" });
  await registrarExecucao(
    { rotina_id: "r1", data_execucao: hoje, status_realizado: "conforme_planejado", inicio_real: "10:00", fim_real: "10:30", tempo_real_min: 30, justificativa: "", observacao: "", supervisor_id: "c1", epis_confirmados: "" } as never,
    { perfil: "coordenador" } as never,
  );
  await falta("fb");
  expect(await ver()).toMatchObject([{ lista: "BIA", rotina_id: "r1", situacao: "registrada" }]);
});

it("empréstimo resolvido na Central em outro horário continua na lista, pelo horário da dona", async () => {
  await (await getDataSource()).criar("servicos_eventuais", { id: "emp", sede_id: SEDE, funcionario_id: "fa", local_id: "", categoria_id: "apoio_outro_setor", data: hoje, tipo: "eventual", descricao: "x", inicio: "09:00", fim: "12:00", tempo_min: 0, observacao: "", supervisor_id: "c1", exigencia: "nao_sei", libera_rota: true, criado_em: "", atualizado_em: "" } as never);
  await bloco("r1", "fa", "tSala", "ls");
  await ocuparResto({ sede_id: SEDE, data: hoje, funcionarios: ["fb", "fc"], tarefa_id: "tOcupado", local_id: "ls", livres: { fb: [["14:00", "16:00"]] } });
  const r = (await getCentralDia(COORD, SEDE)).proxima.resolucao!;
  await resolverProximaExcecao(COORD, r.rotina_id, r.funcionario_id, (r.cedidas ?? []).map((c) => c.rotina_id), SEDE, r.inicio_planejado);
  expect((await ver()).find((t) => t.rotina_id === "r1")).toMatchObject({ lista: "ANA", situacao: "passou", para: "BIA", inicio: "10:00" });
});

it("passou para a colega, que a cedeu a uma crítica: ninguém faz, então não é 'passou'", async () => {
  await falta("fa");
  await bloco("r1", "fa", "tEscada", "le");
  await updateRotina("r1", { funcionario_id: "fb" });
  await bloco("rc", "fc", "tCritica", "lb");
  await (await getDataSource()).atualizar("tarefas", "tCritica", { qualquer_horario: false });
  await falta("fc");
  await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
  const l = await ver();
  expect(l.find((t) => t.rotina_id === "r1")?.situacao).toBe("cancelada");
  expect(l.find((t) => t.rotina_id === "rc")).toMatchObject({ lista: "CAIO", situacao: "passou", para: "BIA", como: "automatico" });
});
