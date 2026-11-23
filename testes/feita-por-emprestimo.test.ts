/**
 * "Feita por…" no empréstimo a outra unidade (23/11/2026): o poder novo do supervisor é cobrir a
 * tarefa de quem estava emprestado NO HORÁRIO declarado pelo coordenador — e só isso. Casos de
 * ataque da revisão de segurança: fora da janela, outra sede, outra pessoa, sem `libera_rota`,
 * `libera_rota` em texto, bloco que só encosta, outra data; e o colega também emprestado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { hojeISO } from "@/lib/dateUtils";
import type { SessaoUsuario } from "@/lib/permissions";
import { reiniciarBanco } from "@/lib/memoryStore";
import { registrarExecucao, registrarFeitaPor } from "@/services/execucoesService";
import type { RotinaPlanejada, Tarefa } from "@/types";

const SEDE = "s-ra";
const OUTRA = "s-out";
const SUP: SessaoUsuario = { id: "s1", nome: "Sup", email: "s@x.com", perfil: "supervisor", sede_id: SEDE, sedes: [SEDE] };
const SUP_OUTRA: SessaoUsuario = { ...SUP, id: "s2", sede_id: OUTRA, sedes: [OUTRA] };
let hoje = "";
const ds = () => getDataSource();

async function montar() {
  const d = await ds();
  const sede = await d.obter("sedes", "christus_dt");
  await d.criar("sedes", { ...sede!, id: SEDE, nome_sede: "Sede Teste" });
  await d.criar("sedes", { ...sede!, id: OUTRA, nome_sede: "Outra" });
  const pessoa = await d.obter("funcionarios", "christus_f1");
  for (const [id, nome] of [["fa", "Pessoa A"], ["fb", "Pessoa B"], ["fc", "Pessoa C"]])
    await d.criar("funcionarios", { ...pessoa!, id, nome, sede_id: SEDE, observacoes: "" });
  const local = await d.obter("locais", "christus_l1");
  await d.criar("locais", { ...local!, id: "ls", sede_id: SEDE, tipo_local: "sala" as never, nome_local: "ls" });
  const tarefa = await d.obter("tarefas", "christus_t2");
  await d.criar("tarefas", { ...tarefa!, id: "tSala", nome_tarefa: "tSala", local_id: "ls", sede_id: SEDE, prioridade: "media", requisitos: "" } as Tarefa);
}
async function bloco(id: string, funcionario_id: string, extra: Partial<RotinaPlanejada> = {}) {
  return (await ds()).criar("rotinas_planejadas", {
    id, data: hoje, funcionario_id, sede_id: SEDE, tarefa_id: "tSala", local_id: "ls", inicio_planejado: "10:00", fim_planejado: "10:30",
    tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1",
    criado_em: "", atualizado_em: "", ...extra,
  });
}
let n = 0;
const emprestimo = async (funcionario_id: string, inicio: string, fim: string, extra: Record<string, unknown> = {}) =>
  (await ds()).criar("servicos_eventuais", {
    id: `emp-${funcionario_id}-${inicio}-${n++}`, sede_id: SEDE, funcionario_id, local_id: "", categoria_id: "apoio_outro_setor",
    data: hoje, tipo: "eventual", descricao: "x", inicio, fim, tempo_min: 0, observacao: "",
    supervisor_id: "c1", exigencia: "nao_sei", libera_rota: true, criado_em: "", atualizado_em: "", ...extra,
  } as never);
const obter = async (id: string) => (await ds()).obter("rotinas_planejadas", id);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T20:00:00Z"));
  reiniciarBanco();
  hoje = hojeISO();
  await montar();
});
afterEach(() => vi.useRealTimers());

describe("Feita por no horário do empréstimo", () => {
  it("A: bloco fora da janela -> recusa", async () => {
    await bloco("r", "fa", { inicio_planejado: "15:00", fim_planejado: "15:30" });
    await emprestimo("fa", "09:00", "12:00");
    await expect(registrarFeitaPor("r", "fb", SUP, false)).rejects.toThrow(/ausente, ou emprestado/);
    expect((await obter("r"))?.funcionario_id).toBe("fa");
  });
  it("B: bloco na janela, colega da mesma sede -> passa", async () => {
    await bloco("r", "fa");
    await emprestimo("fa", "09:00", "12:00");
    await expect(registrarFeitaPor("r", "fb", SUP, false)).resolves.toBeTruthy();
    expect((await obter("r"))?.funcionario_id).toBe("fb");
  });
  it("C: supervisor de outra sede -> ErroPermissao", async () => {
    await bloco("r", "fa");
    await emprestimo("fa", "09:00", "12:00");
    await expect(registrarFeitaPor("r", "fb", SUP_OUTRA, false)).rejects.toThrow(/não encontrada/);
  });
  it("D: colega também emprestado no horário -> recusa antes da troca, nada gravado", async () => {
    await bloco("r", "fa");
    await emprestimo("fa", "09:00", "12:00");
    await emprestimo("fb", "09:00", "12:00");
    // Barrado antes da troca, com mensagem que não cita o motivo.
    await expect(registrarFeitaPor("r", "fb", SUP, false)).rejects.toThrow(/Pessoa B não está disponível neste horário/);
    expect((await obter("r"))?.funcionario_id).toBe("fa");
    expect(await (await ds()).consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: "r" }])).toHaveLength(0);
  });
  it("E: supervisor conforme direto no horario -> EMPRESTIMO_NO_HORARIO", async () => {
    await bloco("r", "fa");
    await emprestimo("fa", "09:00", "12:00");
    await expect(
      registrarExecucao(
        { rotina_id: "r", data_execucao: hoje, status_realizado: "conforme_planejado", inicio_real: "10:00", fim_real: "10:30", tempo_real_min: 30, justificativa: "", observacao: "", supervisor_id: "s1", epis_confirmados: "" },
        { perfil: "supervisor", confirmacaoRapida: true },
      ),
    ).rejects.toThrow(/emprestada a outra unidade/);
  });
  it("F: emprestimo de OUTRA pessoa nao abre", async () => {
    await bloco("r", "fa");
    await emprestimo("fc", "09:00", "12:00");
    await expect(registrarFeitaPor("r", "fb", SUP, false)).rejects.toThrow(/ausente, ou emprestado/);
  });
  it("G: atividade adicional sem libera_rota nao abre", async () => {
    await bloco("r", "fa");
    await emprestimo("fa", "09:00", "12:00", { libera_rota: false });
    await expect(registrarFeitaPor("r", "fb", SUP, false)).rejects.toThrow(/ausente, ou emprestado/);
  });
  it("H: libera_rota string gravado cru nao abre", async () => {
    await bloco("r", "fa");
    await emprestimo("fa", "09:00", "12:00", { libera_rota: "true" });
    await expect(registrarFeitaPor("r", "fb", SUP, false)).rejects.toThrow(/ausente, ou emprestado/);
  });
  it("I: bloco que so encosta no fim da janela nao abre", async () => {
    await bloco("r", "fa", { inicio_planejado: "12:00", fim_planejado: "12:30" });
    await emprestimo("fa", "09:00", "12:00");
    await expect(registrarFeitaPor("r", "fb", SUP, false)).rejects.toThrow(/ausente, ou emprestado/);
  });
  it("J: emprestimo em outra data nao abre", async () => {
    await bloco("r", "fa");
    await emprestimo("fa", "09:00", "12:00", { data: "2026-10-20" });
    await expect(registrarFeitaPor("r", "fb", SUP, false)).rejects.toThrow(/ausente, ou emprestado/);
  });
});
