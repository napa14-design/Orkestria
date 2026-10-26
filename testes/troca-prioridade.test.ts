/**
 * Troca por prioridade na Central do dia (19/10/2026).
 *
 * Quando alguém falta e ninguém tem o horário livre, a Central propõe que quem
 * está numa tarefa de prioridade MENOR assuma a da falta; o que ela fazia vira
 * "remanejada", com o motivo. Decisões do dono: cede só prioridade menor, baixa
 * antes de média; crítica nunca; a cedida sai da ocupação.
 *
 * Sede sintética, com pessoas fictícias — o repo é público.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nivelPrioridade, ocupaHorario, tempoPlanejadoMin } from "@/lib/calculations";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import type { SessaoUsuario } from "@/lib/permissions";
import { reiniciarBanco } from "@/lib/memoryStore";
import { validarAlocacao } from "@/lib/validations";
import { getCentralDia, resolverProximaExcecao } from "@/services/centralDiaService";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { registrarExecucao } from "@/services/execucoesService";
import { gerarDiaDaRotaPadrao, salvarModelo } from "@/services/modelosService";
import { duplicarDia, updateRotina } from "@/services/rotinasService";
import type { RotinaPlanejada, Tarefa } from "@/types";

const SEDE = "s-tp";
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };

let hoje = "";
const ds = () => getDataSource();

async function montar() {
  const d = await ds();
  const sede = await d.obter("sedes", "christus_dt");
  await d.criar("sedes", { ...sede!, id: SEDE, nome_sede: "Sede Teste" });
  const pessoa = await d.obter("funcionarios", "christus_f1");
  for (const [id, nome] of [["fa", "Pessoa A"], ["fb", "Pessoa B"], ["fc", "Pessoa C"]])
    await d.criar("funcionarios", { ...pessoa!, id, nome, sede_id: SEDE, observacoes: "" });
  const local = await d.obter("locais", "christus_l1");
  for (const [id, tipo_local] of [["lb", "banheiro"], ["ls", "sala"], ["le", "escada"]])
    await d.criar("locais", { ...local!, id, sede_id: SEDE, tipo_local: tipo_local as never, nome_local: id });
  const tarefa = await d.obter("tarefas", "christus_t2");
  const t = (id: string, local_id: string, extra: Partial<Tarefa> = {}) =>
    d.criar("tarefas", { ...tarefa!, id, nome_tarefa: id, local_id, sede_id: SEDE, prioridade: "media", requisitos: "", ...extra });
  await t("tBanheiro", "lb"); // média → alta pelo tipo
  await t("tSala", "ls"); // média
  await t("tEscada", "le"); // média → baixa pelo tipo
  await d.criar("ausencias", {
    id: "aus1", funcionario_id: "fa", sede_id: SEDE, tipo: "falta", data_inicio: hoje, data_fim: hoje, observacao: "",
    criado_em: "", atualizado_em: "",
  } as never);
}

async function bloco(id: string, funcionario_id: string, tarefa_id: string, local_id: string, extra: Partial<RotinaPlanejada> = {}) {
  const d = await ds();
  return d.criar("rotinas_planejadas", {
    id, data: hoje, funcionario_id, sede_id: SEDE, tarefa_id, local_id, inicio_planejado: "10:00", fim_planejado: "10:30",
    tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1",
    criado_em: "", atualizado_em: "", ...extra,
  });
}

const proposta = async () => (await getCentralDia(COORD, SEDE)).proxima;

beforeEach(async () => {
  // Segunda-feira, 10h em Fortaleza: dia útil e a manhã ainda em curso.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T13:00:00Z"));
  reiniciarBanco();
  hoje = hojeISO();
  await montar();
});
afterEach(() => vi.useRealTimers());

describe("troca por prioridade", () => {
  it("cede a baixa antes da média e explica a troca", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rMedia", "fb", "tSala", "ls");
    await bloco("rBaixa", "fc", "tEscada", "le");
    const p = await proposta();
    expect(p.resolucao?.tipo).toBe("trocar_por_prioridade");
    expect(p.resolucao?.funcionario_id).toBe("fc");
    expect(p.resolucao?.tarefa_prioridade).toBe("alta");
    expect(p.resolucao?.cedidas?.map((c) => [c.rotina_id, c.prioridade])).toEqual([["rBaixa", "baixa"]]);
    expect(p.acao).toBe("Confirmar troca");
  });

  it("sem baixa no horário, cede média para cobrir alta", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rMedia", "fb", "tSala", "ls");
    await bloco("rAlta", "fc", "tBanheiro", "lb");
    const p = await proposta();
    expect(p.resolucao?.funcionario_id).toBe("fb");
    expect(p.resolucao?.cedidas?.map((c) => c.prioridade)).toEqual(["média"]);
  });

  it("não troca por igual: média não cede para cobrir média", async () => {
    await bloco("rFalta", "fa", "tSala", "ls");
    await bloco("rMedia", "fb", "tSala", "ls");
    await bloco("rAlta", "fc", "tBanheiro", "lb");
    expect((await proposta()).resolucao).toBeUndefined();
  });

  it("crítica nunca é cedida, nem bloco já realizado", async () => {
    const d = await ds();
    await d.atualizar("tarefas", "tEscada", { critica: true });
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rCritica", "fc", "tEscada", "le");
    await bloco("rFeito", "fb", "tSala", "ls");
    await d.criar("execucoes_realizadas", {
      id: "e1", rotina_id: "rFeito", sede_id: SEDE, data_execucao: hoje, status_realizado: "conforme_planejado",
      inicio_real: "10:00", fim_real: "10:30", tempo_real_min: 30, justificativa: "", observacao: "", epis_confirmados: "",
      supervisor_id: "c1", criado_em: "", atualizado_em: "",
    });
    expect((await proposta()).resolucao).toBeUndefined();
  });

  it("a prioridade escrita na tarefa vence o tipo do local", async () => {
    const d = await ds();
    await d.atualizar("tarefas", "tSala", { prioridade: "baixa" }); // a sala de judô sem aula hoje
    await d.atualizar("tarefas", "tEscada", { prioridade: "alta" });
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rSala", "fb", "tSala", "ls");
    await bloco("rEscada", "fc", "tEscada", "le");
    const p = await proposta();
    expect(p.resolucao?.funcionario_id).toBe("fb");
  });

  it("confirmar: a cedida vira remanejada com o motivo, sai da ocupação, e a falta é coberta", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await resolverProximaExcecao(COORD, "rFalta", "fc", ["rBaixa"], SEDE);
    const d = await ds();
    expect((await d.obter("rotinas_planejadas", "rFalta"))?.funcionario_id).toBe("fc");
    expect((await d.obter("rotinas_planejadas", "rBaixa"))?.status).toBe("remanejada");
    const [exec] = await d.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: "rBaixa" }]);
    expect(exec.status_realizado).toBe("remanejada");
    expect(exec.justificativa).toContain("Cedida para cobrir");
    const doDia = await d.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: "fc" }]);
    expect(tempoPlanejadoMin(doDia)).toBe(30); // só a que assumiu
    expect((await proposta()).id).not.toBe("agenda-indisponivel");
  });

  it("recusa se as cedidas não são as que a tela mostrou, e não grava nada", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await expect(resolverProximaExcecao(COORD, "rFalta", "fc", [], SEDE)).rejects.toBeInstanceOf(ErroValidacao);
    const d = await ds();
    expect((await d.obter("rotinas_planejadas", "rBaixa"))?.status).toBe("planejada");
    expect((await d.obter("rotinas_planejadas", "rFalta"))?.funcionario_id).toBe("fa");
  });
});

/**
 * "Pode ser qualquer horário" (decisão do dono, 26/10/2026): sem ninguém com
 * baixa/média no horário da falta, a tarefa vai para onde alguém tenha só
 * prioridade menor somando o tempo — ex.: duas baixas às 13:30.
 */
