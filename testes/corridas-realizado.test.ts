/**
 * Escrita que confia numa leitura anterior (Consulta 7, 18/11/2026). Quatro caminhos
 * terminavam com sucesso e perdiam dado sem erro:
 *
 * 1. O fechamento lia "sem registro" e, enquanto confirmava, alguém gravava um desvio no
 *    bloco: o fechamento o trocava por "conforme" e a justificativa sumia.
 * 2. Duas gravações simultâneas do mesmo bloco criavam duas execuções.
 * 3. Execução e status da rotina em duas escritas: falhar a segunda deixava os dois divergentes.
 * 4. "Limpar o dia" lia "sem realizado" e excluía o bloco que alguém acabara de confirmar.
 * 5. "Gerar o dia" atrasado gravava por cima do bloco já gerado e mexido.
 *
 * As corridas se simulam no meio da gravação (espião no lote / na exclusão condicional).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource, type OperacaoLote } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import { ErroValidacao } from "@/services/erros";
import { confirmarDiaComoPlanejado, idDaExecucao, registrarExecucao } from "@/services/execucoesService";
import { gerarDiaDaRotaPadrao, salvarModelo } from "@/services/modelosService";
import { limparDia } from "@/services/rotinasService";
import type { ExecucaoRealizada, RotinaPlanejada } from "@/types";
import type { SessaoUsuario } from "@/lib/permissions";
import { POST as conformeRota } from "@/app/api/execucoes/conforme/route";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao }));
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };

const SEDE = "christus_dt";
const ONTEM = "2026-08-19";
const aud = { criado_em: "2026-01-01T00:00:00.000Z", atualizado_em: "2026-01-01T00:00:00.000Z" };

async function tarefaSemEpi(id: string) {
  const ds = await getDataSource();
  await ds.criar("tarefas", {
    id, nome_tarefa: "Sem EPI", tipo_tarefa: "Rota", local_id: "christus_l1", sede_id: SEDE,
    regra_calculo: "fixo", tempo_base_min: 10, quantidade: 1, frequencia: "diaria",
    prioridade: "media", requisitos: "", ativo: true, observacoes: "",
    criado_por: "t", atualizado_por: "t", ...aud,
  } as never);
}

async function bloco(id: string, inicio: string, fim: string) {
  const ds = await getDataSource();
  await ds.criar("rotinas_planejadas", {
    id, data: ONTEM, funcionario_id: "christus_f1", sede_id: SEDE, tarefa_id: "t-sem", local_id: "christus_l1",
    inicio_planejado: inicio, fim_planejado: fim, tempo_previsto_min: 10, tempo_visual_min: 15, blocos_ocupados: 1,
    status: "planejada", observacao: "", supervisor_id: "sup", ...aud,
  } as RotinaPlanejada);
}

const desvio = (rotina_id: string) => ({
  rotina_id, data_execucao: ONTEM, status_realizado: "com_atraso" as const, inicio_real: "07:00", fim_real: "07:30",
  tempo_real_min: 30, justificativa: "chuva", observacao: "", supervisor_id: "c2", epis_confirmados: "",
});
const conforme = (rotina_id: string) => ({ ...desvio(rotina_id), status_realizado: "conforme_planejado" as const, fim_real: "07:10", tempo_real_min: 10, justificativa: "", supervisor_id: "c1" });

async function execucoesDe(rotinaId: string): Promise<ExecucaoRealizada[]> {
  return (await getDataSource()).consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: rotinaId }]);
}

/** Intercepta o lote; `antes` roda uma vez, antes da gravação que casar. */
async function noMeioDoLote(casa: (ops: OperacaoLote[]) => boolean, antes: () => Promise<unknown>) {
  const ds = await getDataSource();
  const original = ds.gravarLote.bind(ds);
  let feito = false;
  return vi.spyOn(ds, "gravarLote").mockImplementation((async (ops: OperacaoLote[]) => {
    if (!feito && casa(ops)) {
      feito = true;
      await antes();
    }
    return original(ops);
  }) as never);
}
const criaExecucaoDe = (rotinaId: string) => (ops: OperacaoLote[]) =>
  ops.some((o) => o.tipo === "criar" && o.tabela === "execucoes_realizadas" && (o.registro as { rotina_id: string }).rotina_id === rotinaId);

