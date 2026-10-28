/**
 * Resumo executivo do Chromos — números que vão para a Diretoria.
 *
 * Os dois defeitos que este arquivo existe para impedir:
 *  1. Total de grupo/geral montado a partir das linhas por sede. Média não se
 *     soma: a média das médias de duas sedes não é a média das pessoas delas.
 *  2. Contas de execução que não fecham com o total de blocos — a invariante que
 *     os dois bugs do fechamento do dia violaram.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/chromos/resumo/route";
import {
  CATEGORIA_APOIO_OUTRO_SETOR,
  CATEGORIA_APOIO_PEDAGOGICO,
  ocupacaoPorPessoa,
  PARAMETROS_PADRAO,
  percentualApoioOutroSetor,
  resumoDeOcupacao,
} from "@/lib/calculations";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import {
  grupoDaSede,
  lerPeriodo,
  limitesDeDatas,
  mesCorrenteEmFortaleza,
  montarResumo,
  tokenConfere,
} from "@/lib/resumoExecutivo";
import type { ExecucaoRealizada, Sede } from "@/types";
import { funcionario, rotina } from "./fixtures";

const AGORA = new Date("2026-10-06T15:00:00Z");

function sede(parcial: Partial<Sede>): Sede {
  return {
    id: "s1", nome_sede: "Sede", codigo: "S", cidade: "", endereco: "",
    ativo: true, criado_por: "t", criado_em: "", atualizado_por: "t", atualizado_em: "",
    ...parcial,
  } as Sede;
}

function execucao(parcial: Partial<ExecucaoRealizada>): ExecucaoRealizada {
  return {
    id: "e1", rotina_id: "r1", sede_id: "s1", data_execucao: "2026-09-10",
    status_realizado: "conforme_planejado", inicio_real: "", fim_real: "",
    tempo_real_min: 0, justificativa: "", epis_confirmados: "", observacao: "",
    supervisor_id: "u1", criado_em: "", atualizado_em: "2026-09-10T20:00:00Z",
    ...parcial,
  };
}

describe("ocupacaoPorPessoa / resumoDeOcupacao (a régua das telas)", () => {
  it("mede contra a jornada dos dias PLANEJADOS e ignora bloco cancelado", () => {
    // 540 min líquidos; 2 dias com 270 min cada = 50%.
    const [p] = ocupacaoPorPessoa([funcionario()], [
      rotina({ id: "a", data: "2026-09-01", tempo_previsto_min: 270 }),
      rotina({ id: "b", data: "2026-09-02", tempo_previsto_min: 270 }),
      rotina({ id: "c", data: "2026-09-03", tempo_previsto_min: 540, status: "cancelada" }),
    ]);
    expect(p.dias).toBe(2);
    expect(p.ocupacao).toBe(50);
  });

  it("ninguém planejado → média null, não 0%", () => {
    const r = resumoDeOcupacao(ocupacaoPorPessoa([funcionario()], []), PARAMETROS_PADRAO);
    expect(r.pessoasPlanejadas).toBe(0);
    expect(r.ocupacaoMedia).toBeNull();
  });

  it("sobrecarga é ACIMA de ocupacao_alta: 100% exato não conta", () => {
    const pessoas = ocupacaoPorPessoa(
      [funcionario({ id: "a" }), funcionario({ id: "b" })],
      [
        rotina({ id: "1", funcionario_id: "a", tempo_previsto_min: 540 }),
        rotina({ id: "2", funcionario_id: "b", tempo_previsto_min: 600 }),
      ],
    );
    expect(resumoDeOcupacao(pessoas, PARAMETROS_PADRAO).emSobrecarga).toBe(1);
  });
});

describe("período", () => {
  const q = (s: string) => new URLSearchParams(s);

  it("sem de/ate é o mês corrente EM FORTALEZA", () => {
    // 01/10 às 01:00 UTC ainda é 30/09 às 22:00 em Fortaleza.
    expect(mesCorrenteEmFortaleza(new Date("2026-10-01T01:00:00Z"))).toBe("2026-09");
    expect(lerPeriodo(q(""), AGORA)).toEqual({ de: "2026-10", ate: "2026-10" });
  });

  it("recusa de > ate, formato inválido e só uma ponta", () => {
    expect(lerPeriodo(q("de=2026-10&ate=2026-09"), AGORA)).toHaveProperty("erro");
    expect(lerPeriodo(q("de=2026-13&ate=2026-13"), AGORA)).toHaveProperty("erro");
    expect(lerPeriodo(q("de=2026-9&ate=2026-10"), AGORA)).toHaveProperty("erro");
    expect(lerPeriodo(q("de=2026-09"), AGORA)).toHaveProperty("erro");
    expect(lerPeriodo(q("de=2026-09&ate=2026-10"), AGORA)).toEqual({ de: "2026-09", ate: "2026-10" });
  });

  it("os dois meses entram inteiros, inclusive fevereiro bissexto", () => {
    expect(limitesDeDatas("2026-09", "2026-10")).toEqual({ inicio: "2026-09-01", fim: "2026-10-31" });
    expect(limitesDeDatas("2028-02", "2028-02").fim).toBe("2028-02-29");
  });
});

describe("grupo e token", () => {
  it("código regional vira Colégio, UNI vira Universidade, o resto é null", () => {
    expect(grupoDaSede({ grupo: "RSU" })).toBe("Colégio");
    expect(grupoDaSede({ grupo: "uni" })).toBe("Universidade");
    expect(grupoDaSede({ grupo: "Aldeota" })).toBeNull();
    expect(grupoDaSede({ grupo: "" })).toBeNull();
  });

  it("token: só o igual passa; vazio nunca passa", () => {
    expect(tokenConfere("abc", "abc")).toBe(true);
    expect(tokenConfere("abd", "abc")).toBe(false);
    expect(tokenConfere("", "")).toBe(false);
  });
});

describe("montarResumo", () => {
  // Colégio com duas sedes de tamanhos diferentes: média das médias ≠ média das pessoas.
  const sedes = [
    sede({ id: "s1", nome_sede: "Sul 1", grupo: "RSU" }),
    sede({ id: "s2", nome_sede: "Sul 2", grupo: "RSU" }),
    sede({ id: "s3", nome_sede: "Benfica", grupo: "UNI" }),
    sede({ id: "s4", nome_sede: "Vazia", grupo: "RAL" }),
  ];
  const funcionarios = [
    funcionario({ id: "a", sede_id: "s1" }), // 100%
    funcionario({ id: "b", sede_id: "s2" }), // 50%
    funcionario({ id: "c", sede_id: "s2" }), // 50%
    funcionario({ id: "d", sede_id: "s3" }), // 110% → sobrecarga
    funcionario({ id: "x", sede_id: "s1", ativo: false }),
  ];
  const rotinas = [
    rotina({ id: "r1", funcionario_id: "a", sede_id: "s1", data: "2026-09-10", tempo_previsto_min: 540 }),
    rotina({ id: "r2", funcionario_id: "b", sede_id: "s2", data: "2026-09-10", tempo_previsto_min: 270 }),
    rotina({ id: "r3", funcionario_id: "c", sede_id: "s2", data: "2026-09-10", tempo_previsto_min: 270 }),
    rotina({ id: "r4", funcionario_id: "d", sede_id: "s3", data: "2026-09-10", tempo_previsto_min: 594 }),
    rotina({ id: "r5", funcionario_id: "a", sede_id: "s1", data: "2026-09-11", tempo_previsto_min: 540, status: "cancelada" }),
    rotina({ id: "r6", funcionario_id: "x", sede_id: "s1", data: "2026-09-10", tempo_previsto_min: 60 }),
  ];
  const execucoes = [
    execucao({ id: "e1", rotina_id: "r1", status_realizado: "conforme_planejado" }),
    execucao({ id: "e6", rotina_id: "r6", status_realizado: "com_atraso" }),
    execucao({ id: "e2", rotina_id: "r2", status_realizado: "nao_realizada" }),
    execucao({ id: "e4", rotina_id: "r4", status_realizado: "remanejada" }),
    // Dois registros do mesmo bloco: vale o último.
    execucao({ id: "e4b", rotina_id: "r4", status_realizado: "parcial", atualizado_em: "2026-09-11T00:00:00Z" }),
  ];
  const r = montarResumo({
    sedes, funcionarios, rotinas, execucoes, params: PARAMETROS_PADRAO,
    de: "2026-09", ate: "2026-09", agora: AGORA,
  });
  const linha = (nome: string) => r.porSede.find((s) => s.sede === nome)!;

  it("o grupo é a média das PESSOAS, não a média das linhas por sede", () => {
    expect(linha("Sul 1").ocupacaoMediaPct).toBe(100);
    expect(linha("Sul 2").ocupacaoMediaPct).toBe(50);
    // (100 + 50 + 50) / 3 = 66,7 — a média das linhas daria 75.
    expect(r.porGrupo["Colégio"]!.ocupacaoMediaPct).toBe(66.7);
    expect(r.geral.ocupacaoMediaPct).toBe(77.5); // (100+50+50+110)/4
    expect(r.geral.pessoasEmSobrecarga).toBe(1);
  });

  it("sede sem nada no período não vem; grupo sem nada também não", () => {
    expect(r.porSede.map((s) => s.sede)).toEqual(["Benfica", "Sul 1", "Sul 2"]);
    expect(linha("Benfica").grupo).toBe("Universidade");
    expect(Object.keys(r.porGrupo).sort()).toEqual(["Colégio", "Universidade"]);
  });

  it("as contas de execução somam sempre as previstas", () => {
    for (const n of [...r.porSede, r.porGrupo["Colégio"]!, r.geral]) {
      expect(
        n.execucoesConformes + n.execucoesComAtraso + n.execucoesParciais +
          n.execucoesNaoRealizadas + n.execucoesOutras + n.execucoesSemRegistro,
      ).toBe(n.execucoesPrevistas);
    }
    // Bloco de pessoa inativa conta na execução da sede (o trabalho foi planejado lá).
    expect(linha("Sul 1").execucoesPrevistas).toBe(2);
    expect(linha("Benfica").execucoesParciais).toBe(1); // o último registro venceu
    expect(r.geral.execucoesSemRegistro).toBe(1); // r3
  });

  it("apoio a outro setor: % do tempo planejado, sem cancelado, e null sem lista", () => {
    // r6 (60 de 600 min em Sul 1) e r4 (todo o Benfica) viram apoio; r5 também,
    // mas está cancelado e não conta.
    const comApoio = montarResumo({
      sedes, funcionarios,
      rotinas: rotinas.map((x) => (["r4", "r5", "r6"].includes(x.id) ? { ...x, tarefa_id: "t-apoio" } : x)),
      execucoes, params: PARAMETROS_PADRAO, de: "2026-09", ate: "2026-09", agora: AGORA,
      tarefasDeApoio: new Set(["t-apoio"]),
    });
    const pct = (nome: string) => comApoio.porSede.find((s) => s.sede === nome)!.apoioOutroSetorPct;
    expect(pct("Sul 1")).toBe(10);
    expect(pct("Sul 2")).toBe(0);
    expect(pct("Benfica")).toBe(100);
    // Geral é a conta do conjunto inteiro: 654 de 1734 min = 37,7 — não a
    // média das linhas (36,7), nem uma sede só, nem arredondado para inteiro.
    expect(comApoio.geral.apoioOutroSetorPct).toBe(37.7);
    // Sem a lista (chamada antiga), o campo não inventa número: 0% onde há planejamento.
    expect(linha("Sul 1").apoioOutroSetorPct).toBe(0);
  });

  it("apoio pedagógico entra no total de apoio e aparece à parte (23/10/2026)", () => {
    // r6 (60 min em Sul 1) é apoio a outro setor; r4 (Benfica) é pedagógico.
    const res = montarResumo({
      sedes, funcionarios,
      rotinas: rotinas.map((x) => (x.id === "r6" ? { ...x, tarefa_id: "t-apoio" } : x.id === "r4" ? { ...x, tarefa_id: "t-ped" } : x)),
      execucoes, params: PARAMETROS_PADRAO, de: "2026-09", ate: "2026-09", agora: AGORA,
      tarefasDeApoio: new Set(["t-apoio"]),
      tarefasPedagogicas: new Set(["t-ped"]),
    });
    const sede = (nome: string) => res.porSede.find((s) => s.sede === nome)!;
    expect(sede("Sul 1")).toMatchObject({ apoioOutroSetorPct: 10, apoioPedagogicoPct: 0 });
    expect(sede("Benfica")).toMatchObject({ apoioOutroSetorPct: 100, apoioPedagogicoPct: 100 });
    // O total do conjunto soma as duas; a parte pedagógica nunca passa do total.
    expect(res.geral.apoioPedagogicoPct!).toBeGreaterThan(0);
    expect(res.geral.apoioPedagogicoPct!).toBeLessThan(res.geral.apoioOutroSetorPct!);
    // Sem a lista pedagógica (chamada antiga): 0% onde há planejamento, nunca inventa.
    expect(linha("Sul 1").apoioPedagogicoPct).toBe(0);
  });

  it("percentualApoioOutroSetor: null sem nada planejado; remanejada e cancelada fora", () => {
    expect(percentualApoioOutroSetor([], new Set(["t"]))).toBeNull();
    const base = { tarefa_id: "t", tempo_previsto_min: 30 } as const;
    expect(
      percentualApoioOutroSetor(
        [
          { ...base, status: "planejada" },
          { ...base, tarefa_id: "outra", status: "planejada" },
          { ...base, status: "remanejada" },
          { ...base, status: "cancelada" },
        ],
        new Set(["t"]),
      ),
    ).toBe(50);
  });

  it("dia conferido é o dia da sede em que TODO bloco tem realizado", () => {
    expect(linha("Sul 1").diasConferidos).toBe(1);
    expect(linha("Sul 2").diasConferidos).toBe(0); // r3 sem registro
    expect(r.geral.diasConferidos).toBe(2); // Sul 1 e Benfica, não "1 dia"
  });
});

describe("GET /api/chromos/resumo — as portas", () => {
  const original = process.env.CHAVE_CROMOS;
  afterEach(() => {
    if (original === undefined) delete process.env.CHAVE_CROMOS;
    else process.env.CHAVE_CROMOS = original;
  });
  const pedir = (qs: string, token?: string) =>
    GET(new Request(`http://x/api/chromos/resumo${qs}`, token ? { headers: { authorization: `Bearer ${token}` } } : {}));

  it("sem a variável configurada: 503, nunca aberto", async () => {
    delete process.env.CHAVE_CROMOS;
    expect((await pedir("", "")).status).toBe(503);
  });

  // Casos do revisor de segurança para as chaves entre sistemas (28/10/2026).
  describe("as chaves", () => {
    const KC = "chave-do-cromos-de-teste-com-32-caracteres";
    const KO = "chave-do-orkestria-de-teste-com-32-caracteres";
    const ANT = "chave-ANTERIOR-do-cromos-com-32-caracteres";
    const comCabecalho = (authorization: string) =>
      GET(new Request("http://x/api/chromos/resumo?de=2026-09&ate=2026-09", { headers: { authorization } }));
    beforeEach(() => {
      vi.stubEnv("CHAVE_CROMOS", KC);
      vi.stubEnv("CHAVE_ORKESTRIA", KO);
      vi.stubEnv("CHAVE_CROMOS_ANTERIOR", "");
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

    it("O2 a chave do próprio Orkestria não abre; igual à do Chromos: 503", async () => {
      expect((await pedir("?de=2026-09&ate=2026-09", KO)).status).toBe(401);
      vi.stubEnv("CHAVE_ORKESTRIA", KC);
      expect((await pedir("?de=2026-09&ate=2026-09", KC)).status).toBe(503);
    });

    it("C3/C4/C6 Basic, duas chaves juntas e espaço duplo: 401; `bearer` minúsculo vale", async () => {
      for (const a of [`Basic ${KC}`, `Bearer ${KC},${KO}`, `Bearer  ${KC}`, KC])
        expect((await comCabecalho(a)).status, a).toBe(401);
      expect((await comCabecalho(`bearer ${KC}`)).status).toBe(200);
    });

    it("C9 sem chave e com período inválido: 401, não 400", async () => {
      expect((await pedir("?de=lixo")).status).toBe(401);
    });

    it("E3 chave de 31 caracteres vale como ausente: 503", async () => {
      vi.stubEnv("CHAVE_CROMOS", "a".repeat(31));
      expect((await pedir("?de=2026-09&ate=2026-09", "a".repeat(31))).status).toBe(503);
    });

    it("O1/E11 a anterior abre e sai no log; sozinha não vale", async () => {
      vi.stubEnv("CHAVE_CROMOS_ANTERIOR", ANT);
      expect((await pedir("?de=2026-09&ate=2026-09", ANT)).status).toBe(200);
      const aviso = vi.mocked(console.warn).mock.calls.flat().join(" ");
      expect(aviso).toContain("ANTERIOR");
      expect(aviso).not.toContain(ANT);
      vi.stubEnv("CHAVE_CROMOS", "");
      expect((await pedir("?de=2026-09&ate=2026-09", ANT)).status).toBe(503);
    });

    it("M1 sem a própria chave, ou curta, o Orkestria não tem o que mandar", async () => {
      const { minhaChave } = await import("@/lib/chaves");
      expect(minhaChave()).toBe(KO);
      vi.stubEnv("CHAVE_ORKESTRIA", "a".repeat(31));
      expect(minhaChave()).toBeNull();
    });
  });

  it("sem token ou com o errado: 401", async () => {
    process.env.CHAVE_CROMOS = "chave-do-cromos-de-teste-com-32-caracteres";
    expect((await pedir("")).status).toBe(401);
    expect((await pedir("", "outro")).status).toBe(401);
  });

  it("token certo e período inválido: 400; período válido: 200 com o formato", async () => {
    process.env.CHAVE_CROMOS = "chave-do-cromos-de-teste-com-32-caracteres";
    expect((await pedir("?de=2026-10&ate=2026-09", "chave-do-cromos-de-teste-com-32-caracteres")).status).toBe(400);
    const ok = await pedir("?de=2026-09&ate=2026-09", "chave-do-cromos-de-teste-com-32-caracteres");
    expect(ok.status).toBe(200);
    const corpo = await ok.json();
    expect(corpo).toMatchObject({ versao: 1, de: "2026-09", ate: "2026-09" });
    expect(Array.isArray(corpo.porSede)).toBe(true);
    expect(corpo.geral).toHaveProperty("execucoesSemRegistro");
  });

  it("apoio a outro setor sai do banco: tarefa da categoria conta, a outra não", async () => {
    process.env.CHAVE_CROMOS = "chave-do-cromos-de-teste-com-32-caracteres";
    reiniciarBanco();
    const ds = await getDataSource();
    const tarefa = (id: string, categoria_id: string) =>
      ds.criar("tarefas", { id, nome_tarefa: id, sede_id: "christus_dt", local_id: "christus_l1", categoria_id, ativo: true } as never);
    await tarefa("t-plantao", CATEGORIA_APOIO_OUTRO_SETOR);
    await tarefa("t-limpeza", "c1");
    for (const [id, tarefa_id, min] of [["b1", "t-plantao", 30], ["b2", "t-limpeza", 240]] as const)
      await ds.criar("rotinas_planejadas", rotina({ id, tarefa_id, sede_id: "christus_dt", data: "2026-08-10", tempo_previsto_min: min }));
    // Agosto: o mês que nenhum outro teste pede, para o cache de 5 min não responder.
    const corpo = await (await pedir("?de=2026-08&ate=2026-08", "chave-do-cromos-de-teste-com-32-caracteres")).json();
    expect(corpo.geral.apoioOutroSetorPct).toBe(11.1); // 30 de 270
  });

  it("apoio pedagógico sai do banco: soma no total e vem à parte", async () => {
    process.env.CHAVE_CROMOS = "chave-do-cromos-de-teste-com-32-caracteres";
    reiniciarBanco();
    const ds = await getDataSource();
    const tarefa = (id: string, categoria_id: string) =>
      ds.criar("tarefas", { id, nome_tarefa: id, sede_id: "christus_dt", local_id: "christus_l1", categoria_id, ativo: true } as never);
    await tarefa("t-plantao", CATEGORIA_APOIO_OUTRO_SETOR);
    await tarefa("t-alunos", CATEGORIA_APOIO_PEDAGOGICO);
    await tarefa("t-limpeza", "c1");
    for (const [id, tarefa_id, min] of [["b1", "t-plantao", 30], ["b2", "t-alunos", 30], ["b3", "t-limpeza", 240]] as const)
      await ds.criar("rotinas_planejadas", rotina({ id, tarefa_id, sede_id: "christus_dt", data: "2026-07-10", tempo_previsto_min: min }));
    // Julho: outro mês que nenhum teste pede, para o cache não responder.
    const corpo = await (await pedir("?de=2026-07&ate=2026-07", "chave-do-cromos-de-teste-com-32-caracteres")).json();
    expect(corpo.geral.apoioOutroSetorPct).toBe(20); // 60 de 300
    expect(corpo.geral.apoioPedagogicoPct).toBe(10); // 30 de 300
  });
});