describe("troca por prioridade em outro horário", () => {
  const baixa15 = (id: string, inicio: string, fim: string) =>
    bloco(id, "fc", "tEscada", "le", { inicio_planejado: inicio, fim_planejado: fim, tempo_previsto_min: 15, tempo_visual_min: 15 });

  it("ninguém cede no horário da falta: propõe às 13:30, onde duas baixas somam o tempo", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await baixa15("rB1", "13:30", "13:45");
    await baixa15("rB2", "13:45", "14:00");
    await bloco("rAltaDepois", "fc", "tBanheiro", "lb", { inicio_planejado: "14:00", fim_planejado: "14:30" });
    const p = await proposta();
    expect(p.resolucao).toMatchObject({
      tipo: "trocar_por_prioridade",
      funcionario_id: "fc",
      inicio_planejado: "13:30",
      fim_planejado: "14:00",
      inicio_original: "10:00",
    });
    expect(p.resolucao?.cedidas?.map((c) => c.rotina_id)).toEqual(["rB1", "rB2"]);
    expect(p.descricao).toContain("às 13:30 (era às 10:00)");
  });

  it("confirmar: a tarefa vai para o horário novo com quem assume, e as duas baixas viram remanejadas", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await baixa15("rB1", "13:30", "13:45");
    await baixa15("rB2", "13:45", "14:00");
    await bloco("rAltaDepois", "fc", "tBanheiro", "lb", { inicio_planejado: "14:00", fim_planejado: "14:30" });
    // Sem o horário visto, a troca em OUTRO horário não passa.
    await expect(resolverProximaExcecao(COORD, "rFalta", "fc", ["rB1", "rB2"], SEDE)).rejects.toBeInstanceOf(ErroValidacao);
    await resolverProximaExcecao(COORD, "rFalta", "fc", ["rB1", "rB2"], SEDE, "13:30");
    const d = await ds();
    expect(await d.obter("rotinas_planejadas", "rFalta")).toMatchObject({ funcionario_id: "fc", inicio_planejado: "13:30" });
    expect((await d.obter("rotinas_planejadas", "rB1"))?.status).toBe("remanejada");
    expect((await d.obter("rotinas_planejadas", "rB2"))?.status).toBe("remanejada");
  });

  it("cede o mínimo: uma baixa + tempo livre ganha de duas baixas", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await baixa15("rB1", "13:30", "13:45");
    await baixa15("rB2", "13:45", "14:00"); // depois das 14:00, livre
    const p = await proposta();
    expect(p.resolucao).toMatchObject({ inicio_planejado: "13:45", fim_planejado: "14:15" });
    expect(p.resolucao?.cedidas?.map((c) => c.rotina_id)).toEqual(["rB2"]);
  });

  it("o mesmo horário ganha quando a outra opção cede o mesmo", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rBaixaB", "fb", "tEscada", "le"); // baixa às 10:00, no horário da falta
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await bloco("rBaixaC", "fc", "tEscada", "le", { inicio_planejado: "13:30", fim_planejado: "14:00" });
    const p = await proposta();
    expect(p.resolucao).toMatchObject({ funcionario_id: "fb", inicio_planejado: "10:00" });
    expect(p.resolucao?.inicio_original).toBeUndefined();
  });

  it("empate em tudo (prioridade, minutos, carga): o mais perto do horário original ganha", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    // Pessoa B: alta às 10:00, baixa às 13:30. Pessoa C: baixa às 10:00, alta às 13:30.
    // As duas ficariam com a mesma carga; pelo nome, B viria antes.
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rBaixaB", "fb", "tEscada", "le", { inicio_planejado: "13:30", fim_planejado: "14:00" });
    await bloco("rBaixaC", "fc", "tEscada", "le");
    await bloco("rAltaC", "fc", "tBanheiro", "lb", { inicio_planejado: "13:30", fim_planejado: "14:00" });
    const p = await proposta();
    expect(p.resolucao).toMatchObject({ funcionario_id: "fc", inicio_planejado: "10:00" });
  });

  it("baixa em outro horário vence média no mesmo horário (baixa antes de média)", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rMediaB", "fb", "tSala", "ls");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await bloco("rBaixaC", "fc", "tEscada", "le", { inicio_planejado: "13:30", fim_planejado: "14:00" });
    const p = await proposta();
    expect(p.resolucao).toMatchObject({ funcionario_id: "fc", inicio_planejado: "13:30" });
  });

  it("A1 (auditoria): a proposta muda de horário entre a tela e o clique — recusa, e nada é gravado", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rBaixaC", "fc", "tEscada", "le", { inicio_planejado: "10:15", fim_planejado: "10:45" });
    const vista = (await proposta()).resolucao!;
    expect(vista).toMatchObject({ funcionario_id: "fc", inicio_planejado: "10:00" });
    // Antes do clique, alguém põe uma alta para C às 10:00: a mesma pessoa e a
    // mesma cedida agora caem às 10:15.
    await bloco("rAltaNova", "fc", "tBanheiro", "lb", { inicio_planejado: "10:00", fim_planejado: "10:15", tempo_previsto_min: 15, tempo_visual_min: 15 });
    expect((await proposta()).resolucao).toMatchObject({ funcionario_id: "fc", inicio_planejado: "10:15" });
    const ids = (vista.cedidas ?? []).map((c) => c.rotina_id);
    await expect(resolverProximaExcecao(COORD, "rFalta", "fc", ids, SEDE, vista.inicio_planejado)).rejects.toBeInstanceOf(ErroValidacao);
    await expect(resolverProximaExcecao(COORD, "rFalta", "fc", ids, SEDE)).rejects.toBeInstanceOf(ErroValidacao);
    const d = await ds();
    expect(await d.obter("rotinas_planejadas", "rFalta")).toMatchObject({ funcionario_id: "fa", inicio_planejado: "10:00" });
    expect((await d.obter("rotinas_planejadas", "rBaixaC"))?.status).toBe("planejada");
  });

  it("em outro horário, o fim mostrado é o que fica gravado (início + tempo previsto)", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb", { tempo_previsto_min: 20 }); // visual 30, previsto 20
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await baixa15("rB1", "13:30", "13:45");
    await baixa15("rB2", "13:45", "14:00");
    await bloco("rAltaDepois", "fc", "tBanheiro", "lb", { inicio_planejado: "14:00", fim_planejado: "14:30" });
    const vista = (await proposta()).resolucao!;
    expect(vista).toMatchObject({ inicio_planejado: "13:30", fim_planejado: "13:50" });
    await resolverProximaExcecao(COORD, "rFalta", vista.funcionario_id, (vista.cedidas ?? []).map((c) => c.rotina_id), SEDE, vista.inicio_planejado);
    expect(await (await ds()).obter("rotinas_planejadas", "rFalta")).toMatchObject({ inicio_planejado: "13:30", fim_planejado: "13:50" });
  });

  it("a janela da tarefa continua valendo: fora dela, não propõe", async () => {
    const d = await ds();
    await d.atualizar("tarefas", "tBanheiro", { janela_inicio: "09:30", janela_fim: "11:00" });
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await baixa15("rB1", "13:30", "13:45");
    await baixa15("rB2", "13:45", "14:00");
    expect((await proposta()).resolucao).toBeUndefined();
  });

  it("não propõe horário que já passou", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    // 09:30 já passou (são 10:00); a baixa nem é cedível, e o horário não serve.
    await bloco("rPassada", "fc", "tEscada", "le", { inicio_planejado: "09:30", fim_planejado: "10:00" });
    expect((await proposta()).resolucao).toBeUndefined();
  });

  it("se no meio da janela nova houver crítica ou alta, aquele horário não serve", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAltaB", "fb", "tBanheiro", "lb");
    await bloco("rAltaC", "fc", "tBanheiro", "lb");
    await baixa15("rB1", "13:30", "13:45");
    await bloco("rAltaTarde", "fc", "tBanheiro", "lb", { inicio_planejado: "13:45", fim_planejado: "14:15" });
    const p = await proposta();
    // 13:30 pegaria a alta das 13:45; 13:45 é a própria alta. Nada serve.
    expect(p.resolucao).toBeUndefined();
  });
});

