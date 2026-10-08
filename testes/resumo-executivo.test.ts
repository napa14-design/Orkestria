/**
 * Resumo executivo do Chromos — números que vão para a Diretoria.
 *
 * Os dois defeitos que este arquivo existe para impedir:
 *  1. Total de grupo/geral montado a partir das linhas por sede. Média não se
 *     soma: a média das médias de duas sedes não é a média das pessoas delas.
 *  2. Contas de execução que não fecham com o total de blocos — a invariante que
 *     os dois bugs do fechamento do dia violaram.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/chromos/resumo/route";
import { ocupacaoPorPessoa, PARAMETROS_PADRAO, resumoDeOcupacao } from "@/lib/calculations";
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

  it("dia conferido é o dia da sede em que TODO bloco tem realizado", () => {
    expect(linha("Sul 1").diasConferidos).toBe(1);
    expect(linha("Sul 2").diasConferidos).toBe(0); // r3 sem registro
    expect(r.geral.diasConferidos).toBe(2); // Sul 1 e Benfica, não "1 dia"
  });
});

describe("GET /api/chromos/resumo — as portas", () => {
  const original = process.env.ORKESTRIA_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.ORKESTRIA_TOKEN;
    else process.env.ORKESTRIA_TOKEN = original;
  });
  const pedir = (qs: string, token?: string) =>
    GET(new Request(`http://x/api/chromos/resumo${qs}`, token ? { headers: { authorization: `Bearer ${token}` } } : {}));

  it("sem a variável configurada: 503, nunca aberto", async () => {
    delete process.env.ORKESTRIA_TOKEN;
    expect((await pedir("", "")).status).toBe(503);
  });

  it("sem token ou com o errado: 401", async () => {
    process.env.ORKESTRIA_TOKEN = "segredo";
    expect((await pedir("")).status).toBe(401);
    expect((await pedir("", "outro")).status).toBe(401);
  });

  it("token certo e período inválido: 400; período válido: 200 com o formato", async () => {
    process.env.ORKESTRIA_TOKEN = "segredo";
    expect((await pedir("?de=2026-10&ate=2026-09", "segredo")).status).toBe(400);
    const ok = await pedir("?de=2026-09&ate=2026-09", "segredo");
    expect(ok.status).toBe(200);
    const corpo = await ok.json();
    expect(corpo).toMatchObject({ versao: 1, de: "2026-09", ate: "2026-09" });
    expect(Array.isArray(corpo.porSede)).toBe(true);
    expect(corpo.geral).toHaveProperty("execucoesSemRegistro");
  });
});
