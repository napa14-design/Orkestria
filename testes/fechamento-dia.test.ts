/**
 * Fechar o dia por exceção — a metade do produto que **nunca rodou**.
 *
 * Em 7 semanas de piloto houve 0 execuções registradas, então esta função nunca
 * foi exercida em produção. Já teve dois bugs, os dois achados por medição e não
 * por teste (não havia nenhum):
 *
 * 1. `data >= hoje` juntava HOJE e FUTURO: um dia futuro usava a hora de agora
 *    como limite e **confirmava como realizado o que ainda não aconteceu** — 37
 *    blocos futuros foram confirmados assim.
 * 2. A checagem de `status` vinha antes da contagem, então um bloco com desvio
 *    **sumia das somas**: elas não fechavam com o total do dia e não havia como
 *    explicar a diferença.
 *
 * O teste que mais importa aqui é o último: **as quatro contas somadas têm de dar
 * o total de blocos do dia**. É a invariante que os dois bugs violaram.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { confirmarDiaComoPlanejado, getExecucoes } from "@/services/execucoesService";
import { MemoryDataSource, reiniciarBanco } from "@/lib/memoryStore";
import { hojeISO } from "@/lib/dateUtils";
import type { RotinaPlanejada } from "@/types";

const SEDE = "christus_dt";
const FUNC = "christus_f1";
const LOCAL = "christus_l1";
/** Do seed: `christus_t1` exige `rq3` (Luvas nitrílicas, tipo EPI). */
const TAREFA_COM_EPI = "christus_t1";

const ONTEM = "2026-08-19";
const FUTURO = "2099-01-05";

const aud = { criado_em: "2026-01-01T00:00:00.000Z", atualizado_em: "2026-01-01T00:00:00.000Z" };

let ds: MemoryDataSource;

/** Tarefa sem nenhum requisito — o caminho de um toque, sem declaração. */
async function tarefaSemEpi(id: string) {
  await ds.criar("tarefas", {
    id, nome_tarefa: "Sem EPI", tipo_tarefa: "Rota", local_id: LOCAL, sede_id: SEDE,
    regra_calculo: "fixo", tempo_base_min: 10, quantidade: 1, frequencia: "diaria",
    prioridade: "media", requisitos: "", ativo: true, observacoes: "",
    criado_por: "t", atualizado_por: "t", ...aud,
  });
  return id;
}

async function bloco(
  id: string, data: string, inicio: string, fim: string, tarefaId: string,
  extra: Partial<RotinaPlanejada> = {},
) {
  await ds.criar("rotinas_planejadas", {
    id, data, funcionario_id: FUNC, sede_id: SEDE, tarefa_id: tarefaId, local_id: LOCAL,
    inicio_planejado: inicio, fim_planejado: fim, tempo_previsto_min: 10,
    tempo_visual_min: 15, blocos_ocupados: 1, status: "planejada", observacao: "",
    supervisor_id: "sup", ...aud, ...extra,
  } as RotinaPlanejada);
}

/** A soma das quatro contas tem de bater com os blocos do dia. */
function somaFecha(res: Awaited<ReturnType<typeof confirmarDiaComoPlanejado>>, total: number) {
  expect(
    res.confirmadas + res.ja_registradas + res.aguardando_horario + res.sem_declaracao,
    `${JSON.stringify(res)} deveria somar ${total}`,
  ).toBe(total);
}