describe("troca por prioridade — o que a revisão de segurança pediu", () => {
  it("remanejada que volta a planejada confere conflito de novo", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await resolverProximaExcecao(COORD, "rFalta", "fc", ["rBaixa"], SEDE);
    await expect(updateRotina("rBaixa", { status: "planejada" })).rejects.toBeInstanceOf(ErroValidacao);
    expect((await (await ds()).obter("rotinas_planejadas", "rBaixa"))?.status).toBe("remanejada");
  });

  it("não cede o que já começou (seria afirmar que não foi feito)", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb", { inicio_planejado: "07:00", fim_planejado: "07:30" });
    await bloco("rAlta", "fb", "tBanheiro", "lb", { inicio_planejado: "07:00", fim_planejado: "07:30" });
    await bloco("rBaixa", "fc", "tEscada", "le", { inicio_planejado: "07:00", fim_planejado: "07:30" });
    expect((await proposta()).resolucao).toBeUndefined();
  });

  it("tarefa que não se acha nunca é cedida", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rFantasma", "fc", "tNaoExiste", "le");
    expect((await proposta()).resolucao).toBeUndefined();
  });

  it("supervisor, visualizador e coordenador de outra sede não confirmam — e nada é gravado", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    for (const perfil of ["supervisor", "visualizador"] as const)
      await expect(resolverProximaExcecao({ ...COORD, perfil }, "rFalta", "fc", ["rBaixa"], SEDE)).rejects.toBeInstanceOf(ErroPermissao);
    const outra: SessaoUsuario = { ...COORD, sede_id: "christus_dt", sedes: ["christus_dt"] };
    await expect(resolverProximaExcecao(outra, "rFalta", "fc", ["rBaixa"], SEDE)).rejects.toBeInstanceOf(ErroValidacao);
    const d = await ds();
    expect((await d.obter("rotinas_planejadas", "rBaixa"))?.status).toBe("planejada");
    expect((await d.obter("rotinas_planejadas", "rFalta"))?.funcionario_id).toBe("fa");
  });
});

