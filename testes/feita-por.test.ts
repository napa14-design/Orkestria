/**
 * "Feita por <colega>" — a tarefa de quem está ausente passa para quem cobriu,
 * já como feita (pedido do dono, 21/10/2026: supervisor e coordenador marcam no
 * Acompanhamento). Antes, o "Feita" creditava a quem faltou.
 *
 * É um poder novo do supervisor (mudar de quem é a tarefa), então os testes
 * passam PELA ROTA, com sessão simulada, e conferem o efeito no banco: em toda
 * recusa, a tarefa continua no nome do titular e sem registro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { RotinaPlanejada } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao }));
const { POST } = await import("@/app/api/execucoes/feita-por/route");

const SUP: SessaoUsuario = { id: "s1", nome: "Sup", email: "sup@x.com", perfil: "supervisor", sede_id: "christus_dt", sedes: ["christus_dt"] };
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_ald", sedes: ["christus_ald", "christus_dt"] };
/**
 * Último dia útil antes de hoje: a troca passa pela escala do colega, e "hoje −
 * 7" caía em fim de semana em parte dos dias — o teste quebraria sozinho.
 */
function diaUtilAnterior(diasAtras = 1): string {
  let d = somarDias(hojeISO(), -diasAtras);
  while ([0, 6].includes(new Date(`${d}T12:00:00`).getDay())) d = somarDias(d, -1);
  return d;
}
const PASSADO = diaUtilAnterior();
const TITULAR = "christus_f1";
const COLEGA = "christus_f2";

const pedir = (corpo: unknown) =>
  POST(new Request("http://x/api/execucoes/feita-por", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }));

async function bloco(extra: Partial<RotinaPlanejada> = {}): Promise<RotinaPlanejada> {
  const ds = await getDataSource();
  const r: RotinaPlanejada = {
    id: `r-${Math.random().toString(36).slice(2)}`, data: PASSADO, funcionario_id: TITULAR, sede_id: "christus_dt", tarefa_id: "christus_t2",
    local_id: "christus_l1", inicio_planejado: "08:00", fim_planejado: "08:20", tempo_previsto_min: 20,
    tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1",
    criado_em: "", atualizado_em: "", ...extra,
  };
  await ds.criar("rotinas_planejadas", r);
  return r;
}
async function ausente(funcionario_id: string, data = PASSADO) {
  const ds = await getDataSource();
  await ds.criar("ausencias", {
    id: `a-${funcionario_id}-${data}`, funcionario_id, sede_id: "christus_dt", tipo: "falta", data_inicio: data, data_fim: data,
    observacao: "", criado_por: "t", criado_em: "", atualizado_por: "t", atualizado_em: "",
  } as never);
}
/**
 * A tarefa continua do titular, planejada e sem registro — e, quando a recusa
 * vem antes da primeira escrita, nem o histórico registrou mexida nela.
 */
async function intacta(r: RotinaPlanejada, semEscrita = true) {
  const ds = await getDataSource();
  const agora = await ds.obter("rotinas_planejadas", r.id);
  expect(agora?.funcionario_id).toBe(r.funcionario_id);
  expect(agora?.status).toBe(r.status);
  expect(agora?.titular_id ?? "").toBe("");
  const regs = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: r.id }]);
  expect(regs).toHaveLength(0);
  if (semEscrita) {
    const hist = (await ds.listar("historico")).filter((h) => h.registro_id === r.id && h.acao !== "criar");
    expect(hist).toEqual([]);
  }
}

