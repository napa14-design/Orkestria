/**
 * Resumo diário das rotas (16/11/2026): e-mail das 10h, de segunda a sábado, com a situação
 * de cada sede de quem está no parâmetro `resumo_diario_para`. A rota não tem chave (decisão
 * do dono), então as travas são o que este arquivo vigia: janela, uma vez por dia, trava antes
 * de ler, destinatário só do cadastro, sedes só as da pessoa. Letras/números = casos de ataque
 * do `seguranca` (17/11/2026).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executarComUsuario } from "@/lib/contextoUsuario";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { janelaDoResumo, lerDestinatarios, montarEmailDoResumo, situacaoDaSede } from "@/lib/resumoDiario";
import type { Feriado } from "@/types";

const enviados: { para: string; assunto: string; texto: string; html: string }[] = [];
const smtp = { falha: false, ligado: true };
vi.mock("@/lib/email", () => ({
  emailConfigurado: () => smtp.ligado,
  enviarEmail: async (args: { para: string; assunto: string; texto: string; html: string }) => {
    if (smtp.falha) return { enviado: false, motivo: "recusado" };
    enviados.push(args);
    return { enviado: true };
  },
}));
const { enviarResumoDiario, idDaTrava } = await import("@/services/resumoDiarioService");
const { GET, POST } = await import("@/app/api/agendado/resumo-diario/route");
const { middleware } = await import("@/middleware");

// 05/03/2030 é terça. 13:30Z = 10:30 em Fortaleza.
const DIA = "2030-03-05";
const NA_JANELA = new Date("2030-03-05T13:30:00Z");

describe("janelaDoResumo (C)", () => {
  it("só de segunda a sábado, entre 10:00 e 10:59 de Fortaleza", () => {
    expect(janelaDoResumo(new Date("2030-03-05T13:00:00Z"))).toEqual({ data: DIA, dentro: true });
    expect(janelaDoResumo(new Date("2030-03-05T13:59:59.999Z")).dentro).toBe(true);
    expect(janelaDoResumo(new Date("2030-03-05T12:59:59.999Z")).dentro).toBe(false);
    expect(janelaDoResumo(new Date("2030-03-05T14:00:00Z")).dentro).toBe(false);
    expect(janelaDoResumo(new Date("2030-03-09T13:30:00Z")).dentro).toBe(true); // sábado
    expect(janelaDoResumo(new Date("2030-03-10T13:30:00Z")).dentro).toBe(false); // domingo
    expect(janelaDoResumo(new Date("2030-03-05T03:00:00Z")).dentro).toBe(false); // meia-noite em Fortaleza
  });
  it("o dia é o de Fortaleza, não o UTC", () => {
    expect(janelaDoResumo(new Date("2030-03-05T02:00:00Z")).data).toBe("2030-03-04");
  });
});

describe("lerDestinatarios (E)", () => {
  it("minúsculo, sem repetição, só e-mail, no máximo 10", () => {
    expect(lerDestinatarios(" A@x.com; a@x.com, b@y.org lixo c@ @d.com")).toEqual(["a@x.com", "b@y.org"]);
    expect(lerDestinatarios(Array.from({ length: 15 }, (_, i) => `p${i}@x.com`).join(","))).toHaveLength(10);
    expect(lerDestinatarios(undefined)).toEqual([]);
    expect(lerDestinatarios(42)).toEqual([]);
    expect(lerDestinatarios(["a@x.com"])).toEqual([]);
  });
  it("nada que injete cabeçalho no SMTP passa (E15)", () => {
    for (const v of ["a@x.com\r\nBcc: evil@y.com", "Maria <evil@y.com>", '"evil@y.com"', "a@x.com%0d%0abcc:evil@y.com"])
      for (const e of lerDestinatarios(v)) expect(e).toMatch(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/);
    expect(lerDestinatarios("Maria <evil@y.com>")).toEqual([]);
  });
});

describe("situacaoDaSede", () => {
  const sede = { id: "s", codigo: "SUL 1", nome_sede: "Sul 1" };
  const feriado = (sede_id: string) => ({ id: "f", nome: "Carnaval", data_inicio: DIA, data_fim: DIA, sede_id, ativo: true }) as Feriado;
  const base = { sede, data: DIA, dow: 2, feriados: [] as Feriado[] };
  it("com tarefa no dia é Gerado, mesmo em feriado", () => {
    expect(situacaoDaSede({ ...base, blocos: 12, itensPadrao: [], feriados: [feriado("")] })).toMatchObject({ situacao: "gerado", tarefas: 12 });
  });
  it("sem tarefa: feriado da sede ou geral (C5)", () => {
    expect(situacaoDaSede({ ...base, blocos: 0, itensPadrao: [{ dias_semana: "" }], feriados: [feriado("")] })).toMatchObject({ situacao: "feriado", feriado: "Carnaval" });
    expect(situacaoDaSede({ ...base, blocos: 0, itensPadrao: [{ dias_semana: "" }], feriados: [feriado("outra")] }).situacao).toBe("nao_gerado");
  });
  it("sem rota padrão para o dia da semana não cobra", () => {
    expect(situacaoDaSede({ ...base, blocos: 0, itensPadrao: [] }).situacao).toBe("sem_rota");
    expect(situacaoDaSede({ ...base, blocos: 0, itensPadrao: [{ dias_semana: "6" }] }).situacao).toBe("sem_rota");
    expect(situacaoDaSede({ ...base, blocos: 0, itensPadrao: [{ dias_semana: "1,2,3,4,5" }] }).situacao).toBe("nao_gerado");
  });
});

describe("montarEmailDoResumo (G3, G4)", () => {
  it("o que falta primeiro, e o nome da sede não injeta HTML nem quebra o assunto", () => {
    const e = montarEmailDoResumo(DIA, [
      { codigo: "DT", nome: "Dionísio", situacao: "gerado", tarefas: 347 },
      { codigo: "SUL 1\r\nBcc: x", nome: "<img src=x onerror=alert(1)>", situacao: "nao_gerado", tarefas: 0 },
      { codigo: "PN", nome: "Pré Nunes", situacao: "feriado", tarefas: 0, feriado: "<script>" },
    ]);
    expect(e.assunto).toBe("Orkestria · 05/03/2030: 1 sede sem rota gerada");
    expect(e.assunto).not.toMatch(/[\r\n]/);
    expect(e.texto.indexOf("FALTA GERAR (1)")).toBeLessThan(e.texto.indexOf("DT — Dionísio: 347 tarefas"));
    expect(e.texto).toContain("PN — Feriado — <script>"); // texto puro não interpreta HTML
    expect(e.html).not.toContain("<img");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&#60;img");
    expect(e.html).not.toContain("Abrir a agenda"); // sem endereço, sem botão
  });

  it("todas geradas: título verde-tinta, sem seção de falta; com endereço, o botão aparece", () => {
    const e = montarEmailDoResumo(DIA, [{ codigo: "DT", nome: "Dionísio", situacao: "gerado", tarefas: 1 }], "https://exemplo.test/rotinas");
    expect(e.assunto).toBe("Orkestria · 05/03/2030: rotas de todas as sedes geradas");
    expect(e.html).toContain("Todas as rotas do dia estão geradas");
    expect(e.html).not.toContain("Falta gerar");
    expect(e.html).toContain('href="https://exemplo.test/rotinas"');
    expect(e.texto).toContain("1 tarefa");
    expect(e.texto).toContain("terça-feira, 5 de março");
  });
});

describe("enviarResumoDiario", () => {
  const ds = () => getDataSource();
  const comoAdmin = <T,>(fn: () => Promise<T>) => executarComUsuario("teste@local.test", fn);
  const usuario = (id: string, email: string, extra: Record<string, unknown> = {}) =>
    ({ id, nome: id, email, perfil: "coordenador", sede_id: "christus_dt", sedes_extra: "", ativo: true, ...extra }) as never;
  const parametro = (valor: unknown, extra: Record<string, unknown> = {}) =>
    ({ id: `p-${Math.random()}`, chave: "resumo_diario_para", valor, tipo: "texto", descricao: "", sede_id: "geral", editavel_por_supervisor: false, ativo: true, ...extra }) as never;
  const prepara = async (usuarios: unknown[], valor: unknown, extraParam: Record<string, unknown> = {}) =>
    comoAdmin(async () => {
      const d = await ds();
      for (const u of usuarios) await d.criar("usuarios", u as never);
      if (valor !== null) await d.criar("parametros", parametro(valor, extraParam));
    });

  beforeEach(() => {
    vi.restoreAllMocks();
    reiniciarBanco();
    enviados.length = 0;
    smtp.falha = false;
    smtp.ligado = true;
  });

  it("fora da janela ou sem SMTP não lê, não envia, não trava (C1, C4, D10)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    const d = await ds();
    const toques = [vi.spyOn(d, "listar"), vi.spyOn(d, "consultar"), vi.spyOn(d, "contar"), vi.spyOn(d, "gravarLote")];
    expect(await enviarResumoDiario(new Date("2030-03-05T12:30:00Z"))).toBe("fora da janela");
    expect(await enviarResumoDiario(new Date("2030-03-10T13:30:00Z"))).toBe("fora da janela"); // domingo
    expect(await enviarResumoDiario(new Date("2030-03-05T03:00:00Z"))).toBe("fora da janela");
    smtp.ligado = false;
    expect(await enviarResumoDiario(NA_JANELA)).toBe("fora da janela");
    for (const s of toques) expect(s).not.toHaveBeenCalled();
    expect(enviados).toHaveLength(0);
    expect(await d.obter("cache_resumo", idDaTrava(DIA))).toBeNull();
  });

  it("envia uma vez por dia, só com as sedes de quem recebe", async () => {
    await prepara([usuario("u1", "Coord@X.com")], "coord@x.com");
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
    expect(await enviarResumoDiario(NA_JANELA)).toBe("já enviado");
    expect(enviados).toHaveLength(1);
    expect(enviados[0].texto).toContain("Dionísio");
    expect(enviados[0].texto).not.toContain("Aldeota");
  });

  it("a 2ª chamada do dia não lê dado nenhum (D3)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
    const d = await ds();
    const pesadas = [vi.spyOn(d, "listar"), vi.spyOn(d, "consultar"), vi.spyOn(d, "contar")];
    expect(await enviarResumoDiario(NA_JANELA)).toBe("já enviado");
    for (const s of pesadas) expect(s).not.toHaveBeenCalled();
  });

  it("chamadas ao mesmo tempo mandam um e-mail só (D1, D2)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    const r = await Promise.all(Array.from({ length: 30 }, () => enviarResumoDiario(NA_JANELA)));
    expect(r.filter((s) => s === "enviado")).toHaveLength(1);
    expect(enviados).toHaveLength(1);
  });

  it("trava de ontem não impede hoje (D4)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    await comoAdmin(async () => (await ds()).criar("cache_resumo", { id: idDaTrava("2030-03-04"), corpo: "enviado", expira_em: "", criado_em: "" }));
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
  });

  it("trava parada em 'enviando' (função morta no meio) não reenvia (D6)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    await comoAdmin(async () => (await ds()).criar("cache_resumo", { id: idDaTrava(DIA), corpo: "enviando", expira_em: "", criado_em: "" }));
    expect(await enviarResumoDiario(NA_JANELA)).toBe("já enviado");
    expect(enviados).toHaveLength(0);
  });

  it("vai para o endereço normalizado do parâmetro, não o cru do cadastro (E11)", async () => {
    await prepara([usuario("u1", " maria@x.com\r\n")], "MARIA@X.COM");
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
    expect(enviados.map((e) => e.para)).toEqual(["maria@x.com"]);
  });

  it("e-mail fora do cadastro, supervisor, visualizador, inativo ou repetido não recebe (E8–E10, E12)", async () => {
    await prepara(
      [
        usuario("sup", "sup@x.com", { perfil: "supervisor" }),
        usuario("vis", "vis@x.com", { perfil: "visualizador" }),
        usuario("ina", "ina@x.com", { ativo: false }),
        usuario("ins", "ins@x.com", { ativo: "true" }),
        usuario("d1", "dup@x.com"),
        usuario("d2", "DUP@x.com"),
        usuario("ok", "ok@x.com"),
      ],
      "fora@gmail.com, sup@x.com, vis@x.com, ina@x.com, ins@x.com, dup@x.com, ok@x.com, ok@x.com, ok@x.com",
    );
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
    expect(enviados.map((e) => e.para)).toEqual(["ok@x.com"]); // E13: repetido no parâmetro, 1 e-mail
  });

  it("só vale o parâmetro geral, ativo e de texto (E1–E3)", async () => {
    for (const [valor, extra] of [
      ["coord@x.com", { sede_id: "christus_dt" }],
      ["coord@x.com", { ativo: false }],
      ["coord@x.com", { ativo: "true" }],
      [["coord@x.com"], {}],
      ["", {}],
    ] as const) {
      reiniciarBanco();
      await prepara([usuario("u1", "coord@x.com")], valor, extra);
      expect(await enviarResumoDiario(NA_JANELA)).toBe("sem destinatário");
    }
    reiniciarBanco();
    await prepara([usuario("u1", "coord@x.com")], null);
    expect(await enviarResumoDiario(NA_JANELA)).toBe("sem destinatário");
    expect(enviados).toHaveLength(0);
  });

  it("cada destinatário só com as suas sedes (F1, F5) e sem nome de funcionário (G2)", async () => {
    await prepara([usuario("a", "a@x.com"), usuario("b", "b@x.com", { sede_id: "christus_ald" })], "a@x.com, b@x.com");
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
    const de = (p: string) => enviados.find((e) => e.para === p)!;
    expect(`${de("a@x.com").texto}${de("a@x.com").html}`).not.toContain("Aldeota");
    expect(`${de("b@x.com").texto}${de("b@x.com").html}`).not.toContain("Dionísio");
    for (const e of enviados) expect(`${e.assunto}${e.texto}${e.html}`).not.toContain("Aurilene");
  });

  it("sede extra inexistente fica de fora sem erro; administrador recebe todas as ativas (F2, F4)", async () => {
    await prepara(
      [usuario("c", "c@x.com", { sedes_extra: "nao_existe" }), usuario("adm", "adm@x.com", { perfil: "administrador", sede_id: "geral" })],
      "c@x.com, adm@x.com",
    );
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
    const adm = enviados.find((e) => e.para === "adm@x.com")!;
    expect(adm.texto).toContain("Dionísio");
    expect(adm.texto).toContain("Aldeota");
    expect(enviados.find((e) => e.para === "c@x.com")!.texto).not.toContain("nao_existe");
  });

  it("envio feito e anotação da trava falhando: não reenvia (D8)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    vi.spyOn(await ds(), "atualizar").mockRejectedValueOnce(new Error("banco instável"));
    expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
    expect(await enviarResumoDiario(NA_JANELA)).toBe("já enviado");
    expect(enviados).toHaveLength(1);
  });

  it("criar a trava falhando é fail-closed (D5)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    vi.spyOn(await ds(), "gravarLote").mockRejectedValueOnce(new Error("indisponível"));
    expect(await enviarResumoDiario(NA_JANELA)).not.toBe("enviado");
    expect(enviados).toHaveLength(0);
  });

  it("SMTP falhando: a trava fica, e chamar em laço não refaz a varredura (D9)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    smtp.falha = true;
    expect(await enviarResumoDiario(NA_JANELA)).toBe("falhou");
    expect((await (await ds()).obter("cache_resumo", idDaTrava(DIA)))?.corpo).toBe("falhou");
    const contar = vi.spyOn(await ds(), "contar");
    smtp.falha = false;
    for (let i = 0; i < 5; i++) expect(await enviarResumoDiario(NA_JANELA)).toBe("já enviado");
    expect(contar).not.toHaveBeenCalled();
    expect(enviados).toHaveLength(0);
  });

  it("endereço do botão: só https limpo da configuração; o resto sai sem botão", async () => {
    for (const [valor, temBotao] of [
      ["https://orkestria.exemplo.test", true],
      ["javascript:alert(1)", false],
      ['https://x.test/" onmouseover="x', false],
      ["https://user@x.test", false],
      ["http://x.test", false],
    ] as const) {
      reiniciarBanco();
      enviados.length = 0;
      vi.stubEnv("APP_URL", valor);
      vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
      try {
        await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
        expect(await enviarResumoDiario(NA_JANELA)).toBe("enviado");
        expect(enviados[0].html.includes("Abrir a agenda"), valor).toBe(temBotao);
        if (temBotao) expect(enviados[0].html).toContain('href="https://orkestria.exemplo.test/rotinas"');
        expect(enviados[0].html).not.toContain("onmouseover");
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  it("a rota só diz ok ou fora da janela, e só aceita GET (B1, G1, R8)", async () => {
    await prepara([usuario("u1", "coord@x.com")], "coord@x.com");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2030-03-05T12:00:00Z"));
      expect(await (await GET()).json()).toEqual({ status: "fora da janela" });
      vi.setSystemTime(NA_JANELA);
      expect((await POST()).status).toBe(405);
      expect(enviados).toHaveLength(0);
      const r = await GET();
      expect(await r.json()).toEqual({ status: "ok" });
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(await (await GET()).json()).toEqual({ status: "ok" }); // "já enviado" também é "ok"
      expect(enviados).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("portão do middleware (A1–A6)", () => {
  const passa = (url: string) => middleware(new NextRequest(`http://x${url}`)).status !== 401;
  it("só o caminho exato do resumo é público", () => {
    expect(passa("/api/agendado/resumo-diario")).toBe(true);
    for (const u of [
      "/api/agendado/outra",
      "/api/agendado/",
      "/api/agendado/resumo-diario-x",
      "/api/agendado/resumo-diariox",
      "/api/agendado/RESUMO-DIARIO",
      "/api/agendado/resumo-diario/",
      "/api/agendado/resumo-diario/../usuarios",
      "/api/usuarios",
    ])
      expect(passa(u), u).toBe(false);
    expect(passa("/api/chromos/resumo")).toBe(true);
  });
});