describe("troca por prioridade — o que a auditoria pediu", () => {
  it("falta percebida no meio do turno: a tarefa das 07:00 (por fazer) vai para um horário que ainda vem", async () => {
    // Até 26/10 o bloco que já tinha começado era pulado — no horário dele
    // ninguém podia ceder. Com a troca em qualquer horário, ele é feito mais
    // tarde, no lugar de uma baixa que ainda não começou.
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z")); // 09:00 em Fortaleza
    // Já começou (08:45) e ninguém fez; previsto = duração do bloco (30 min).
    await bloco("rFalta", "fa", "tBanheiro", "lb", { inicio_planejado: "08:45", fim_planejado: "09:15" });
    await bloco("rBaixa", "fc", "tEscada", "le", { inicio_planejado: "09:30", fim_planejado: "10:00" });
    const p = await proposta();
    expect(p.resolucao).toMatchObject({
      rotina_id: "rFalta", funcionario_id: "fc", inicio_planejado: "09:30", fim_planejado: "10:00", inicio_original: "08:45",
    });
    expect(p.resolucao?.cedidas?.map((c) => c.rotina_id)).toEqual(["rBaixa"]);
  });

  it("tarefa que já começou e é longa demais para caber depois (invade o intervalo) não é movida", async () => {
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z")); // 09:00
    // 07:00–09:30 com previsto de 150 min: às 10:00 iria até 12:30, por cima do almoço das 11:30.
    await bloco("rFalta7", "fa", "tBanheiro", "lb", { inicio_planejado: "07:00", fim_planejado: "09:30", tempo_previsto_min: 150, tempo_visual_min: 150 });
    await bloco("rBaixa10", "fc", "tEscada", "le");
    const p = await proposta();
    expect(p.resolucao?.rotina_id).not.toBe("rFalta7");
  });

  it("não propõe mover bloco que já terminou, mesmo com alguém livre naquela hora", async () => {
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z")); // 09:00 em Fortaleza
    await bloco("rPassado", "fa", "tBanheiro", "lb", { inicio_planejado: "07:00", fim_planejado: "08:00" });
    await bloco("rFalta10", "fa", "tBanheiro", "lb");
    const p = await proposta();
    expect(p.resolucao?.tipo).toBe("redistribuir_rotina");
    expect(p.resolucao?.rotina_id).toBe("rFalta10");
  });

  it("registrar o realizado na cedida não a põe de volta por cima de outra", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await resolverProximaExcecao(COORD, "rFalta", "fc", ["rBaixa"], SEDE);
    vi.setSystemTime(new Date("2026-10-19T13:40:00Z")); // 10:40, depois do horário
    const feita = {
      rotina_id: "rBaixa", data_execucao: hoje, status_realizado: "conforme_planejado" as const, inicio_real: "10:00",
      fim_real: "10:30", tempo_real_min: 30, justificativa: "", observacao: "", supervisor_id: "c1", epis_confirmados: "",
    };
    await expect(registrarExecucao(feita, { perfil: "coordenador" })).rejects.toBeInstanceOf(ErroValidacao);
    expect((await (await ds()).obter("rotinas_planejadas", "rBaixa"))?.status).toBe("remanejada");
  });

  it("duplicar o dia da troca não leva a cedida para o outro dia", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await resolverProximaExcecao(COORD, "rFalta", "fc", ["rBaixa"], SEDE);
    const amanha = somarDias(hoje, 1);
    const res = await duplicarDia(hoje, [amanha], SEDE, "c1");
    expect(res.puladas).toBe(0); // a cedida nem é tentada (antes caía como "pulada" por conflito)
    const copiadas = (await (await ds()).consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: amanha }]))
      .filter((r) => r.sede_id === SEDE);
    expect(copiadas.some((r) => r.tarefa_id === "tEscada")).toBe(false);
    // ninguém fica com duas tarefas no mesmo horário
    const chaves = copiadas.map((r) => `${r.funcionario_id}@${r.inicio_planejado}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe("troca por prioridade — segunda auditoria e custo de leitura", () => {
  async function diaGeradoPelaRota() {
    const d = await ds();
    await d.excluir("ausencias", "aus1"); // a falta só é lançada depois de gerar o dia
    const base = somarDias(hoje, -7);
    await bloco("b1", "fa", "tBanheiro", "lb", { data: base });
    await bloco("b2", "fb", "tBanheiro", "lb", { data: base });
    await bloco("b3", "fc", "tEscada", "le", { data: base });
    await salvarModelo("Padrão", base, SEDE, "c1", { padrao: true });
    await gerarDiaDaRotaPadrao(SEDE, hoje, "c1");
    await d.criar("ausencias", {
      id: "aus2", funcionario_id: "fa", sede_id: SEDE, tipo: "falta", data_inicio: hoje, data_fim: hoje, observacao: "",
      criado_em: "", atualizado_em: "",
    } as never);
  }

  it("gerar o dia de novo depois da troca não recria a cedida", async () => {
    await diaGeradoPelaRota();
    const r = (await proposta()).resolucao!;
    expect(r.tipo).toBe("trocar_por_prioridade");
    await resolverProximaExcecao(COORD, r.rotina_id, r.funcionario_id, r.cedidas!.map((c) => c.rotina_id), SEDE);
    await gerarDiaDaRotaPadrao(SEDE, hoje, "c1");
    const d = await ds();
    expect((await d.obter("rotinas_planejadas", r.cedidas![0].rotina_id))?.status).toBe("remanejada");
    const doFc = (await d.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: "fc" }]))
      .filter((b) => b.data === hoje && ocupaHorario(b));
    expect(doFc.length).toBe(1); // só a tarefa que assumiu
  });

  it("não salva como modelo um dia com troca", async () => {
    await diaGeradoPelaRota();
    const r = (await proposta()).resolucao!;
    await resolverProximaExcecao(COORD, r.rotina_id, r.funcionario_id, r.cedidas!.map((c) => c.rotina_id), SEDE);
    await expect(salvarModelo("Outra", hoje, SEDE, "c1", { padrao: true })).rejects.toBeInstanceOf(ErroValidacao);
  });

  it("a Central lê tarefas e locais uma vez, mesmo tentando vários blocos", async () => {
    for (const [i, hora] of ["10:00", "10:30", "14:00"].entries()) {
      const fim = hora === "10:00" ? "10:30" : hora === "10:30" ? "11:00" : "14:30";
      await bloco(`f${i}`, "fa", "tBanheiro", "lb", { inicio_planejado: hora, fim_planejado: fim });
      await bloco(`b${i}`, "fb", "tBanheiro", "lb", { inicio_planejado: hora, fim_planejado: fim });
      await bloco(`c${i}`, "fc", "tBanheiro", "lb", { inicio_planejado: hora, fim_planejado: fim });
    }
    const d = await ds();
    const espiao = vi.spyOn(d, "consultar");
    expect((await proposta()).resolucao).toBeUndefined(); // tentou os 3 blocos, nenhum tem solução
    const lidas = (tabela: string) => espiao.mock.calls.filter(([t]) => t === tabela).length;
    expect(lidas("tarefas")).toBe(1);
    expect(lidas("locais")).toBe(1);
    espiao.mockRestore();
  });

  it("regerar o dia não desfaz um cancelamento vindo da rota", async () => {
    await diaGeradoPelaRota();
    const d = await ds();
    const doFb = (await d.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: "fb" }]))
      .find((b) => b.data === hoje)!;
    await updateRotina(doFb.id, { status: "cancelada" });
    await gerarDiaDaRotaPadrao(SEDE, hoje, "c1");
    expect((await d.obter("rotinas_planejadas", doFb.id))?.status).toBe("cancelada");
  });

  it("se a própria cedida é tarefa de espera, registrar o realizado não confere conflito", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await resolverProximaExcecao(COORD, "rFalta", "fc", ["rBaixa"], SEDE);
    await (await ds()).atualizar("tarefas", "tEscada", { espera: true });
    vi.setSystemTime(new Date("2026-10-19T13:40:00Z"));
    await registrarExecucao(
      {
        rotina_id: "rBaixa", data_execucao: hoje, status_realizado: "conforme_planejado", inicio_real: "10:00",
        fim_real: "10:30", tempo_real_min: 30, justificativa: "", observacao: "", supervisor_id: "c1", epis_confirmados: "",
      },
      { perfil: "coordenador" },
    );
    expect((await (await ds()).obter("rotinas_planejadas", "rBaixa"))?.status).toBe("realizada");
  });

  it("tarefa de espera não impede registrar o realizado da cedida", async () => {
    await bloco("rFalta", "fa", "tBanheiro", "lb");
    await bloco("rAlta", "fb", "tBanheiro", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await resolverProximaExcecao(COORD, "rFalta", "fc", ["rBaixa"], SEDE);
    await (await ds()).atualizar("tarefas", "tBanheiro", { espera: true }); // a que C assumiu é de espera
    vi.setSystemTime(new Date("2026-10-19T13:40:00Z"));
    await registrarExecucao(
      {
        rotina_id: "rBaixa", data_execucao: hoje, status_realizado: "conforme_planejado", inicio_real: "10:00",
        fim_real: "10:30", tempo_real_min: 30, justificativa: "", observacao: "", supervisor_id: "c1", epis_confirmados: "",
      },
      { perfil: "coordenador" },
    );
    expect((await (await ds()).obter("rotinas_planejadas", "rBaixa"))?.status).toBe("realizada");
  });
});

describe("prioridade efetiva e o horário que a remanejada libera", () => {
  it("nivelPrioridade: crítica > escrita na tarefa > tipo do local > média", () => {
    const t = (prioridade: Tarefa["prioridade"], critica = false) => ({ prioridade, critica });
    expect(nivelPrioridade(t("baixa", true), { tipo_local: "escada" })).toBe(4);
    expect(nivelPrioridade(t("baixa"), { tipo_local: "banheiro" })).toBe(1);
    expect(nivelPrioridade(t("alta"), { tipo_local: "escada" })).toBe(3);
    expect(nivelPrioridade(t("media"), { tipo_local: "banheiro" })).toBe(3);
    expect(nivelPrioridade(t("media"), { tipo_local: "escada" })).toBe(1);
    expect(nivelPrioridade(t("media"), { tipo_local: "tipo-criado-na-sede" as never })).toBe(2);
  });

  it("remanejada não ocupa: nem conta na ocupação nem bloqueia o horário", () => {
    const r = { status: "remanejada", inicio_planejado: "10:00", fim_planejado: "10:30", tempo_previsto_min: 30 } as RotinaPlanejada;
    expect(ocupaHorario(r)).toBe(false);
    expect(ocupaHorario({ status: "planejada" })).toBe(true);
    expect(tempoPlanejadoMin([r])).toBe(0);
    const alertas = validarAlocacao({
      funcionario: { nome: "X", entrada: "06:00", saida: "16:00", intervalo_min: 0 } as never,
      rotinasExistentes: [r], inicioMin: 600, fimMin: 630, tarefa: undefined, local: undefined,
      parametros: {} as never, tempoPrevistoNovo: 30, data: "2026-10-19",
    } as never);
    expect(alertas.some((a) => a.codigo === "SOBREPOSICAO")).toBe(false);
  });
});
