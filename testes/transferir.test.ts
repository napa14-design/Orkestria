/**
 * Transferir de sede (27/10/2026): botão próprio, porque "fica muito ruim no
 * desligar". Encerra a ficha de origem (motivo "Transferência", rota guardada
 * como posto vago, vaga no SGCP só se pedida) e cria a ficha no destino com o
 * mesmo horário e matrícula. Pelas rotas: sessão simulada, banco de memória.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { validarDesligamento } from "@/lib/desligamento";
import { reiniciarBanco } from "@/lib/memoryStore";
import { gerarDiaDaRotaPadrao } from "@/services/modelosService";
import type { Funcionario } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { POST: transferir } = await import("@/app/api/funcionarios/[id]/transferir/route");
const { PUT } = await import("@/app/api/funcionarios/[id]/route");
const { POST: criar, GET: listar } = await import("@/app/api/funcionarios/route");

const COORD_DUAS: SessaoUsuario = {
  id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt", "christus_ald"],
};
const corpo = (c: unknown, metodo = "POST") =>
  new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const HOJE = "2026-10-27";

describe("transferir de sede", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    reiniciarBanco();
    sessao = COORD_DUAS;
    const ds = await getDataSource();
    const base = await ds.obter("funcionarios", "christus_f1");
    await ds.criar("funcionarios", {
      ...base!, id: "f-vai", nome: "Pessoa Que Vai", matricula: "321", empresa: "EMPRESA A", desligado_em: "",
      entrada_sabado: "07:00", saida_sabado: "11:15", intervalos_sabado: "09:00-09:15", escala: "seg_sab",
    });
    await ds.criar("modelos_rotina", {
      id: "rota-f-vai-1", nome_modelo: "Rota padrão", sede_id: "christus_dt", funcionario_id: "f-vai", tarefa_id: "christus_t2",
      local_id: "christus_l1", inicio_planejado: "07:00", duracao_min: 30, padrao: true, criado_em: "", atualizado_em: "",
    } as never);
  });

  it("encerra a ficha daqui como transferência e cria a ficha lá, com o mesmo horário, matrícula e empresa", async () => {
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"));
    expect(r.status).toBe(200);
    const { novo, vaga } = await r.json();
    expect(vaga.aberta).toBe(false); // desmarcada por padrão
    const ds = await getDataSource();
    const origem = await ds.obter("funcionarios", "f-vai");
    expect(origem).toMatchObject({ desligado_em: HOJE, motivo_desligamento: "Transferência", transferido_para: "christus_ald", ativo: false });
    expect(origem?.vaga_sgcp ?? "").toBe("");
    expect(origem?.posto_extinto ?? false).toBe(false);
    // A rota fica na origem como posto vago.
    expect((await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: "f-vai" }])).length).toBe(1);
    const lá = await ds.obter("funcionarios", novo.id);
    expect(lá).toMatchObject({
      nome: "Pessoa Que Vai", sede_id: "christus_ald", matricula: "321", empresa: "EMPRESA A", transferido_de: "f-vai", ativo: true,
      entrada: origem?.entrada, saida: origem?.saida, escala: "seg_sab", entrada_sabado: "07:00", intervalos_sabado: "09:00-09:15",
    });
    expect(lá?.observacoes).toContain("Transferida de");
  });

  it("quem não opera a sede de destino não transfere — e nada muda", async () => {
    sessao = { ...COORD_DUAS, sedes: ["christus_dt"] };
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"));
    expect(r.status).toBe(403);
    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
    expect((await ds.listar("funcionarios")).filter((f) => f.transferido_de === "f-vai")).toEqual([]);
  });

  it("supervisor e visualizador não transferem", async () => {
    for (const perfil of ["supervisor", "visualizador"]) {
      sessao = { ...COORD_DUAS, perfil: perfil as SessaoUsuario["perfil"] };
      expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"))).status).toBe(403);
    }
  });

  it("sem destino, para a mesma sede, data inválida ou pessoa já desligada: recusa", async () => {
    expect((await transferir(corpo({ sede_id: "christus_dt", data: HOJE }), ctx("f-vai"))).status).toBe(422);
    expect((await transferir(corpo({ sede_id: "christus_ald", data: "27/10/2026" }), ctx("f-vai"))).status).toBe(422);
    expect((await transferir(corpo({ data: HOJE }), ctx("f-vai"))).status).toBe(403);
    const ds = await getDataSource();
    await ds.atualizar("funcionarios", "f-vai", { desligado_em: "2026-10-20", ativo: false });
    expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"))).status).toBe(422);
  });

  it("se a ficha nova seria recusada (matrícula já ativa no destino), a origem NÃO é desligada", async () => {
    const ds = await getDataSource();
    const base = await ds.obter("funcionarios", "christus_f1");
    await ds.criar("funcionarios", { ...base!, id: "f-ja-la", nome: "Outra", sede_id: "christus_ald", matricula: "321", empresa: "EMPRESA A", desligado_em: "" });
    expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE }), ctx("f-vai"))).status).toBe(422);
    expect((await ds.obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
  });

  it("matrícula ativa em ficha de OUTRA empresa: recusa antes de desligar a origem (revisão de segurança)", async () => {
    const ds = await getDataSource();
    const base = await ds.obter("funcionarios", "christus_f1");
    await ds.criar("funcionarios", { ...base!, id: "f-outra-empresa", nome: "Outra", sede_id: "christus_dt", matricula: "321", empresa: "EMPRESA B", desligado_em: "" });
    expect((await transferir(corpo({ sede_id: "christus_ald", data: HOJE, abrirVaga: true }), ctx("f-vai"))).status).toBe(422);
    const origem = await ds.obter("funcionarios", "f-vai");
    expect(origem?.desligado_em).toBe("");
    expect(origem?.transferido_para ?? "").toBe("");
    expect(origem?.vaga_sgcp ?? "").toBe("");
  });

  it("a vaga no SGCP só é tentada quando pedida", async () => {
    vi.stubEnv("SGCP_VAGAS_URL", "");
    const r = await transferir(corpo({ sede_id: "christus_ald", data: HOJE, abrirVaga: true }), ctx("f-vai"));
    const { vaga } = await r.json();
    expect(vaga.motivo).toContain("não está configurada"); // pedida: foi tentar (e sem SGCP configurado, avisa)
    vi.unstubAllEnvs();
  });

  it("os campos da transferência não entram pelo cadastro nem pela edição comuns", async () => {
    expect((await PUT(corpo({ transferido_para: "christus_ald" }, "PUT"), ctx("f-vai"))).status).toBe(422);
    expect((await criar(corpo({ nome: "X Y", sede_id: "christus_dt", transferido_de: "f-vai" }))).status).toBe(422);
    expect(await (await PUT(corpo({ transferido_setor: "Cantina" }, "PUT"), ctx("f-vai"))).text()).toContain("transferido_setor");
    // Corpo completo: sem ele, o 422 viria dos campos obrigatórios, não da trava.
    const { id: _id, ...base } = (await (await getDataSource()).obter("funcionarios", "christus_f1"))!;
    const r = await criar(corpo({ ...base, matricula: "", transferido_setor: "Cantina" }));
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("CAMPO_NAO_EDITAVEL");
  });

  describe("para outro setor (04/11/2026: a cantina não é sede)", () => {
    it("encerra a ficha como transferência, guarda a rota como posto vago e NÃO cria ficha nova", async () => {
      const ds = await getDataSource();
      const antes = (await ds.listar("funcionarios")).length;
      const r = await transferir(corpo({ setor: "  Cantina ", data: HOJE }), ctx("f-vai"));
      expect(r.status).toBe(200);
      expect((await r.json()).vaga.aberta).toBe(false);
      const f = await ds.obter("funcionarios", "f-vai");
      expect(f).toMatchObject({ desligado_em: HOJE, motivo_desligamento: "Transferência", transferido_setor: "Cantina", ativo: false });
      expect(f?.transferido_para ?? "").toBe("");
      expect(f?.posto_extinto ?? false).toBe(false);
      expect((await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: "f-vai" }])).length).toBe(1);
      expect((await ds.listar("funcionarios")).length).toBe(antes);
    });

    it("basta operar a sede de origem: o setor não tem coordenador", async () => {
      sessao = { ...COORD_DUAS, sedes: ["christus_dt"] };
      expect((await transferir(corpo({ setor: "Cantina", data: HOJE }), ctx("f-vai"))).status).toBe(200);
    });

    it("quem não opera a sede de origem não transfere, e nem supervisor ou visualizador", async () => {
      sessao = { ...COORD_DUAS, sede_id: "christus_ald", sedes: ["christus_ald"] };
      expect((await transferir(corpo({ setor: "Cantina", data: HOJE }), ctx("f-vai"))).status).toBe(403);
      for (const perfil of ["supervisor", "visualizador"]) {
        sessao = { ...COORD_DUAS, perfil: perfil as SessaoUsuario["perfil"] };
        expect((await transferir(corpo({ setor: "Cantina", data: HOJE }), ctx("f-vai"))).status).toBe(403);
      }
      expect((await (await getDataSource()).obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
    });

    it("setor vazio, longo demais, sem data, ou sede E setor juntos: recusa e nada muda", async () => {
      for (const c of [
        { setor: "   ", data: HOJE },
        { setor: 7, data: HOJE },
        { setor: "x".repeat(61), data: HOJE },
        { setor: "Cantina", data: "27/10/2026" },
        { setor: "Cantina", data: "2026-13-45" },
        { setor: "Cantina", sede_id: "christus_ald", data: HOJE },
        { setor: "Cantina", sede_id: null, data: HOJE },
        { setor: "​", data: HOJE },
        { setor: "Can\r\ntina", data: HOJE },
        // Invisíveis que não são \p{C}: o selo ficaria sem nome igual.
        { setor: "ㅤ", data: HOJE },
        { setor: "⠀", data: HOJE },
        { setor: "͏", data: HOJE },
        { setor: "Can tina", data: HOJE },
        { setor: "---", data: HOJE },
      ])
        expect((await transferir(corpo(c), ctx("f-vai"))).status).toBe(422);
      expect((await (await getDataSource()).obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
    });

    it("nome normal de setor passa, com acento e símbolo", async () => {
      expect((await transferir(corpo({ setor: "Refeitório & Cantina 2", data: HOJE }), ctx("f-vai"))).status).toBe(200);
      expect((await (await getDataSource()).obter("funcionarios", "f-vai"))?.transferido_setor).toBe("Refeitório & Cantina 2");
    });

    it("data: até 1 ano à frente passa, depois disso recusa; o passado distante continua livre", async () => {
      const ds = await getDataSource();
      for (const c of [{ setor: "Cantina", data: "2027-10-28" }, { sede_id: "christus_ald", data: "2027-10-28" }])
        expect((await transferir(corpo(c), ctx("f-vai"))).status).toBe(422);
      expect((await ds.obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
      expect((await transferir(corpo({ setor: "Cantina", data: "2027-10-27" }), ctx("f-vai"))).status).toBe(200);
      expect(validarDesligamento({ data: "2019-01-01", motivo: "Outros" })).toBeNull();
      expect(validarDesligamento({ data: "2062-01-01", motivo: "Outros" })).toMatch(/1 ano/);
    });

    it("quem já saiu do quadro não é transferido, e a segunda transferência não sobrescreve a primeira", async () => {
      expect((await transferir(corpo({ setor: "Cantina", data: HOJE }), ctx("f-vai"))).status).toBe(200);
      expect((await transferir(corpo({ setor: "Portaria", data: HOJE }), ctx("f-vai"))).status).toBe(422);
      expect((await (await getDataSource()).obter("funcionarios", "f-vai"))?.transferido_setor).toBe("Cantina");
    });

    it("ficha inativa, mesmo sem data de desligamento, não é transferida", async () => {
      const ds = await getDataSource();
      await ds.atualizar("funcionarios", "f-vai", { ativo: false });
      expect((await transferir(corpo({ setor: "Cantina", data: HOJE }), ctx("f-vai"))).status).toBe(422);
      expect((await ds.obter("funcionarios", "f-vai"))?.desligado_em).toBe("");
    });

    const bloco = async (id: string, data: string, status: "planejada" | "realizada" = "planejada") =>
      (await getDataSource()).criar("rotinas_planejadas", {
        id, data, funcionario_id: "f-vai", sede_id: "christus_dt", tarefa_id: "christus_t2", local_id: "christus_l1",
        inicio_planejado: "10:00", fim_planejado: "10:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1,
        status, observacao: "", supervisor_id: "", criado_em: "", atualizado_em: "",
      });
    const blocosDela = async () =>
      (await (await getDataSource()).consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: "f-vai" }]))
        .map((b) => b.id)
        .sort();

    it("tira da agenda só o planejado da data em diante; o passado e o realizado ficam", async () => {
      await bloco("antes", "2026-10-26");
      await bloco("no-dia", HOJE);
      await bloco("depois", "2026-10-29");
      await bloco("feito", "2026-10-29", "realizada");
      const r = await transferir(corpo({ setor: "Cantina", data: HOJE }), ctx("f-vai"));
      expect((await r.json()).blocosRemovidos).toBe(2);
      expect(await blocosDela()).toEqual(["antes", "feito"]);
    });

    it("com data futura segue na agenda até a data, e o Gerar o dia só para nela", async () => {
      await bloco("ate-la", "2026-11-20");
      await bloco("la", "2026-11-30");
      expect((await transferir(corpo({ setor: "Cantina", data: "2026-11-30" }), ctx("f-vai"))).status).toBe(200);
      const ds = await getDataSource();
      expect(await ds.obter("funcionarios", "f-vai")).toMatchObject({ ativo: true, desligado_em: "2026-11-30", transferido_setor: "Cantina" });
      expect(await blocosDela()).toEqual(["ate-la"]);
      await gerarDiaDaRotaPadrao("christus_dt", "2026-11-23", COORD_DUAS.email);
      await gerarDiaDaRotaPadrao("christus_dt", "2026-11-30", COORD_DUAS.email);
      const datas = (await ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: "f-vai" }])).map((b) => b.data);
      expect(datas).toContain("2026-11-23");
      expect(datas).not.toContain("2026-11-30");
    });

    it("destino e encerramento são uma gravação só: não há segunda escrita que possa falhar", async () => {
      const ds = await getDataSource();
      const atualizar = vi.spyOn(ds, "atualizar").mockRejectedValue(new Error("banco fora"));
      expect((await transferir(corpo({ setor: "Cantina", data: HOJE }), ctx("f-vai"))).status).toBe(200);
      atualizar.mockRestore();
      expect(await ds.obter("funcionarios", "f-vai")).toMatchObject({ desligado_em: HOJE, transferido_setor: "Cantina" });
    });

    it("só chama o SGCP quando a vaga é pedida, e o nome do setor não vai para lá", async () => {
      const original = globalThis.fetch;
      const corpos: string[] = [];
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        corpos.push(String(init.body));
        return Response.json({ id: "orkestria_x", codigo: "555" }, { status: 201 });
      }) as unknown as typeof fetch;
      vi.stubEnv("SGCP_VAGAS_URL", "https://sgcp.test/api/vagas-externas");
      vi.stubEnv("CHAVE_ORKESTRIA", "chave-do-orkestria-de-teste-com-32-caracteres");
      try {
        const ds = await getDataSource();
        const base = await ds.obter("funcionarios", "christus_f1");
        await ds.criar("funcionarios", { ...base!, id: "f-outra", nome: "Outra Pessoa", desligado_em: "" });
        await transferir(corpo({ setor: "Marcador Cantina", data: HOJE }), ctx("f-outra"));
        expect(corpos).toHaveLength(0);
        const r = await transferir(corpo({ setor: "Marcador Cantina", data: HOJE, abrirVaga: true }), ctx("f-vai"));
        expect((await r.json()).vaga.aberta).toBe(true);
        expect(corpos).toHaveLength(1);
        expect(corpos[0]).not.toContain("Marcador");
      } finally {
        globalThis.fetch = original;
        vi.unstubAllEnvs();
      }
    });

    it("o texto livre do setor não vai para o supervisor (mesma regra do motivo)", async () => {
      await transferir(corpo({ setor: "Cantina", data: "2026-11-30" }), ctx("f-vai"));
      sessao = { ...COORD_DUAS, perfil: "supervisor" };
      const lista = (await (await listar(new Request("http://x/api/funcionarios?sede=christus_dt"))).json()) as Funcionario[];
      expect(lista.find((f) => f.id === "f-vai")?.transferido_setor).toBe("");
    });
  });
});