describe("POST /api/execucoes/feita-por", () => {
  beforeEach(() => {
    reiniciarBanco();
    sessao = SUP;
  });

  it("supervisor: a tarefa de quem faltou passa para o colega, já feita, com registro dele", async () => {
    const r = await bloco();
    await ausente(TITULAR);
    const resp = await pedir({ rotina_id: r.id, funcionario_id: COLEGA });
    expect(resp.status).toBe(201);
    const ds = await getDataSource();
    const agora = await ds.obter("rotinas_planejadas", r.id);
    expect(agora?.funcionario_id).toBe(COLEGA);
    expect(agora?.status).toBe("realizada");
    expect(agora?.observacao).toMatch(/Coberta por/u);
    const [reg] = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: r.id }]);
    expect(reg).toMatchObject({ status_realizado: "conforme_planejado", supervisor_id: "s1" });
  });

  it("coordenador, na sede extra dele, também marca", async () => {
    sessao = COORD;
    const r = await bloco();
    await ausente(TITULAR);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
  });

  it("recusa (e não mexe) quando o titular NÃO está ausente", async () => {
    const r = await bloco();
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(422);
    await intacta(r);
  });

  it("recusa colega inválido: o próprio titular, de outra sede, desligado, ausente, inexistente", async () => {
    const ds = await getDataSource();
    const base = await ds.obter("funcionarios", COLEGA);
    await ds.criar("funcionarios", { ...base!, id: "f-ald", sede_id: "christus_ald" });
    await ds.criar("funcionarios", { ...base!, id: "f-inativo", ativo: false });
    await ds.criar("funcionarios", { ...base!, id: "f-ausente" });
    await ausente("f-ausente");
    const r = await bloco();
    await ausente(TITULAR);
    for (const colega of [TITULAR, "f-ald", "f-inativo", "f-ausente", "nao-existe"]) {
      expect((await pedir({ rotina_id: r.id, funcionario_id: colega })).status, colega).toBe(422);
      await intacta(r);
    }
  });

  it("recusa tarefa já registrada, cancelada ou que ainda não terminou", async () => {
    await ausente(TITULAR);
    await ausente(TITULAR, hojeISO());
    const cancelada = await bloco({ status: "cancelada" });
    const futura = await bloco({ data: hojeISO(), inicio_planejado: "23:00", fim_planejado: "23:59" });
    for (const r of [cancelada, futura]) {
      expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(422);
      await intacta(r);
    }
    const feita = await bloco();
    expect((await pedir({ rotina_id: feita.id, funcionario_id: COLEGA })).status).toBe(201);
    // Segunda vez (duplo toque, outra aba): já decidida.
    expect((await pedir({ rotina_id: feita.id, funcionario_id: "christus_f3" })).status).toBe(422);
    expect((await (await getDataSource()).obter("rotinas_planejadas", feita.id))?.funcionario_id).toBe(COLEGA);
  });

  it("perfil e sede: visualizador, supervisor e coordenador de outra sede → 403, sem mexer", async () => {
    const r = await bloco();
    await ausente(TITULAR);
    for (const s of [
      { ...SUP, perfil: "visualizador" as const },
      { ...SUP, sede_id: "christus_ald", sedes: ["christus_ald"] },
      { ...COORD, sede_id: "christus_ald", sedes: ["christus_ald"] },
    ]) {
      sessao = s;
      expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(403);
      await intacta(r);
    }
    sessao = null;
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(401);
  });

  it("EPI: os nomes vêm do cadastro da tarefa; sem a declaração, recusa e devolve ao titular", async () => {
    const r = await bloco({ tarefa_id: "christus_t1" }); // t1 exige EPI (seed)
    await ausente(TITULAR);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA, declaro_epi: false })).status).toBe(422);
    await intacta(r);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA, declaro_epi: true, epis_confirmados: "inventado" })).status).toBe(201);
    const ds = await getDataSource();
    const [reg] = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: r.id }]);
    expect(reg.epis_confirmados).not.toMatch(/inventado/u);
    expect(reg.epis_confirmados.length).toBeGreaterThan(0);
  });

  it("corpo malformado ou id com cara de caminho → 400", async () => {
    for (const corpo of [{}, { rotina_id: 1, funcionario_id: COLEGA }, { rotina_id: "x", funcionario_id: ["y"] }, { rotina_id: "a/b/c", funcionario_id: COLEGA }])
      expect((await pedir(corpo)).status).toBe(400);
  });

  it("passa pelas regras da agenda: restrição de gênero e intervalo do colega recusam, sem escrever", async () => {
    const ds = await getDataSource();
    const base = await ds.obter("tarefas", "christus_t2");
    await ds.criar("tarefas", { ...base!, id: "t-fem", restricao_genero: "feminino" });
    await ausente(TITULAR);
    const feminina = await bloco({ tarefa_id: "t-fem" });
    expect((await pedir({ rotina_id: feminina.id, funcionario_id: "christus_f3" })).status).toBe(422); // f3 é homem
    await intacta(feminina);
    // f2 almoça 13:00–14:00: cobrir 13:00–13:20 cai no intervalo dela.
    const noAlmoco = await bloco({ inicio_planejado: "13:00", fim_planejado: "13:20" });
    expect((await pedir({ rotina_id: noAlmoco.id, funcionario_id: COLEGA })).status).toBe(422);
    await intacta(noAlmoco);
  });

  it("colega com tarefa planejada no mesmo horário: ele trocou uma pela outra — a dele vira remanejada", async () => {
    // Decisão do dono (21/10/2026): quase sempre o colega tem tarefa no horário.
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    const daColega = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3" });
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    expect((await ds.obter("rotinas_planejadas", r.id))?.funcionario_id).toBe(COLEGA);
    expect((await ds.obter("rotinas_planejadas", daColega.id))?.status).toBe("remanejada");
    const [cedida] = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: daColega.id }]);
    expect(cedida).toMatchObject({ status_realizado: "remanejada" });
    expect(cedida.justificativa).toMatch(/cobriu/u);
  });

  it("colega com tarefa JÁ registrada no horário: recusa, e nada muda (nem a dele)", async () => {
    const { POST: postExecucao } = await import("@/app/api/execucoes/route");
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    const daColega = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3" });
    await postExecucao(new Request("http://x/api/execucoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      rotina_id: daColega.id, data_execucao: daColega.data, status_realizado: "conforme_planejado", inicio_real: "08:00", fim_real: "08:20",
      tempo_real_min: 20, justificativa: "", observacao: "", epis_confirmados: "",
    }) }));
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(422);
    await intacta(r);
    expect((await ds.obter("rotinas_planejadas", daColega.id))?.status).toBe("realizada");
  });

  it("depois da cobertura, o supervisor não troca para 'não feita' (jogaria a falha no colega); o coordenador troca", async () => {
    const { POST: postExecucao } = await import("@/app/api/execucoes/route");
    const r = await bloco();
    await ausente(TITULAR);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    const naoFeita = () =>
      postExecucao(new Request("http://x/api/execucoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        rotina_id: r.id, data_execucao: r.data, status_realizado: "nao_realizada", inicio_real: "", fim_real: "", tempo_real_min: 0,
        justificativa: "não fez", observacao: "", epis_confirmados: "",
      }) }));
    expect((await naoFeita()).status).toBe(403);
    expect((await (await getDataSource()).obter("rotinas_planejadas", r.id))?.status).toBe("realizada");
    sessao = COORD;
    expect((await naoFeita()).status).toBe(201);
  });

  it("supervisor: no máximo 7 dias atrás; o coordenador corrige o resto", async () => {
    // Dia útil: em fim de semana a escala recusaria por outro motivo e o teste mentiria.
    const antiga = await bloco({ data: diaUtilAnterior(10) });
    await ausente(TITULAR, antiga.data);
    expect((await pedir({ rotina_id: antiga.id, funcionario_id: COLEGA })).status).toBe(422);
    await intacta(antiga);
    sessao = COORD;
    expect((await pedir({ rotina_id: antiga.id, funcionario_id: COLEGA })).status).toBe(201);
  });

  it("colega ausente por atestado: a recusa não revela o tipo da ausência (LGPD)", async () => {
    const ds = await getDataSource();
    await ausente(TITULAR);
    await ds.criar("ausencias", {
      id: "a-atestado", funcionario_id: COLEGA, sede_id: "christus_dt", tipo: "atestado", data_inicio: PASSADO, data_fim: PASSADO,
      observacao: "consulta médica", criado_por: "t", criado_em: "", atualizado_por: "t", atualizado_em: "",
    } as never);
    const r = await bloco();
    const resp = await pedir({ rotina_id: r.id, funcionario_id: COLEGA });
    expect(resp.status).toBe(422);
    expect(JSON.stringify(await resp.json())).not.toMatch(/atestado|médica/iu);
  });

  it("se o registro falhar depois da troca, tudo volta: tarefa ao titular e a do colega a planejada", async () => {
    const ds = await getDataSource();
    const r = await bloco();
    const daColega = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3" });
    await ausente(TITULAR);
    let n = 0;
    const original = ds.criar.bind(ds);
    // Deixa gravar a 1ª execução (a cedida) e derruba a 2ª (a da tarefa coberta).
    const espiao = vi.spyOn(ds, "criar").mockImplementation((async (tabela: string, registro: never) => {
      if (tabela === "execucoes_realizadas" && ++n === 2) throw new Error("rede caiu");
      return original(tabela as never, registro);
    }) as never);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(500);
    espiao.mockRestore();
    await intacta(r, false); // houve escrita (a troca), mas foi desfeita
    expect((await ds.obter("rotinas_planejadas", daColega.id))?.status).toBe("planejada");
    expect(await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: daColega.id }])).toHaveLength(0);
  });

  // ── Volta de revisão (21/10/2026): segurança bloqueou, auditoria reprovou ──

  /** Registros da rotina, lidos do banco. */
  const registrosDe = async (id: string) =>
    (await getDataSource()).consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: id }]);
  /** Tarefa do seed com uma marca a mais (crítica, espera…). */
  async function tarefaCom(id: string, extra: Record<string, unknown>) {
    const ds = await getDataSource();
    await ds.criar("tarefas", { ...(await ds.obter("tarefas", "christus_t3"))!, id, ...extra });
    return id;
  }

  it("grava como titular quem FALTOU, não quem cobriu", async () => {
    const r = await bloco();
    await ausente(TITULAR);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    expect((await (await getDataSource()).obter("rotinas_planejadas", r.id))?.titular_id).toBe(TITULAR);
  });

  it("tarefa longa do colega que só ENCOSTA na faixa continua dele, planejada — a troca aceita o choque", async () => {
    // A1 da segurança: cobrir 20 min remanejava um bloco de horas e o tirava da medição.
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco(); // 08:00–08:20
    const longa = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "07:00", fim_planejado: "09:00", tempo_previsto_min: 120 });
    const encosta = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "08:10", fim_planejado: "08:40" });
    const comecaAntes = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "07:40", fim_planejado: "08:10" });
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    expect((await ds.obter("rotinas_planejadas", r.id))?.funcionario_id).toBe(COLEGA);
    for (const fica of [longa, encosta, comecaAntes]) {
      expect((await ds.obter("rotinas_planejadas", fica.id))?.status).toBe("planejada");
      expect(await registrosDe(fica.id)).toHaveLength(0);
    }
  });

  it("crítica do colega inteira na faixa: recusa e manda ao coordenador — sem mexer em nada", async () => {
    // Decisão do dono (21/10/2026): ficando, o "Fechar o dia" confirmaria as duas no mesmo horário.
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    const critica = await bloco({ funcionario_id: COLEGA, tarefa_id: await tarefaCom("t-critica", { critica: true }), inicio_planejado: "08:00", fim_planejado: "08:10" });
    const comum = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "08:10", fim_planejado: "08:20" });
    const resp = await pedir({ rotina_id: r.id, funcionario_id: COLEGA });
    expect(resp.status).toBe(422);
    expect(JSON.stringify(await resp.json())).toMatch(/FEITA_POR_CRITICA/u);
    await intacta(r);
    for (const b of [critica, comum]) expect((await ds.obter("rotinas_planejadas", b.id))?.status).toBe("planejada");
    // Crítica que só ENCOSTA não recusa: fica com ele, como qualquer outra.
    const r2 = await bloco({ inicio_planejado: "10:00", fim_planejado: "10:20" });
    await bloco({ funcionario_id: COLEGA, tarefa_id: "t-critica", inicio_planejado: "10:10", fim_planejado: "10:40" });
    expect((await pedir({ rotina_id: r2.id, funcionario_id: COLEGA })).status).toBe(201);
  });

  it("dentro da faixa: espera fica; cancelada fica cancelada; tarefa de OUTRA pessoa não se mexe", async () => {
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    const espera = await bloco({ funcionario_id: COLEGA, tarefa_id: await tarefaCom("t-espera", { espera: true }), inicio_planejado: "08:10", fim_planejado: "08:20" });
    const cancelada = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", status: "cancelada" });
    const deOutra = await bloco({ funcionario_id: "christus_f3", tarefa_id: "christus_t3" });
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    for (const [b, status] of [[espera, "planejada"], [cancelada, "cancelada"], [deOutra, "planejada"]] as const) {
      expect((await ds.obter("rotinas_planejadas", b.id))?.status, b.tarefa_id).toBe(status);
      expect(await registrosDe(b.id)).toHaveLength(0);
    }
  });

  it("tarefa do colega com REGISTRO (mesmo com a rotina ainda planejada) recusa — e o registro continua lá", async () => {
    // R3: o filtro olhava só o status; remanejar sobrescrevia o registro e o desfazer o apagava.
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    const daColega = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3" });
    await ds.criar("execucoes_realizadas", {
      id: "ex-coord", rotina_id: daColega.id, sede_id: "christus_dt", data_execucao: PASSADO, status_realizado: "nao_realizada",
      inicio_real: "", fim_real: "", tempo_real_min: 0, justificativa: "do coordenador", epis_confirmados: "", observacao: "",
      supervisor_id: "c1", criado_em: "", atualizado_em: "",
    });
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(422);
    await intacta(r);
    expect((await registrosDe(daColega.id)).map((e) => e.justificativa)).toEqual(["do coordenador"]);
  });

  it("a própria tarefa com registro e status ainda planejado: já decidida", async () => {
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    await ds.criar("execucoes_realizadas", {
      id: "ex-antes", rotina_id: r.id, sede_id: "christus_dt", data_execucao: PASSADO, status_realizado: "nao_realizada",
      inicio_real: "", fim_real: "", tempo_real_min: 0, justificativa: "faltou", epis_confirmados: "", observacao: "",
      supervisor_id: "c1", criado_em: "", atualizado_em: "",
    });
    const resp = await pedir({ rotina_id: r.id, funcionario_id: COLEGA });
    expect(resp.status).toBe(422);
    expect(JSON.stringify(await resp.json())).toMatch(/FEITA_POR_JA_DECIDIDA/u);
    expect((await ds.obter("rotinas_planejadas", r.id))?.funcionario_id).toBe(TITULAR);
  });

  it("falha AO MUDAR O STATUS (o registro já gravou): o registro é apagado e a tarefa volta ao titular", async () => {
    // A3 da auditoria: sobrava um "conforme" no nome de quem faltou.
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    const daColega = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3" });
    const original = ds.atualizar.bind(ds);
    const espiao = vi.spyOn(ds, "atualizar").mockImplementation((async (tabela: string, id: string, dados: { status?: string }) => {
      if (tabela === "rotinas_planejadas" && id === r.id && dados.status === "realizada") throw new Error("rede caiu");
      return original(tabela as never, id, dados as never);
    }) as never);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(500);
    espiao.mockRestore();
    await intacta(r, false);
    expect((await ds.obter("rotinas_planejadas", daColega.id))?.status).toBe("planejada");
    expect(await registrosDe(daColega.id)).toHaveLength(0);
  });

  it("o desfazer não devolve ao titular se OUTRO pedido já passou a tarefa adiante", async () => {
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    const original = ds.criar.bind(ds);
    const espiao = vi.spyOn(ds, "criar").mockImplementation((async (tabela: string, registro: never) => {
      if (tabela === "execucoes_realizadas") {
        // Enquanto este pedido grava, um paralelo deixou a tarefa com outra pessoa.
        await ds.atualizar("rotinas_planejadas", r.id, { funcionario_id: "christus_f3" });
        throw new Error("rede caiu");
      }
      return original(tabela as never, registro);
    }) as never);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(500);
    espiao.mockRestore();
    expect((await ds.obter("rotinas_planejadas", r.id))?.funcionario_id).toBe("christus_f3");
  });

  it("falha ANTES da troca não apaga o registro que outro pedido gravou na tarefa", async () => {
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "08:05", fim_planejado: "08:15" });
    const original = ds.criar.bind(ds);
    const espiao = vi.spyOn(ds, "criar").mockImplementation((async (tabela: string, registro: never) => {
      if (tabela === "execucoes_realizadas" && (registro as { rotina_id: string }).rotina_id !== r.id) {
        // Enquanto este pedido remaneja a cedida, um paralelo registra a coberta.
        await original("execucoes_realizadas", {
          id: "ex-outro", rotina_id: r.id, sede_id: "christus_dt", data_execucao: PASSADO, status_realizado: "nao_realizada",
          inicio_real: "", fim_real: "", tempo_real_min: 0, justificativa: "do outro pedido", epis_confirmados: "", observacao: "",
          supervisor_id: "c1", criado_em: "", atualizado_em: "",
        } as never);
        throw new Error("rede caiu");
      }
      return original(tabela as never, registro);
    }) as never);
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(500);
    espiao.mockRestore();
    expect((await registrosDe(r.id)).map((e) => e.justificativa)).toEqual(["do outro pedido"]);
  });

  it("supervisor: 7 dias atrás passa, 8 recusa", async () => {
    // Escala "todos": o dia da semana não pode recusar por outro motivo.
    const ds = await getDataSource();
    await ds.atualizar("funcionarios", COLEGA, { escala: "todos" });
    await ds.atualizar("funcionarios", TITULAR, { escala: "todos" });
    for (const [dias, status] of [[7, 201], [8, 422]] as const) {
      const r = await bloco({ data: somarDias(hojeISO(), -dias) });
      await ausente(TITULAR, r.data);
      const resp = await pedir({ rotina_id: r.id, funcionario_id: COLEGA });
      expect(resp.status, `${dias} dias`).toBe(status);
      if (status === 422) expect(JSON.stringify(await resp.json())).toMatch(/FEITA_POR_ANTIGA/u);
    }
  });

  it("tarefa de hoje que ainda não terminou: a própria trava recusa (não a escala do colega)", async () => {
    const ds = await getDataSource();
    await ds.atualizar("funcionarios", COLEGA, { escala: "todos" });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(`${hojeISO()}T07:00:00-03:00`));
      const r = await bloco({ data: hojeISO() }); // 08:00–08:20, ainda por vir às 07:00
      await ausente(TITULAR, r.data);
      const resp = await pedir({ rotina_id: r.id, funcionario_id: COLEGA });
      expect(resp.status).toBe(422);
      expect(JSON.stringify(await resp.json())).toMatch(/AINDA_NAO_TERMINOU/u);
      await intacta(r);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supervisor não marca 'feita' na tarefa de quem está ausente pela porta comum; o coordenador pode", async () => {
    const { POST: postExecucao } = await import("@/app/api/execucoes/route");
    await ausente(TITULAR);
    const r = await bloco();
    const feita = () =>
      postExecucao(new Request("http://x/api/execucoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        rotina_id: r.id, data_execucao: r.data, status_realizado: "conforme_planejado", inicio_real: "08:00", fim_real: "08:20",
        tempo_real_min: 20, justificativa: "", observacao: "", epis_confirmados: "",
      }) }));
    const resp = await feita();
    expect(resp.status).toBe(422);
    expect(JSON.stringify(await resp.json())).toMatch(/TITULAR_AUSENTE/u);
    await intacta(r, false);
    sessao = COORD; // dia parcial (saiu mais cedo) é decisão dele
    expect((await feita()).status).toBe(201);
  });

  it("rotina que não existe e rotina de outra sede: a mesma resposta", async () => {
    const r = await bloco({ sede_id: "christus_ald" });
    await ausente(TITULAR);
    const fora = await pedir({ rotina_id: r.id, funcionario_id: COLEGA });
    const nada = await pedir({ rotina_id: "nao-existe", funcionario_id: COLEGA });
    expect([fora.status, nada.status]).toEqual([403, 403]);
    expect(await nada.json()).toEqual(await fora.json());
  });

  it("corpo que não é JSON → 400, não 500", async () => {
    for (const body of ["{quebrado", "null"])
      expect((await POST(new Request("http://x/api/execucoes/feita-por", { method: "POST", headers: { "Content-Type": "application/json" }, body }))).status).toBe(400);
  });

  it("'Repetir o dia' depois da cobertura: a cópia volta ao titular, sem titular_id nem a nota da ausência", async () => {
    // A2 da auditoria: a cópia levava o titular_id, e o supervisor não marcava "não feita" no dia novo.
    const { duplicarDia } = await import("@/services/rotinasService");
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco();
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    const DESTINO = "2099-01-05"; // segunda-feira
    await duplicarDia(PASSADO, [DESTINO], "christus_dt", "u1");
    const copia = (await ds.listar("rotinas_planejadas")).find((x) => x.data === DESTINO && x.tarefa_id === r.tarefa_id && x.inicio_planejado === r.inicio_planejado);
    expect(copia).toMatchObject({ funcionario_id: TITULAR, titular_id: "", status: "planejada" });
    expect(copia?.observacao).not.toMatch(/Coberta por/u);
  });

  it("'Repetir o dia': a tarefa que o colega cedeu para cobrir volta a ser dele na cópia", async () => {
    // B1 da 2ª auditoria: com a coberta voltando ao titular, a cedida (remanejada) sumia do dia copiado.
    const { duplicarDia } = await import("@/services/rotinasService");
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco(); // 08:00–08:20
    const cedida = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "08:05", fim_planejado: "08:15", tempo_previsto_min: 10 });
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    expect((await ds.obter("rotinas_planejadas", cedida.id))?.status).toBe("remanejada");
    // Remanejada de OUTRA pessoa no mesmo horário (troca da Central): continua fora da cópia.
    await bloco({ funcionario_id: "christus_f3", tarefa_id: "christus_t3", inicio_planejado: "08:05", fim_planejado: "08:15", status: "remanejada" });
    const DESTINO = "2099-01-05";
    await duplicarDia(PASSADO, [DESTINO], "christus_dt", "u1");
    const doDestino = (await ds.listar("rotinas_planejadas")).filter((x) => x.data === DESTINO);
    expect(doDestino.map((x) => `${x.funcionario_id} ${x.inicio_planejado} ${x.status}`).sort()).toEqual([
      `${TITULAR} 08:00 planejada`,
      `${COLEGA} 08:05 planejada`,
    ]);
  });

  it("salvar o dia coberto como rota padrão grava a ROTINA: a coberta no titular, a cedida no colega", async () => {
    // C1 da 3ª auditoria: o modelo levava a tarefa de quem faltou no nome de quem cobriu,
    // e o "Gerar" a montaria assim todo dia útil.
    const { salvarModelo } = await import("@/services/modelosService");
    const ds = await getDataSource();
    await ausente(TITULAR);
    const r = await bloco(); // 08:00–08:20
    await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "07:40", fim_planejado: "08:05" }); // só encosta
    const cedida = await bloco({ funcionario_id: COLEGA, tarefa_id: "christus_t3", inicio_planejado: "08:05", fim_planejado: "08:15", tempo_previsto_min: 10 });
    expect((await pedir({ rotina_id: r.id, funcionario_id: COLEGA })).status).toBe(201);
    expect((await ds.obter("rotinas_planejadas", cedida.id))?.status).toBe("remanejada");
    await salvarModelo("Rota padrão", PASSADO, "christus_dt", "c@x.com", { padrao: true, diasSemana: "1,2,3,4,5" });
    const itens = (await ds.listar("modelos_rotina")).filter((m) => m.nome_modelo === "Rota padrão" && m.sede_id === "christus_dt");
    expect(itens.map((m) => `${m.funcionario_id} ${m.inicio_planejado}`).sort()).toEqual(
      [`${COLEGA} 07:40`, `${COLEGA} 08:05`, `${TITULAR} 08:00`].sort(),
    );
  });

  it("a opção interna de aceitar choque NÃO entra pelo PUT da agenda (nem dá 500 com valor torto)", async () => {
    // R6 da segurança: o PUT repassa o corpo inteiro ao updateRotina.
    const { PUT } = await import("@/app/api/rotinas/[id]/route");
    sessao = COORD;
    const a = await bloco({ data: "2099-01-05", funcionario_id: COLEGA });
    const b = await bloco({ data: "2099-01-05", funcionario_id: COLEGA, inicio_planejado: "09:00", fim_planejado: "09:20" });
    const mover = (extra: Record<string, unknown>) =>
      PUT(new Request(`http://x/api/rotinas/${b.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inicio_planejado: "08:00", ...extra }) }), { params: Promise.resolve({ id: b.id }) } as never);
    for (const valor of [[a.id], 5]) {
      const resp = await mover({ ignorarChoqueCom: valor });
      expect(resp.status, JSON.stringify(valor)).toBe(422);
      expect(JSON.stringify(await resp.json())).toMatch(/CAMPO_NAO_EDITAVEL/u);
    }
    expect((await (await getDataSource()).obter("rotinas_planejadas", b.id))?.inicio_planejado).toBe("09:00");
  });
});