describe("corridas no registro do realizado", () => {
  beforeEach(async () => {
    reiniciarBanco();
    const ds = await getDataSource();
    for (const r of await ds.listar("rotinas_planejadas")) await ds.excluir("rotinas_planejadas", r.id);
    await tarefaSemEpi("t-sem");
    await bloco("b1", "07:00", "07:10");
    await bloco("b2", "08:00", "08:10");
  });

  it("desvio gravado no meio do fechamento fica como foi gravado, e o fechamento o conta como já registrado", async () => {
    const espiao = await noMeioDoLote(criaExecucaoDe("b1"), () => registrarExecucao(desvio("b1"), { perfil: "coordenador" }));
    let res;
    try {
      res = await confirmarDiaComoPlanejado({ sedeId: SEDE, data: ONTEM }, "c1", "coordenador");
    } finally {
      espiao.mockRestore();
    }
    const doB1 = await execucoesDe("b1");
    expect(doB1).toHaveLength(1);
    expect(doB1[0]).toMatchObject({ status_realizado: "com_atraso", justificativa: "chuva" });
    expect(res.confirmadas).toBe(1); // só o b2
    expect(res.ja_registradas).toBe(1);
    expect(await execucoesDe("b2")).toHaveLength(1);
  });

  it("duas gravações simultâneas do mesmo bloco: uma execução só", async () => {
    await Promise.all([
      registrarExecucao(desvio("b1"), { perfil: "coordenador" }),
      registrarExecucao(conforme("b1"), { perfil: "coordenador" }),
    ]);
    const doB1 = await execucoesDe("b1");
    expect(doB1).toHaveLength(1);
    expect(doB1[0].id).toBe(idDaExecucao("b1"));
  });

  it("o toque de quem coordena não troca um registro existente: recusa como já registrada", async () => {
    await registrarExecucao(desvio("b1"), { perfil: "coordenador" });
    await expect(registrarExecucao(conforme("b1"), { perfil: "coordenador", soSeNovo: true })).rejects.toThrow(ErroValidacao);
    expect((await execucoesDe("b1"))[0].justificativa).toBe("chuva");
  });

  it("o ✓ Conforme de quem coordena (pela rota) não troca o desvio que já está gravado", async () => {
    await registrarExecucao(desvio("b1"), { perfil: "coordenador" });
    sessao = COORD;
    const resp = await conformeRota(
      new Request("http://x/api/execucoes/conforme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rotina_id: "b1" }) }),
    );
    sessao = null;
    expect(resp.status).toBe(422);
    expect(JSON.stringify(await resp.json())).toMatch(/JA_REGISTRADA/);
    expect((await execucoesDe("b1"))[0]).toMatchObject({ status_realizado: "com_atraso", justificativa: "chuva" });
  });

  it("execução antiga (UUID) é editada no lugar, sem criar outra com o id novo", async () => {
    const ds = await getDataSource();
    await ds.criar("execucoes_realizadas", { ...conforme("b1"), id: "uuid-antigo", sede_id: SEDE, ...aud } as ExecucaoRealizada);
    await registrarExecucao(desvio("b1"), { perfil: "coordenador" });
    const doB1 = await execucoesDe("b1");
    expect(doB1.map((e) => [e.id, e.justificativa])).toEqual([["uuid-antigo", "chuva"]]);
  });

  it("execução e status gravam juntos: se o lote falha, nem execução nem status mudam", async () => {
    const ds = await getDataSource();
    const original = ds.gravarLote.bind(ds);
    const espiao = vi.spyOn(ds, "gravarLote").mockImplementation((async (ops: OperacaoLote[]) => {
      if (criaExecucaoDe("b1")(ops)) throw new Error("rede caiu");
      return original(ops);
    }) as never);
    try {
      await expect(registrarExecucao(desvio("b1"), { perfil: "coordenador" })).rejects.toThrow("rede caiu");
    } finally {
      espiao.mockRestore();
    }
    expect(await execucoesDe("b1")).toHaveLength(0);
    expect((await ds.obter("rotinas_planejadas", "b1"))?.status).toBe("planejada");
  });
});

describe("Limpar o dia × confirmação no meio", () => {
  beforeEach(async () => {
    reiniciarBanco();
    const ds = await getDataSource();
    for (const r of await ds.listar("rotinas_planejadas")) await ds.excluir("rotinas_planejadas", r.id);
    await tarefaSemEpi("t-sem");
    await bloco("b1", "07:00", "07:10");
    await bloco("b2", "08:00", "08:10");
  });

  it("o bloco confirmado enquanto limpava fica, com a execução; o resto sai", async () => {
    const ds = await getDataSource();
    const original = ds.excluirSe.bind(ds);
    const espiao = vi.spyOn(ds, "excluirSe").mockImplementation((async (...args: Parameters<typeof original>) => {
      await registrarExecucao(conforme("b1"), { perfil: "coordenador" });
      return original(...args);
    }) as never);
    let res;
    try {
      res = await limparDia(SEDE, ONTEM, "todas", "c@x.com");
    } finally {
      espiao.mockRestore();
    }
    expect(await ds.obter("rotinas_planejadas", "b1")).not.toBeNull();
    expect(await ds.obter("rotinas_planejadas", "b2")).toBeNull();
    expect(await execucoesDe("b1")).toHaveLength(1);
    expect(res.removidas).toBe(1);
    expect(res.preservadas).toBe(1);
    expect(res.detalhes.join(" ")).toMatch(/mudaram enquanto limpava/);
    // Toda escrita vai ao histórico (regra 6): a exclusão do b2 sim; a do b1, que ficou, não.
    const excluidos = (await ds.listar("historico"))
      .filter((h) => h.tabela === "rotinas_planejadas" && h.acao === "excluir" && ["b1", "b2"].includes(h.registro_id))
      .map((h) => h.registro_id);
    expect(excluidos).toEqual(["b2"]);
  });
});

describe("Gerar o dia × geração no meio", () => {
  it("se o bloco já foi gerado e mexido no meio, recusa em vez de gravar por cima", async () => {
    reiniciarBanco();
    const hoje = hojeISO();
    await salvarModelo("Rota padrão", hoje, SEDE, "c@x.com", { padrao: true, comDuracao: true });
    const alvo = somarDias(hoje, 7); // mesmo dia da semana: a rota vale
    const ds = await getDataSource();
    // Primeiro, a geração normal (a "outra aba"), e alguém cancela um bloco.
    await gerarDiaDaRotaPadrao(SEDE, alvo, "c1");
    const gerados = await ds.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: alvo }]);
    expect(gerados.length).toBeGreaterThan(0);
    const tomado = gerados[0].id;
    await ds.atualizar("rotinas_planejadas", tomado, { status: "cancelada" });
    // Agora uma geração "atrasada": leu o dia vazio e grava depois. Simula apagando da
    // leitura — o lote de criação vai encontrar o id já existente.
    const consultarOriginal = ds.consultar.bind(ds);
    const espiaLeitura = vi.spyOn(ds, "consultar").mockImplementation((async (tabela: string, cond: never, opc: never) => {
      const r = await consultarOriginal(tabela as never, cond, opc);
      return tabela === "rotinas_planejadas" ? r.filter((x) => (x as { data?: string }).data !== alvo) : r;
    }) as never);
    try {
      await expect(gerarDiaDaRotaPadrao(SEDE, alvo, "c1")).rejects.toThrow(/gerado ou alterado por outra pessoa/);
    } finally {
      espiaLeitura.mockRestore();
    }
    expect((await ds.obter("rotinas_planejadas", tomado))?.status).toBe("cancelada");
  });
});
