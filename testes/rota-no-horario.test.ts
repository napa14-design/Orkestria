/**
 * "Assume o posto de" com outro horário (13/11/2026): a rota anda junto com a
 * entrada de quem assume, na mesma ordem. Caso real: um posto da CESIU
 * (entra 12:00) vai para alguém que entra 09:00.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import { rotaNoHorario } from "@/lib/rotaNoHorario";
import { createFuncionario, substituirNoPosto } from "@/services/funcionariosService";
import { gerarDiaDaRotaPadrao, getModelos, salvarModelo } from "@/services/modelosService";
import { createRotina } from "@/services/rotinasService";
import type { Funcionario, ModeloRotinaItem } from "@/types";

const ficha = (p: Partial<Funcionario>) =>
  ({ intervalos: "", intervalo_inicio: "", intervalo_fim: "", intervalo_min: 0, escala: "seg_sab", ...p }) as Funcionario;

let n = 0;
const item = (inicio: string, dur: number, extra: Partial<ModeloRotinaItem> = {}): ModeloRotinaItem =>
  ({
    id: `i${++n}`, nome_modelo: "Rota padrão", sede_id: "s", funcionario_id: "velho", tarefa_id: `t${n}`,
    local_id: "l", inicio_planejado: inicio, duracao_min: dur, padrao: true, ...extra,
  }) as ModeloRotinaItem;

const rodar = (itens: ModeloRotinaItem[], antigo: Funcionario, novo: Funcionario) =>
  rotaNoHorario(itens, antigo, novo, (i) => i.duracao_min ?? 0);
const inicios = (r: ReturnType<typeof rodar>) => r.itens.map((a) => a.inicio);
const hhmmOk = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

// Quem sai: 12:00–21:00, jantar 16:00–17:00; sábado 07:00–11:00.
const QUEM_SAI = ficha({ entrada: "12:00", saida: "21:00", intervalos: "16:00-17:00", entrada_sabado: "07:00", saida_sabado: "11:00" });
// Quem assume: 09:00–18:00, almoço 12:00–13:00; mesmo sábado.
const NOVA = ficha({ entrada: "09:00", saida: "18:00", intervalos: "12:00-13:00", entrada_sabado: "07:00", saida_sabado: "11:00" });

describe("rotaNoHorario (regra pura)", () => {
  it("o caso da CESIU: anda 3h, contorna o almoço novo, a ordem não muda e cabe no dia", () => {
    const semana = ["12:00", "13:00", "14:00", "15:00", "17:00", "18:00", "19:00", "20:00"].map((h) => item(h, 60));
    const sabado = [item("07:00", 120, { dias_semana: "6" }), item("09:00", 120, { dias_semana: "6" })];
    const r = rodar([...semana, ...sabado], QUEM_SAI, NOVA);
    // 12:00 cai no almoço dela e vai para 13:00; a folga do jantar dele (13:00–14:00
    // depois de deslocado) absorve o atraso e o resto volta ao lugar.
    expect(inicios(r)).toEqual(["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "07:00", "09:00"]);
    expect(r.minutos).toBe(-180);
    expect(r.passamDaSaida).toBe(0);
  });

  it("o de todo dia que quem saiu NÃO fazia no sábado continua sem valer no sábado", () => {
    // Deslocado para 09:00, caberia no sábado 07–11 e somaria com a camada de sábado.
    const r = rodar([item("12:00", 60)], QUEM_SAI, NOVA);
    expect(r.itens[0].dias_semana).toBe("0,1,2,3,4,5");
    expect(r.itens[0].inicioSabado).toBeUndefined();
  });

  it("o de todo dia que quem saiu fazia no sábado vira cópia de sábado, pelo horário de sábado", () => {
    const antigo = ficha({ entrada: "07:00", saida: "16:00", entrada_sabado: "07:00", saida_sabado: "11:00" });
    const novo = ficha({ entrada: "09:00", saida: "18:00", entrada_sabado: "08:00", saida_sabado: "12:00" });
    const r = rodar([item("07:00", 60)], antigo, novo);
    expect(r.itens[0]).toMatchObject({ inicio: "09:00", dias_semana: "0,1,2,3,4,5", inicioSabado: "08:00" });
  });

  it("jornada menor: o que não cabe fica depois da saída, contado — nada some", () => {
    const antigo = ficha({ entrada: "07:00", saida: "17:00", intervalos: "12:00-13:00" });
    const novo = ficha({ entrada: "07:00", saida: "16:00", intervalos: "12:00-13:00" });
    const itens = ["07:00", "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"].map((h) => item(h, 60, { dias_semana: "1,2,3,4,5" }));
    const r = rodar(itens, antigo, novo);
    expect(r.itens).toHaveLength(9);
    expect(r.passamDaSaida).toBe(1);
  });

  it("o que se sobrepunha de propósito (tarefa de espera) mantém a distância", () => {
    const antigo = ficha({ entrada: "07:00", saida: "16:00" });
    const novo = ficha({ entrada: "08:00", saida: "17:00" });
    const r = rodar([item("07:00", 30, { dias_semana: "1" }), item("07:10", 10, { dias_semana: "1" }), item("07:30", 30, { dias_semana: "1" })], antigo, novo);
    expect(inicios(r)).toEqual(["08:00", "08:10", "08:30"]);
  });

  it("o sábado não perde tarefa por causa da pausa da SEMANA de quem assume (auditoria)", () => {
    // Mesma entrada; o lanche da semana dela empurra as 10:00 para 10:15–11:15, que
    // não caberia no sábado 07–11. O sábado tem de continuar com as duas, sem sobrepor.
    const antigo = ficha({ entrada: "07:00", saida: "16:00", entrada_sabado: "07:00", saida_sabado: "11:00" });
    const novo = ficha({ entrada: "07:00", saida: "16:00", intervalos: "09:00-09:15", entrada_sabado: "07:00", saida_sabado: "11:00" });
    const r = rodar([item("09:00", 60), item("10:00", 60)], antigo, novo);
    expect(inicios(r)).toEqual(["09:15", "10:15"]);
    expect(r.itens.map((a) => a.inicioSabado)).toEqual(["09:00", "10:00"]);
    expect(r.itens.every((a) => a.dias_semana === "0,1,2,3,4,5")).toBe(true);
  });

  it("no sábado a pausa não empurra para depois da saída — lá isso é sumir (auditoria)", () => {
    const antigo = ficha({ entrada: "07:00", saida: "16:00", entrada_sabado: "07:00", saida_sabado: "11:15", intervalos_sabado: "09:00-09:15" });
    // Saída 11:30: empurrado (09:45–11:45) passaria; o lugar deslocado (09:15) cabe, e é
    // ele que vale — não o "terminar na saída" (09:30), que é só para quando nem ele cabe.
    const novo = ficha({ entrada: "07:00", saida: "16:00", entrada_sabado: "07:00", saida_sabado: "11:30", intervalos_sabado: "09:30-09:45" });
    const r = rodar([item("07:00", 120, { dias_semana: "6" }), item("09:15", 120, { dias_semana: "6" })], antigo, novo);
    // Fica por cima do lanche (a agenda acusa), e não 09:45–11:45, que a geração descartaria.
    expect(inicios(r)).toEqual(["07:00", "09:15"]);
  });

  it("sábado de quem assume MAIS CURTO: o que não cabe é puxado para terminar na saída, não some (pedido do dono)", () => {
    const antigo = ficha({ entrada: "07:00", saida: "16:00", entrada_sabado: "07:00", saida_sabado: "11:00" });
    const novo = ficha({ entrada: "07:00", saida: "16:00", entrada_sabado: "07:00", saida_sabado: "10:00" });
    const r = rodar([item("07:00", 60, { dias_semana: "6" }), item("09:00", 120, { dias_semana: "6" })], antigo, novo);
    // 09:00–11:00 seria descartado pela geração (fora do sábado 07–10): vai para 08:00–10:00.
    expect(inicios(r)).toEqual(["07:00", "08:00"]);
    expect(r.naoCabemNoSabado).toBe(0);
    // Só o que é maior que o sábado inteiro não tem como caber — e é contado.
    expect(rodar([item("07:00", 240, { dias_semana: "6" })], antigo, novo).naoCabemNoSabado).toBe(1);
  });

  it("o que quem saiu NÃO fazia no sábado (já caía fora) não é puxado para dentro (reauditoria)", () => {
    const igual = ficha({ entrada: "07:00", saida: "16:00", entrada_sabado: "07:00", saida_sabado: "11:00" });
    // 11:00+60 já passava da saída de sábado dele: a geração descartava. Com o mesmo
    // horário, nada muda; com outra entrada na semana, o sábado não ganha a tarefa.
    const itens = () => [item("09:00", 120, { dias_semana: "6" }), item("11:00", 60, { dias_semana: "6" })];
    const r = rodar(itens(), igual, igual);
    expect(inicios(r)).toEqual(["09:00", "11:00"]);
    expect(r.naoCabemNoSabado).toBe(0);
    const outraEntrada = ficha({ entrada: "09:00", saida: "18:00", entrada_sabado: "07:00", saida_sabado: "11:00" });
    expect(inicios(rodar(itens(), igual, outraEntrada))).toEqual(["09:00", "11:00"]);
  });

  it("deslocamento grande não sai do relógio", () => {
    const antigo = ficha({ entrada: "06:00", saida: "15:00" });
    const novo = ficha({ entrada: "20:00", saida: "23:59" });
    const r = rodar([item("14:00", 60, { dias_semana: "1" })], antigo, novo);
    expect(hhmmOk(r.itens[0].inicio)).toBe(true);
  });

  it("evento e item fora da rota padrão não mexem; mesmo horário não muda nada", () => {
    const evento = item("07:00", 60, { evento: true } as Partial<ModeloRotinaItem>);
    const avulso = item("08:00", 60, { padrao: false });
    expect(inicios(rodar([evento, avulso], QUEM_SAI, NOVA))).toEqual(["07:00", "08:00"]);
    const igual = rodar([item("12:00", 60), item("13:00", 60)], QUEM_SAI, QUEM_SAI);
    expect(inicios(igual)).toEqual(["12:00", "13:00"]);
    expect(igual.itens.every((a) => a.dias_semana === undefined && !a.inicioSabado)).toBe(true);
  });
});

describe("substituirNoPosto com outro horário", () => {
  beforeEach(() => reiniciarBanco());
  const SEDE = "christus_dt";
  const ANTIGO = "christus_f1"; // Aurilene, do seed: entra 06:00
  let d = somarDias(hojeISO(), 7);
  while (new Date(`${d}T12:00:00`).getDay() !== 1) d = somarDias(d, 1);
  const ANTES = d;
  const CORTE = somarDias(ANTES, 1);
  const DEPOIS = somarDias(ANTES, 2);

  it("a rota e o bloco já gerado andam juntos, e gerar de novo não duplica", async () => {
    await createRotina(
      { data: ANTES, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    expect((await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1")).geradas).toBe(1);
    const nova = await createFuncionario(
      { nome: "Quem assume", sede_id: SEDE, turno: "integral", entrada: "09:00", saida: "19:00", ativo: true } as never,
      "t@t.com",
    );

    const r = await substituirNoPosto(nova.id, ANTIGO, CORTE, "t@t.com");

    const ds = await getDataSource();
    const [doItem] = await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: nova.id }]);
    expect(doItem.inicio_planejado).toBe("10:00"); // 07:00 + 3h
    expect(r.ajusteHorario?.minutos).toBe(180);
    const [doDia] = await ds.consultar("rotinas_planejadas", [
      { campo: "funcionario_id", op: "==", valor: nova.id },
      { campo: "data", op: "==", valor: DEPOIS },
    ]);
    expect(doDia).toMatchObject({ inicio_planejado: "10:00", origem_item_id: doItem.id, origem_inicio: "10:00" });
    // Sem o bloco apontar para o item novo, a geração criava outro ao lado.
    expect((await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1")).geradas).toBe(0);
  });

  it("bloco SEM vínculo com a rota (aplicar modelo, à mão, importação) também anda — gerar não duplica (auditoria)", async () => {
    await createRotina(
      { data: ANTES, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    // O dia de DEPOIS montado à mão, no horário da rota: sem `origem_item_id`.
    await createRotina(
      { data: DEPOIS, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    const nova = await createFuncionario(
      { nome: "Quem assume", sede_id: SEDE, turno: "integral", entrada: "09:00", saida: "19:00", ativo: true } as never,
      "t@t.com",
    );
    await substituirNoPosto(nova.id, ANTIGO, CORTE, "t@t.com");
    await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1");
    const ds = await getDataSource();
    const doDia = await ds.consultar("rotinas_planejadas", [
      { campo: "funcionario_id", op: "==", valor: nova.id },
      { campo: "data", op: "==", valor: DEPOIS },
    ]);
    expect(doDia.map((b) => b.inicio_planejado)).toEqual(["10:00"]);
  });

  it("bloco ligado a item que já não existe (rota salva de novo) também anda — gerar não duplica (reauditoria)", async () => {
    await createRotina(
      { data: ANTES, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1");
    const ds = await getDataSource();
    // A rota é salva de novo com outra chave: o item ganha outro id e o bloco aponta para o velho.
    const [velho] = await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: ANTIGO }]);
    await ds.excluir("modelos_rotina", velho.id);
    await ds.criar("modelos_rotina", { ...velho, id: `outra-chave-${ANTIGO}` } as never);
    expect((await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1")).geradas).toBe(0); // controle: ainda casa pela chave
    const nova = await createFuncionario(
      { nome: "Quem assume", sede_id: SEDE, turno: "integral", entrada: "09:00", saida: "19:00", ativo: true } as never,
      "t@t.com",
    );
    await substituirNoPosto(nova.id, ANTIGO, CORTE, "t@t.com");
    await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1");
    const doDia = await ds.consultar("rotinas_planejadas", [
      { campo: "funcionario_id", op: "==", valor: nova.id },
      { campo: "data", op: "==", valor: DEPOIS },
    ]);
    expect(doDia.map((b) => b.inicio_planejado)).toEqual(["10:00"]);
  });

  it("a busca do bloco sem vínculo ignora modelo de EVENTO com a mesma tarefa e horário (reauditoria)", async () => {
    const ds = await getDataSource();
    await ds.criar("modelos_rotina", {
      id: `ev_${ANTIGO}_t1`, nome_modelo: "Evento", sede_id: SEDE, funcionario_id: ANTIGO, tarefa_id: "christus_t1",
      local_id: "christus_l1", inicio_planejado: "07:00", duracao_min: 55, evento: true, criado_por: "t", criado_em: "",
    } as never);
    await createRotina(
      { data: ANTES, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await createRotina(
      { data: DEPOIS, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    const nova = await createFuncionario(
      { nome: "Quem assume", sede_id: SEDE, turno: "integral", entrada: "09:00", saida: "19:00", ativo: true } as never,
      "t@t.com",
    );
    await substituirNoPosto(nova.id, ANTIGO, CORTE, "t@t.com");
    await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1");
    const doDia = await ds.consultar("rotinas_planejadas", [
      { campo: "funcionario_id", op: "==", valor: nova.id },
      { campo: "data", op: "==", valor: DEPOIS },
    ]);
    expect(doDia.map((b) => b.inicio_planejado)).toEqual(["10:00"]);
  });

  it("item sem duração gravada usa o tempo da tarefa COM o local (por m²) e não cai no almoço (auditoria)", async () => {
    const ds = await getDataSource();
    await ds.atualizar("tarefas", "christus_t1", { regra_calculo: "por_m2", tempo_base_min: 1 }); // local de 50 m²
    await ds.criar("modelos_rotina", {
      id: "item-sem-duracao", nome_modelo: "Rota padrão", sede_id: SEDE, funcionario_id: ANTIGO, tarefa_id: "christus_t1",
      local_id: "christus_l1", inicio_planejado: "08:30", padrao: true, criado_por: "t", criado_em: "",
    } as never);
    const nova = await createFuncionario(
      { nome: "Quem assume", sede_id: SEDE, turno: "integral", entrada: "09:00", saida: "19:00", intervalos: "12:00-13:00", ativo: true } as never,
      "t@t.com",
    );
    await substituirNoPosto(nova.id, ANTIGO, CORTE, "t@t.com");
    const [doItem] = await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: nova.id }]);
    // 08:30 + 3h = 11:30; com ~50 min atravessaria o almoço: vai para 13:00.
    expect(doItem.inicio_planejado).toBe("13:00");
  });

  it("a camada de todo dia que ganhou item só de sábado continua 'todo dia' na lista de modelos (auditoria)", async () => {
    const ds = await getDataSource();
    const base = { nome_modelo: "Camada X", sede_id: SEDE, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", padrao: true, criado_por: "t", criado_em: "" };
    await ds.criar("modelos_rotina", { ...base, id: "x1", inicio_planejado: "07:00", dias_semana: "" } as never);
    await ds.criar("modelos_rotina", { ...base, id: "x2", inicio_planejado: "08:00", dias_semana: "0,1,2,3,4,5" } as never);
    await ds.criar("modelos_rotina", { ...base, id: "x3", inicio_planejado: "07:00", dias_semana: "6" } as never);
    await ds.criar("modelos_rotina", { ...base, nome_modelo: "Camada Y", id: "y1", inicio_planejado: "07:00", dias_semana: "1,3" } as never);
    await ds.criar("modelos_rotina", { ...base, nome_modelo: "Camada Y", id: "y2", inicio_planejado: "08:00", dias_semana: "5" } as never);
    // Dividida em itens que somam os 7 dias: também é "todo dia".
    await ds.criar("modelos_rotina", { ...base, nome_modelo: "Camada Z", id: "z1", inicio_planejado: "09:00", dias_semana: "0,1,2,3,4,5" } as never);
    await ds.criar("modelos_rotina", { ...base, nome_modelo: "Camada Z", id: "z2", inicio_planejado: "07:00", dias_semana: "6" } as never);
    const modelos = await getModelos(SEDE);
    expect(modelos.find((m) => m.nome_modelo === "Camada X")?.dias_semana).toBe("");
    expect(modelos.find((m) => m.nome_modelo === "Camada Z")?.dias_semana).toBe("");
    expect(modelos.find((m) => m.nome_modelo === "Camada Y")?.dias_semana).toBe("1,3,5");
  });

  it("bloco movido à mão muda de dono mas fica onde a mão o pôs", async () => {
    await createRotina(
      { data: ANTES, funcionario_id: ANTIGO, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await gerarDiaDaRotaPadrao(SEDE, DEPOIS, "u1");
    const ds = await getDataSource();
    const [gerado] = await ds.consultar("rotinas_planejadas", [
      { campo: "funcionario_id", op: "==", valor: ANTIGO },
      { campo: "data", op: "==", valor: DEPOIS },
    ]);
    await ds.atualizar("rotinas_planejadas", gerado.id, { inicio_planejado: "08:00", fim_planejado: "08:55" });
    const nova = await createFuncionario(
      { nome: "Quem assume", sede_id: SEDE, turno: "integral", entrada: "09:00", saida: "19:00", ativo: true } as never,
      "t@t.com",
    );
    await substituirNoPosto(nova.id, ANTIGO, CORTE, "t@t.com");
    const depois = await ds.obter("rotinas_planejadas", gerado.id);
    expect(depois).toMatchObject({ funcionario_id: nova.id, inicio_planejado: "08:00" });
  });
});