describe("confirmarDiaComoPlanejado", () => {
  beforeEach(async () => {
    reiniciarBanco();
    ds = new MemoryDataSource();
    // O seed traz rotinas de HOJE; elas atrapalhariam as contas de um dia só.
    for (const r of await ds.listar("rotinas_planejadas")) await ds.excluir("rotinas_planejadas", r.id);
  });

  it("dia passado: confirma o que estava planejado", async () => {
    const t = await tarefaSemEpi("t-sem-epi");
    await bloco("b1", ONTEM, "07:00", "07:10", t);
    await bloco("b2", ONTEM, "08:00", "08:10", t);

    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    expect(res.confirmadas).toBe(2);
    somaFecha(res, 2);

    const execs = await getExecucoes(ONTEM, ONTEM, SEDE);
    expect(execs).toHaveLength(2);
    expect(execs[0].status_realizado).toBe("conforme_planejado");
  });

  it("dia FUTURO não confirma nada — o bug dos 37 blocos", async () => {
    // Com `data >= hoje`, o futuro usava a hora de agora como limite e afirmava
    // como realizado o que ainda não tinha acontecido.
    const t = await tarefaSemEpi("t-sem-epi");
    await bloco("f1", FUTURO, "07:00", "07:10", t);
    await bloco("f2", FUTURO, "23:00", "23:10", t);

    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: FUTURO }, "sup");
    expect(res.confirmadas).toBe(0);
    expect(res.aguardando_horario).toBe(2);
    somaFecha(res, 2);
    expect(await getExecucoes(FUTURO, FUTURO, SEDE)).toHaveLength(0);
  });

  it("hoje: confirma o que já terminou e espera o que não terminou", async () => {
    const t = await tarefaSemEpi("t-sem-epi");
    const hoje = hojeISO();
    await bloco("h1", hoje, "00:01", "00:02", t); // já passou
    await bloco("h2", hoje, "23:58", "23:59", t); // ainda não

    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: hoje }, "sup");
    expect(res.confirmadas).toBe(1);
    expect(res.aguardando_horario).toBe(1);
    somaFecha(res, 2);
  });

  it("bloco com desvio registrado é CONTADO, não sumido — o bug das somas", async () => {
    // A checagem de status vinha antes da contagem: o bloco desaparecia das
    // quatro contas e a diferença ficava sem explicação.
    const t = await tarefaSemEpi("t-sem-epi");
    await bloco("d1", ONTEM, "07:00", "07:10", t, { status: "nao_realizada" });
    await bloco("d2", ONTEM, "08:00", "08:10", t);

    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    expect(res.confirmadas).toBe(1);
    expect(res.ja_registradas).toBe(1);
    somaFecha(res, 2);
  });

  it("não sobrescreve o que o supervisor já decidiu", async () => {
    const t = await tarefaSemEpi("t-sem-epi");
    await bloco("r1", ONTEM, "07:00", "07:10", t);
    await ds.criar("execucoes_realizadas", {
      id: "e1", rotina_id: "r1", data_execucao: ONTEM, sede_id: SEDE,
      status_realizado: "nao_realizada", inicio_real: "", fim_real: "", tempo_real_min: 0,
      justificativa: "Faltou material", observacao: "", supervisor_id: "sup",
      epis_confirmados: "", ...aud,
    } as never);

    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    expect(res.confirmadas).toBe(0);
    expect(res.ja_registradas).toBe(1);
    const execs = await getExecucoes(ONTEM, ONTEM, SEDE);
    expect(execs).toHaveLength(1);
    expect(execs[0].status_realizado).toBe("nao_realizada"); // intocado
  });

  it("tarefa que exige EPI não entra sem declaração", async () => {
    await bloco("e1", ONTEM, "07:00", "07:10", TAREFA_COM_EPI);
    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    expect(res.confirmadas).toBe(0);
    expect(res.sem_declaracao).toBe(1);
    somaFecha(res, 1);
    expect(await getExecucoes(ONTEM, ONTEM, SEDE)).toHaveLength(0);
  });

  it("com a declaração, entra e grava os NOMES dos EPIs", async () => {
    await bloco("e1", ONTEM, "07:00", "07:10", TAREFA_COM_EPI);
    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM, declararEpi: true }, "sup");
    expect(res.confirmadas).toBe(1);
    expect(res.epis_declarados.length).toBeGreaterThan(0);
    const execs = await getExecucoes(ONTEM, ONTEM, SEDE);
    expect(execs[0].epis_confirmados).toBe(res.epis_declarados.join(", "));
  });

  it("rodar duas vezes não duplica nem reconfirma", async () => {
    const t = await tarefaSemEpi("t-sem-epi");
    await bloco("i1", ONTEM, "07:00", "07:10", t);

    const um = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    const dois = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    expect(um.confirmadas).toBe(1);
    expect(dois.confirmadas).toBe(0);
    expect(dois.ja_registradas).toBe(1);
    somaFecha(dois, 1);
    expect(await getExecucoes(ONTEM, ONTEM, SEDE)).toHaveLength(1);
  });

  it("as somas fecham num dia misturado — a invariante que os dois bugs quebraram", async () => {
    const t = await tarefaSemEpi("t-sem-epi");
    await bloco("m1", ONTEM, "07:00", "07:10", t); // confirma
    await bloco("m2", ONTEM, "08:00", "08:10", t, { status: "nao_realizada" }); // já registrada
    await bloco("m3", ONTEM, "09:00", "09:10", TAREFA_COM_EPI); // sem declaração
    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    expect(res.confirmadas).toBe(1);
    expect(res.ja_registradas).toBe(1);
    expect(res.sem_declaracao).toBe(1);
    somaFecha(res, 3);
  });

  it("dia sem bloco nenhum devolve tudo zerado, sem quebrar", async () => {
    const res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "sup");
    somaFecha(res, 0);
    expect(res.epis_declarados).toEqual([]);
  });
});
