/**
 * Remanejo automático da tarefa crítica de quem faltou, e crítica só em alguns dias
 * da semana (pedido da coordenação, 10/11/2026). Decisões do dono: remaneja ao
 * lançar a falta e ao gerar o dia; avisa na Central e na Agenda, com desfazer; se
 * ninguém pode assumir sem alerta, não mexe e destaca; a crítica escolhe os dias
 * da semana na própria tarefa.
 *
 * Sede sintética, com pessoas fictícias — o repo é público.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criticaNoDia, nivelPrioridade } from "@/lib/calculations";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import type { SessaoUsuario } from "@/lib/permissions";
import { reiniciarBanco } from "@/lib/memoryStore";
import {
  desfazerRemanejoAutomatico,
  desfazerRemanejosSemFalta,
  getCentralDia,
  remanejarCriticasDaAusencia,
  remanejarCriticasDeAusentes,
} from "@/services/centralDiaService";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { gerarDiaDaRotaPadrao, salvarModelo } from "@/services/modelosService";
import { duplicarDia } from "@/services/rotinasService";
import { createTarefa, updateTarefa } from "@/services/tarefasService";
import { registrarExecucao } from "@/services/execucoesService";
import { validarTarefa } from "@/lib/validations";
import type { RotinaPlanejada, Tarefa } from "@/types";
import { ocuparResto } from "./equipeCheia";

const SEDE = "s-ra";
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };
const SUPERVISOR: SessaoUsuario = { ...COORD, id: "s1", perfil: "supervisor" };

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
  await t("tCritica", "lb", { critica: true });
  await t("tSala", "ls");
  await t("tEscada", "le"); // baixa pelo tipo do local
  await t("tOcupado", "ls", { critica: true }); // o enchimento da equipe a 100%
}

async function falta(funcionario_id: string, data: string) {
  const d = await ds();
  return d.criar("ausencias", {
    id: `aus-${funcionario_id}-${data}`, funcionario_id, sede_id: SEDE, tipo: "falta", data_inicio: data, data_fim: data,
    observacao: "", criado_em: "", atualizado_em: "",
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

const encher = (data = hoje) => ocuparResto({ sede_id: SEDE, data, funcionarios: ["fb", "fc"], tarefa_id: "tOcupado", local_id: "ls" });
const obter = async (id: string) => (await ds()).obter("rotinas_planejadas", id);

beforeEach(async () => {
  // Segunda-feira, 07:00 em Fortaleza: a manhã inteira ainda vem.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
  reiniciarBanco();
  hoje = hojeISO();
  await montar();
});
afterEach(() => vi.useRealTimers());

describe("crítica em dias da semana", () => {
  it("sem dias marcados é crítica todo dia; com dias, só neles", () => {
    const todo = { critica: true, critica_dias: "" };
    const segSex = { critica: true, critica_dias: "1,5" };
    expect(criticaNoDia(todo, "2026-10-20")).toBe(true);
    expect(criticaNoDia(segSex, "2026-10-19")).toBe(true); // segunda
    expect(criticaNoDia(segSex, "2026-10-20")).toBe(false); // terça
    expect(criticaNoDia(segSex)).toBe(true); // sem dia: "é crítica em algum dia"
    expect(criticaNoDia({ critica: false, critica_dias: "1" }, "2026-10-19")).toBe(false);
  });

  it("fora do dia dela a tarefa volta à prioridade comum (e pode ceder lugar)", () => {
    const t = { critica: true, critica_dias: "5", prioridade: "media" as const };
    expect(nivelPrioridade(t, { tipo_local: "escada" }, "2026-10-19")).toBe(1);
    expect(nivelPrioridade(t, { tipo_local: "escada" }, "2026-10-23")).toBe(4);
  });

  it("o cadastro guarda só dias válidos, sem repetir, em ordem", async () => {
    const salvo = await updateTarefa("tCritica", { critica_dias: "5,1,9,1,x" } as never, "c@x.com");
    expect(salvo.critica_dias).toBe("1,5");
  });
});

describe("remanejo automático da crítica de quem faltou", () => {
  it("passa a crítica para quem está em tarefa menor, registra o que ela cedeu e avisa", async () => {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rSala", "fa", "tSala", "ls", { inicio_planejado: "11:00", fim_planejado: "11:30" });
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();

    const feitos = await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    expect(feitos).toHaveLength(1);
    expect(feitos[0].texto).toBe("Pessoa C assumiu “tCritica” às 10:00, que era de Pessoa A (ausente) no lugar de “tEscada”.");

    const movida = await obter("rCrit");
    expect(movida?.funcionario_id).toBe("fc");
    expect(movida?.titular_id).toBe("fa");
    expect(JSON.parse(movida!.remanejo_auto!)).toMatchObject({ de: "fa", inicio: "10:00" });
    expect((await obter("rBaixa"))?.status).toBe("remanejada");
    // A tarefa comum de quem faltou não é mexida: segue para a Central decidir.
    expect((await obter("rSala"))?.funcionario_id).toBe("fa");

    const central = await getCentralDia(COORD, SEDE);
    expect(central.remanejos_auto.map((a) => a.rotina_id)).toEqual(["rCrit"]);
  });

  it("dois remanejos ao mesmo tempo: um só acontece, e a cedida ganha um registro só", async () => {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    const [x, y] = await Promise.all([
      remanejarCriticasDeAusentes(SEDE, hoje, COORD),
      remanejarCriticasDeAusentes(SEDE, hoje, COORD),
    ]);
    expect(x.length + y.length).toBe(1);
    const registros = await (await ds()).consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: "rBaixa" }]);
    expect(registros).toHaveLength(1);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fc");
  });

  it("ao lançar a ausência, remaneja em cada dia dela que já tem agenda", async () => {
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    const ausencia = await falta("fa", hoje);
    const feitos = await remanejarCriticasDaAusencia(ausencia, COORD);
    expect(feitos.map((f) => f.rotina_id)).toEqual(["rCrit"]);
  });

  it("crítica só em outro dia da semana não é remanejada hoje", async () => {
    await (await ds()).atualizar("tarefas", "tCritica", { critica_dias: "2" }); // terça; hoje é segunda
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    expect(await remanejarCriticasDeAusentes(SEDE, hoje, COORD)).toEqual([]);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fa");
  });

  it("ninguém pode assumir sem alerta: não mexe, e a Central segue destacando", async () => {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await encher(); // B e C cheios de crítica: nada a ceder, ninguém livre
    expect(await remanejarCriticasDeAusentes(SEDE, hoje, COORD)).toEqual([]);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fa");
    const central = await getCentralDia(COORD, SEDE);
    expect(central.proxima.id).toBe("agenda-indisponivel");
    expect(central.remanejos_auto).toEqual([]);
  });

  it("não mexe no que já passou nem em dia passado", async () => {
    await falta("fa", hoje);
    await bloco("rCedo", "fa", "tCritica", "lb", { inicio_planejado: "06:30", fim_planejado: "07:00" });
    await bloco("rBaixa", "fc", "tEscada", "le", { inicio_planejado: "06:30", fim_planejado: "07:00" });
    await encher();
    expect(await remanejarCriticasDeAusentes(SEDE, hoje, COORD)).toEqual([]);
    expect(await remanejarCriticasDeAusentes(SEDE, somarDias(hoje, -1), COORD)).toEqual([]);
    expect((await obter("rCedo"))?.funcionario_id).toBe("fa");
    expect((await obter("rBaixa"))?.status).toBe("planejada");
  });
});

describe("desfazer o remanejo automático", () => {
  async function remanejado() {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb", { observacao: "nota antiga" });
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
  }

  it("a crítica volta para quem faltou e a cedida volta a ser do colega", async () => {
    await remanejado();
    await desfazerRemanejoAutomatico(COORD, "rCrit");
    const volta = await obter("rCrit");
    expect(volta).toMatchObject({ funcionario_id: "fa", inicio_planejado: "10:00", titular_id: "", observacao: "nota antiga" });
    // Fica a nota de "desfeito", para o automático não refazer.
    expect(JSON.parse(volta!.remanejo_auto!)).toMatchObject({ por: "c1" });
    expect((await obter("rBaixa"))?.status).toBe("planejada");
    const registros = await (await ds()).consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: "rBaixa" }]);
    expect(registros).toEqual([]);
    expect((await getCentralDia(COORD, SEDE)).remanejos_auto).toEqual([]);
  });

  it("quem cobria também falta: remaneja de novo, o dono original segue o titular e o desfazer volta um passo", async () => {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixaC", "fc", "tEscada", "le");
    await bloco("rBaixaB", "fb", "tEscada", "le");
    await encher();
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    const primeiro = (await obter("rCrit"))!.funcionario_id;
    const outro = primeiro === "fb" ? "fc" : "fb";

    await falta(primeiro, hoje);
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    const segunda = await obter("rCrit");
    expect(segunda).toMatchObject({ funcionario_id: outro, titular_id: "fa" });
    expect(JSON.parse(segunda!.remanejo_auto!)).toMatchObject({ de: primeiro, titular_antes: "fa" });

    await desfazerRemanejoAutomatico(COORD, "rCrit");
    const umPasso = await obter("rCrit");
    expect(umPasso).toMatchObject({ funcionario_id: primeiro, titular_id: "fa" });
    expect(JSON.parse(umPasso!.remanejo_auto!)).toMatchObject({ de: "fa" });

    await desfazerRemanejoAutomatico(COORD, "rCrit");
    const fim = await obter("rCrit");
    expect(fim).toMatchObject({ funcionario_id: "fa", titular_id: "" });
    expect(JSON.parse(fim!.remanejo_auto!)).toHaveProperty("desfeito_em");
  });

  it("supervisor não desfaz; tarefa sem remanejo automático não se desfaz", async () => {
    await remanejado();
    await expect(desfazerRemanejoAutomatico(SUPERVISOR, "rCrit")).rejects.toBeInstanceOf(ErroPermissao);
    await expect(desfazerRemanejoAutomatico(COORD, "rBaixa")).rejects.toBeInstanceOf(ErroValidacao);
  });

  it("marca forjada apontando cedida de outro dia: o desfazer não toca nela", async () => {
    await remanejado();
    const d = await ds();
    const ontem = somarDias(hoje, -1);
    await d.criar("rotinas_planejadas", { ...(await obter("rBaixa"))!, id: "rOutroDia", data: ontem, status: "remanejada" });
    await d.criar("execucoes_realizadas", {
      id: "eOutroDia", rotina_id: "rOutroDia", sede_id: SEDE, data_execucao: ontem, status_realizado: "remanejada",
      inicio_real: "", fim_real: "", tempo_real_min: 0, justificativa: "", observacao: "", epis_confirmados: "",
      supervisor_id: "c1", criado_em: "", atualizado_em: "",
    });
    const marca = JSON.parse((await obter("rCrit"))!.remanejo_auto!);
    marca.cedidas.push({ rotina_id: "rOutroDia", execucao_id: "eOutroDia", status: "planejada", tarefa_nome: "x" });
    await d.atualizar("rotinas_planejadas", "rCrit", { remanejo_auto: JSON.stringify(marca) });

    await desfazerRemanejoAutomatico(COORD, "rCrit");
    expect((await obter("rOutroDia"))?.status).toBe("remanejada");
    expect(await d.obter("execucoes_realizadas", "eOutroDia")).not.toBeNull();
  });

  it("coordenador de outra sede não desfaz", async () => {
    await remanejado();
    const outro: SessaoUsuario = { ...COORD, sede_id: "outra", sedes: ["outra"] };
    await expect(desfazerRemanejoAutomatico(outro, "rCrit")).rejects.toBeInstanceOf(ErroPermissao);
  });
});

describe("copiar o dia depois de um remanejo", () => {
  const copiaDeAmanha = async () => {
    const amanha = somarDias(hoje, 1);
    await duplicarDia(hoje, [amanha], SEDE, "c1");
    return (await ds()).consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: amanha }]);
  };

  it("remanejo que mudou o horário: a cópia devolve a crítica ao dono, no horário dele, sem aviso", async () => {
    await (await ds()).atualizar("tarefas", "tCritica", { qualquer_horario: true });
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    // Ninguém livre às 10:00, nada menor a ceder; B tem a tarde livre a partir das 14:00
    // (folga de sobra: a 100% da jornada a regra recusa por sobrecarga, como na Central).
    await ocuparResto({ sede_id: SEDE, data: hoje, funcionarios: ["fb", "fc"], tarefa_id: "tOcupado", local_id: "ls", livres: { fb: [["14:00", "16:00"]] } });
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    expect(await obter("rCrit")).toMatchObject({ funcionario_id: "fb", inicio_planejado: "14:00" });

    const critica = (await copiaDeAmanha()).filter((r) => r.tarefa_id === "tCritica");
    expect(critica).toHaveLength(1);
    expect(critica[0]).toMatchObject({ funcionario_id: "fa", inicio_planejado: "10:00", fim_planejado: "10:30", titular_id: "", remanejo_auto: "" });
  });

  it("a cedida que passa da faixa da cobertura volta ao colega na cópia", async () => {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixaC", "fc", "tEscada", "le", { inicio_planejado: "09:50", fim_planejado: "10:40", tempo_previsto_min: 50 });
    await encher();
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    expect(await obter("rCrit")).toMatchObject({ funcionario_id: "fc", inicio_planejado: "10:00" });
    expect((await obter("rBaixaC"))?.status).toBe("remanejada");

    const copia = await copiaDeAmanha();
    expect(copia.filter((r) => r.tarefa_id === "tEscada").map((r) => [r.funcionario_id, r.inicio_planejado])).toEqual([["fc", "09:50"]]);
    expect(copia.filter((r) => r.tarefa_id === "tCritica").map((r) => r.funcionario_id)).toEqual(["fa"]);
  });
});

describe("ao gerar o dia", () => {
  async function rotaComFaltaAmanha() {
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rComumA", "fa", "tSala", "ls", { inicio_planejado: "11:00", fim_planejado: "11:20", tempo_previsto_min: 20 });
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    await salvarModelo("Rota padrão", hoje, SEDE, "c@x.com", { padrao: true, comDuracao: true });
    const amanha = somarDias(hoje, 1);
    await falta("fa", amanha);
    return amanha;
  }

  it("a crítica de quem está ausente nasce no dia e já vai para outra pessoa", async () => {
    const amanha = await rotaComFaltaAmanha();
    const res = await gerarDiaDaRotaPadrao(SEDE, amanha, "c1", COORD);
    expect(res.remanejos).toHaveLength(1);
    const doDia = await (await ds()).consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: amanha }]);
    const critica = doDia.filter((r) => r.tarefa_id === "tCritica");
    expect(critica).toHaveLength(1);
    expect(critica[0]).toMatchObject({ funcionario_id: "fc", titular_id: "fa" });
  });

  it("sem quem gera (rotina interna), a crítica fica no ausente para a Central decidir", async () => {
    const amanha = await rotaComFaltaAmanha();
    const res = await gerarDiaDaRotaPadrao(SEDE, amanha, "c1");
    expect(res.remanejos).toBeUndefined();
    const doDia = await (await ds()).consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: amanha }]);
    expect(doDia.filter((r) => r.tarefa_id === "tCritica").map((r) => r.funcionario_id)).toEqual(["fa"]);
    // A tarefa comum de quem falta continua sem nascer, como sempre.
    expect(doDia.some((r) => r.funcionario_id === "fa" && r.tarefa_id !== "tCritica")).toBe(false);
  });
});

describe("o que a auditoria provou (regressão)", () => {
  async function remanejadoHoje() {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb", { fim_planejado: "10:30", tempo_previsto_min: 25 });
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fc");
  }

  it("o desfazer fica: outra falta lançada no dia não refaz o remanejo", async () => {
    await remanejadoHoje();
    await desfazerRemanejoAutomatico(COORD, "rCrit");
    await remanejarCriticasDaAusencia(await falta("fb", hoje), COORD);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fa");
    expect((await obter("rBaixa"))?.status).toBe("planejada");
  });

  it("o desfazer devolve o fim exato, mesmo fora de início + previsto", async () => {
    await remanejadoHoje();
    await desfazerRemanejoAutomatico(COORD, "rCrit");
    expect(await obter("rCrit")).toMatchObject({ inicio_planejado: "10:00", fim_planejado: "10:30" });
  });

  it("mexer na tarefa à mão depois do remanejo apaga a marca: some o aviso e o desfazer", async () => {
    await remanejadoHoje();
    const { updateRotina } = await import("@/services/rotinasService");
    await (await ds()).atualizar("rotinas_planejadas", "rBaixa", { status: "planejada" }); // abre espaço em C
    await updateRotina("rCrit", { inicio_planejado: "10:30", forcar: true });
    expect((await obter("rCrit"))?.remanejo_auto).toBe("");
    expect((await getCentralDia(COORD, SEDE)).remanejos_auto).toEqual([]);
    await expect(desfazerRemanejoAutomatico(COORD, "rCrit")).rejects.toBeInstanceOf(ErroValidacao);
  });

  it("crítica que só está no ausente conta como descoberta nas pendências", async () => {
    const { pendenciasDoDia } = await import("@/lib/pendencias");
    const t = (await (await ds()).obter("tarefas", "tCritica"))!;
    const b = (await bloco("rCrit", "fa", "tCritica", "lb"))!;
    const args = { tarefas: [t], rotinasDoDia: [b], historico: [], data: hoje, periodos: [] };
    expect(pendenciasDoDia(args).criticasSemCobertura).toEqual([]);
    expect(pendenciasDoDia({ ...args, ausentes: new Set(["fa"]) }).criticasSemCobertura.map((c) => c.tarefa.id)).toEqual(["tCritica"]);
  });

  describe("geração", () => {
    it("gerar, desfazer, gerar de novo: o remanejo não volta", async () => {
      await bloco("rCrit", "fa", "tCritica", "lb");
      await bloco("rBaixa", "fc", "tEscada", "le");
      await encher();
      await salvarModelo("Rota padrão", hoje, SEDE, "c@x.com", { padrao: true, comDuracao: true });
      const amanha = somarDias(hoje, 1);
      await falta("fa", amanha);
      await gerarDiaDaRotaPadrao(SEDE, amanha, "c1", COORD);
      const doDia = () => ds().then((d) => d.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: amanha }]));
      const critica = (await doDia()).find((r) => r.tarefa_id === "tCritica")!;
      expect(critica.funcionario_id).toBe("fc");
      await desfazerRemanejoAutomatico(COORD, critica.id);
      const res = await gerarDiaDaRotaPadrao(SEDE, amanha, "c1", COORD);
      expect(res.remanejos).toBeUndefined();
      const depois = (await doDia()).filter((r) => r.tarefa_id === "tCritica");
      expect(depois.map((r) => r.funcionario_id)).toEqual(["fa"]);
    });

    it("sábado: a crítica do ausente fora do horário de sábado não nasce (como a de quem está presente)", async () => {
      const d = await ds();
      for (const f of ["fa", "fb", "fc"])
        await d.atualizar("funcionarios", f, { escala: "seg_sab", entrada_sabado: "07:00", saida_sabado: "11:15", intervalos_sabado: "" });
      await bloco("rTardeA", "fa", "tCritica", "lb", { inicio_planejado: "14:00", fim_planejado: "14:30" });
      await bloco("rTardeB", "fb", "tCritica", "lb", { inicio_planejado: "14:30", fim_planejado: "15:00" });
      await salvarModelo("Rota padrão", hoje, SEDE, "c@x.com", { padrao: true, comDuracao: true });
      const sabado = somarDias(hoje, 5);
      await falta("fa", sabado);
      await gerarDiaDaRotaPadrao(SEDE, sabado, "c1", COORD);
      const doSabado = await d.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: sabado }]);
      expect(doSabado.filter((r) => r.tarefa_id === "tCritica")).toEqual([]);
    });

    it("a geração sombra conta a crítica do ausente como a geração real", async () => {
      const { projetarDiaSombra } = await import("@/services/modelosService");
      await bloco("rCrit", "fa", "tCritica", "lb");
      await bloco("rBaixa", "fc", "tEscada", "le");
      await encher();
      await salvarModelo("Rota padrão", hoje, SEDE, "c@x.com", { padrao: true, comDuracao: true });
      const amanha = somarDias(hoje, 1);
      await falta("fa", amanha);
      const sombra = await projetarDiaSombra(SEDE, amanha);
      const res = await gerarDiaDaRotaPadrao(SEDE, amanha, "c1");
      expect(sombra.materializaria).toBe(res.geradas);
    });
  });
});

describe("janela de horário e \"Qualquer horário\" (10/11/2026)", () => {
  it("a janela tem as duas pontas ou nenhuma, e o fim depois do início", () => {
    const base = { local_id: "l", nome_tarefa: "x", tempo_base_min: 10 };
    expect(validarTarefa({ ...base, janela_inicio: "06:30", janela_fim: "" }).map((a) => a.codigo)).toEqual(["JANELA_INCOMPLETA"]);
    expect(validarTarefa({ ...base, janela_inicio: "08:00", janela_fim: "07:00" }).map((a) => a.codigo)).toEqual(["JANELA_INVERTIDA"]);
    expect(validarTarefa({ ...base, janela_inicio: "06:30", janela_fim: "07:30" })).toEqual([]);
    expect(validarTarefa(base)).toEqual([]);
  });

  it("\"Qualquer horário\" apaga a janela e fica gravado como escolha; desmarcado exige a janela", async () => {
    const com = await updateTarefa("tCritica", { janela_inicio: "06:30", janela_fim: "07:30" }, "c@x.com");
    expect(com).toMatchObject({ janela_inicio: "06:30", janela_fim: "07:30" });
    const sem = await updateTarefa("tCritica", { qualquer_horario: true, janela_inicio: "06:30", janela_fim: "07:30" } as never, "c@x.com");
    expect(sem).toMatchObject({ janela_inicio: "", janela_fim: "", qualquer_horario: true });
    const comJanela = await updateTarefa("tCritica", { qualquer_horario: false, janela_inicio: "06:30", janela_fim: "07:30" } as never, "c@x.com");
    expect(comJanela).toMatchObject({ janela_inicio: "06:30", janela_fim: "07:30", qualquer_horario: false });
    // Pedido sem o campo (o "Aplicar sugestão", a importação) não mexe na escolha.
    expect(await updateTarefa("tCritica", { tempo_base_min: 12 }, "c@x.com")).toMatchObject({ qualquer_horario: false });
    await expect(updateTarefa("tCritica", { qualquer_horario: false, janela_inicio: "", janela_fim: "" } as never, "c@x.com")).rejects.toBeInstanceOf(ErroValidacao);
    const base = (await (await ds()).obter("tarefas", "tSala"))!;
    const { id: _i, sede_id: _s, criado_por: _c, criado_em: _e, atualizado_por: _p, atualizado_em: _a, ...dados } = base;
    const nova = await createTarefa({ ...dados, nome_tarefa: "nova", qualquer_horario: true } as never, "c@x.com");
    expect(nova.qualquer_horario).toBe(true);
  });

  it("crítica com janela só muda de horário dentro dela: fora, o automático não mexe", async () => {
    await (await ds()).atualizar("tarefas", "tCritica", { janela_inicio: "09:30", janela_fim: "11:00" });
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    // O único buraco é às 14:00, fora da janela; nada menor a ceder às 10:00.
    await ocuparResto({ sede_id: SEDE, data: hoje, funcionarios: ["fb", "fc"], tarefa_id: "tOcupado", local_id: "ls", livres: { fb: [["14:00", "16:00"]] } });
    expect(await remanejarCriticasDeAusentes(SEDE, hoje, COORD)).toEqual([]);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fa");
  });
});

describe("ausência apagada ou encurtada (decisão do dono, 10/11/2026)", () => {
  async function remanejadoHoje() {
    const aus = await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fc");
    return aus;
  }

  it("ainda faltando, nada volta", async () => {
    await remanejadoHoje();
    expect(await desfazerRemanejosSemFalta("fa", hoje, hoje)).toBe(0);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fc");
  });

  it("apagada a falta, a crítica volta ao dono e a cedida ao colega, sem travar um novo remanejo", async () => {
    const aus = await remanejadoHoje();
    await (await ds()).excluir("ausencias", aus.id);
    expect(await desfazerRemanejosSemFalta("fa", hoje, hoje)).toBe(1);
    expect(await obter("rCrit")).toMatchObject({ funcionario_id: "fa", titular_id: "", remanejo_auto: "" });
    expect((await obter("rBaixa"))?.status).toBe("planejada");
    // A falta volta: o automático remaneja de novo (não ficou "desfeito").
    await falta("fa", hoje);
    expect(await remanejarCriticasDeAusentes(SEDE, hoje, COORD)).toHaveLength(1);
  });
});

describe("supervisor no bloco remanejado (decisão do dono, 10/11/2026)", () => {
  it("marca \"não feita\" para quem assumiu; no \"Feita por\" a trava continua", async () => {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    vi.setSystemTime(new Date("2026-10-19T14:00:00Z")); // 11:00: a tarefa das 10:00 já terminou
    const reg = await registrarExecucao(
      {
        rotina_id: "rCrit", data_execucao: hoje, status_realizado: "nao_realizada", inicio_real: "", fim_real: "", tempo_real_min: 0,
        justificativa: "não deu tempo", observacao: "", supervisor_id: "s1", epis_confirmados: "",
      },
      { perfil: "supervisor" },
    );
    expect(reg.status_realizado).toBe("nao_realizada");

    // "Feita por" (titular sem marca do remanejo): a trava segue.
    await bloco("rFeitaPor", "fc", "tSala", "ls", { inicio_planejado: "06:00", fim_planejado: "06:30", titular_id: "fa" });
    await expect(
      registrarExecucao(
        {
          rotina_id: "rFeitaPor", data_execucao: hoje, status_realizado: "nao_realizada", inicio_real: "", fim_real: "", tempo_real_min: 0,
          justificativa: "x", observacao: "", supervisor_id: "s1", epis_confirmados: "",
        },
        { perfil: "supervisor" },
      ),
    ).rejects.toBeInstanceOf(ErroPermissao);
  });
});

describe("crítica sem janela e sem escolha (decisão do dono, 10/11/2026)", () => {
  async function soBuracoAsCatorze() {
    await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await ocuparResto({ sede_id: SEDE, data: hoje, funcionarios: ["fb", "fc"], tarefa_id: "tOcupado", local_id: "ls", livres: { fb: [["14:00", "16:00"]] } });
  }

  it("sem \"Qualquer horário\" escolhido, só troca de pessoa no mesmo horário: o buraco das 14:00 não serve", async () => {
    await soBuracoAsCatorze();
    expect(await remanejarCriticasDeAusentes(SEDE, hoje, COORD)).toEqual([]);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fa");
  });

  it("com \"Qualquer horário\" escolhido, pode ir para outro horário", async () => {
    await (await ds()).atualizar("tarefas", "tCritica", { qualquer_horario: true });
    await soBuracoAsCatorze();
    expect(await remanejarCriticasDeAusentes(SEDE, hoje, COORD)).toHaveLength(1);
    expect(await obter("rCrit")).toMatchObject({ funcionario_id: "fb", inicio_planejado: "14:00" });
  });

  it("a Central, onde alguém confirma, continua propondo outro horário", async () => {
    await soBuracoAsCatorze();
    const p = (await getCentralDia(COORD, SEDE)).proxima.resolucao;
    expect(p).toMatchObject({ funcionario_id: "fb", inicio_planejado: "14:00", inicio_original: "10:00" });
  });
});

describe("falta apagada à tarde (decisão do dono, 10/11/2026)", () => {
  it("só volta o que ainda vem: a crítica da manhã fica com quem assumiu", async () => {
    const aus = await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await bloco("rBaixa", "fc", "tEscada", "le");
    await encher();
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    vi.setSystemTime(new Date("2026-10-19T17:00:00Z")); // 14:00
    await (await ds()).excluir("ausencias", aus.id);
    expect(await desfazerRemanejosSemFalta("fa", hoje, hoje)).toBe(0);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fc");
    expect((await obter("rBaixa"))?.status).toBe("remanejada");
  });
});

describe("a escolha de horário é de quem clica (auditoria e segurança, 10/11/2026)", () => {
  it("a caixa da tarefa antiga sem escolha abre desmarcada e vazia; a nova vem marcada pelo formulário", async () => {
    const { escolhaDoHorario } = await import("@/lib/remanejoAuto");
    expect(escolhaDoHorario({})).toBeNull();
    expect(escolhaDoHorario({ janela_inicio: "", janela_fim: "" })).toBeNull();
    expect(escolhaDoHorario({ janela_inicio: "06:30", janela_fim: "07:30" })).toBe(false);
    expect(escolhaDoHorario({ qualquer_horario: true })).toBe(true);
    expect(escolhaDoHorario({ qualquer_horario: false, janela_inicio: "06:30", janela_fim: "07:30" })).toBe(false);
  });

  it("salvar a tarefa antiga sem mexer na caixa (null) não grava a escolha nem apaga a janela", async () => {
    await (await ds()).atualizar("tarefas", "tCritica", { janela_inicio: "06:30", janela_fim: "07:30" });
    for (const valor of [null, "true", 1, "1", {}]) {
      const salva = await updateTarefa("tCritica", { qualquer_horario: valor, critica_dias: "1" } as never, "c@x.com");
      expect(salva.qualquer_horario).toBeUndefined();
      expect(salva).toMatchObject({ janela_inicio: "06:30", janela_fim: "07:30" });
    }
  });

  it("falta apagada entre o horário de antes e o novo: não volta para um horário que já passou", async () => {
    await (await ds()).atualizar("tarefas", "tCritica", { qualquer_horario: true });
    const aus = await falta("fa", hoje);
    await bloco("rCrit", "fa", "tCritica", "lb");
    await ocuparResto({ sede_id: SEDE, data: hoje, funcionarios: ["fb", "fc"], tarefa_id: "tOcupado", local_id: "ls", livres: { fb: [["14:00", "16:00"]] } });
    await remanejarCriticasDeAusentes(SEDE, hoje, COORD);
    expect(await obter("rCrit")).toMatchObject({ funcionario_id: "fb", inicio_planejado: "14:00" });
    vi.setSystemTime(new Date("2026-10-19T14:00:00Z")); // 11:00: as 10:00 já passaram, as 14:00 não
    await (await ds()).excluir("ausencias", aus.id);
    expect(await desfazerRemanejosSemFalta("fa", hoje, hoje)).toBe(0);
    expect((await obter("rCrit"))?.funcionario_id).toBe("fb");
  });
});
