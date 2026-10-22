/**
 * `GET /api/rotinas` e `GET /api/execucoes` com período obrigatório, teto e
 * datas reais (revisão de segurança, 22/10/2026). Sem validação, qualquer
 * perfil — inclusive o supervisor — pedia `?de=0000&ate=9999` e lia o histórico
 * inteiro da sede (o administrador sem `?sede`, de todas); as execuções, sem
 * `de`/`ate`, liam a coleção inteira. No Firestore (Blaze), leitura é custo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { MAX_DIAS_PERIODO, dataReal, diasDoPeriodo, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { ExecucaoRealizada, RotinaPlanejada } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao }));
const { GET } = await import("@/app/api/rotinas/route");
const { GET: getExecucoes } = await import("@/app/api/execucoes/route");
// Espião restaurado mesmo se o teste falhar — senão as chamadas vazam para o próximo.
afterEach(() => vi.restoreAllMocks());

const SUP: SessaoUsuario = { id: "s1", nome: "Sup", email: "s@x.com", perfil: "supervisor", sede_id: "christus_dt", sedes: ["christus_dt"] };
const ADMIN: SessaoUsuario = { id: "a1", nome: "Adm", email: "a@x.com", perfil: "administrador", sede_id: "", sedes: [] };

async function bloco(data: string) {
  const ds = await getDataSource();
  await ds.criar("rotinas_planejadas", {
    id: `r-${data}`, data, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t2",
    local_id: "christus_l1", inicio_planejado: "08:00", fim_planejado: "08:20", tempo_previsto_min: 20, tempo_visual_min: 30,
    blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "",
  } as RotinaPlanejada);
}
async function execucao(data: string) {
  const ds = await getDataSource();
  await ds.criar("execucoes_realizadas", {
    id: `e-${data}`, rotina_id: `r-${data}`, sede_id: "christus_dt", data_execucao: data, status_realizado: "conforme_planejado",
    inicio_real: "", fim_real: "", tempo_real_min: 20, justificativa: "", epis_confirmados: "", observacao: "",
    supervisor_id: "u1", criado_em: "", atualizado_em: "",
  } as ExecucaoRealizada);
}
const pedir = (q: string) => GET(new Request(`http://x/api/rotinas?${q}`));

/** Pedidos que as duas rotas recusam com 400 sem ler o banco. */
const RECUSADOS = [
  "", // sem período nenhum: nas execuções, era `listar` — a coleção inteira
  "de=0000&ate=9999", // o pedido do achado
  "de=0000-01-01&ate=9999-12-31",
  `de=2026-01-01&ate=${somarDias("2026-01-01", MAX_DIAS_PERIODO)}`, // 63 dias
  "de=2026-10-22&ate=2026-10-01",
  "de=2026-02-30&ate=2026-03-02",
  "de=2026-10-01&ate=2026-13-01",
  "de=9999-12-28&ate=9999-12-31",
  "de=9999-12-31&ate=9999-12-31", // de propósito: o laço passa por "10000-01-01"
  "de=2026-10-01&ate=2026-10-07%22",
  // ruído em volta da data (sondagem do `seguranca`)
  "de=%202026-10-01&ate=2026-10-07",
  "de=2026-10-01+&ate=2026-10-07",
  "de=2026-10-01&ate=2026-10-07%0A",
  "de=2026-10-01&ate=2026-10-07%0D%0A",
  "de=2026-10-01T00:00&ate=2026-10-07",
  "de=%EF%BC%92026-10-01&ate=2026-10-07", // dígito de largura total
  "de=0999-12-01&ate=0999-12-07", // ano abaixo de 1000
  // parâmetro faltando ou vazio — `?de=&ate=X` era o que o Painel mandava com o "De" limpo
  "de=2026-10-01",
  "ate=2026-10-07",
  "de=&ate=2026-10-07",
  "de[]=2026-10-01&ate=2026-10-07",
];

describe.each([
  ["/api/rotinas", GET],
  ["/api/execucoes", getExecucoes],
])("GET %s: período validado", (rota, get) => {
  const pedirEm = (q: string) => get(new Request(`http://x${rota}?${q}`));
  beforeEach(() => {
    reiniciarBanco();
    sessao = SUP;
  });

  it.each([["supervisor", SUP], ["administrador sem ?sede", ADMIN]])(
    "%s: 400 sem ler o banco — sem período, acima do teto, invertido, data torta, virada",
    async (_, quem) => {
      sessao = quem;
      const ds = await getDataSource();
      const consultar = vi.spyOn(ds, "consultar");
      const listar = vi.spyOn(ds, "listar");
      for (const q of RECUSADOS) expect((await pedirEm(q)).status, q).toBe(400);
      expect(consultar).not.toHaveBeenCalled();
      expect(listar).not.toHaveBeenCalled();
    },
  );

  it("parâmetro repetido: vale o primeiro, o mesmo que foi validado", async () => {
    const ds = await getDataSource();
    const consultar = vi.spyOn(ds, "consultar");
    expect((await pedirEm("de=2099-10-01&ate=2099-10-07&de=0000-01-01&sede=christus_dt")).status).toBe(200);
    expect(consultar.mock.calls[0][1]).toContainEqual(expect.objectContaining({ op: ">=", valor: "2099-10-01" }));
  });

  it("o teto atravessa virada de ano e 29/02 bissexto", async () => {
    expect((await pedirEm(`de=2027-12-01&ate=${somarDias("2027-12-01", MAX_DIAS_PERIODO - 1)}`)).status).toBe(200);
    expect((await pedirEm(`de=2028-01-15&ate=${somarDias("2028-01-15", MAX_DIAS_PERIODO - 1)}`)).status).toBe(200);
    expect((await pedirEm(`de=2028-01-15&ate=${somarDias("2028-01-15", MAX_DIAS_PERIODO)}`)).status).toBe(400);
  });
});

describe("diasDoPeriodo", () => {
  it("data real: recusa o que só tem o formato", () => {
    expect(dataReal("2026-02-28")).toBe(true);
    expect(dataReal("2028-02-29")).toBe(true); // bissexto
    for (const d of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-00-10", "0000-01-01", "10000-01-01", "2026-1-01", "amanha"])
      expect(dataReal(d), d).toBe(false);
  });

  it("devolve os dias, inclusive nas pontas, e respeita o teto", () => {
    expect(diasDoPeriodo("2026-02-27", "2026-03-02", 7)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(diasDoPeriodo("2026-10-22", "2026-10-22", 1)).toEqual(["2026-10-22"]);
    expect(diasDoPeriodo("2026-01-01", "2026-01-08", 7)).toBeNull(); // 8 dias
    expect(diasDoPeriodo("2026-01-08", "2026-01-01", 7)).toBeNull(); // invertido
  });

  it("a virada do ano 9999 não fecha o laço em `ate`", () => {
    // 9999-12-31 + 1 = "10000-01-01", que ordena antes de "9999-…"
    expect(somarDias("9999-12-31", 1)).toBe("10000-01-01");
    expect(diasDoPeriodo("9999-12-28", "9999-12-31", MAX_DIAS_PERIODO)).toBeNull();
  });
});

describe("GET /api/rotinas: devolve o período pedido", () => {
  beforeEach(() => {
    reiniciarBanco();
    sessao = SUP;
  });

  it("período legítimo devolve 200 com as rotinas: a semana, o mês, o teto exato", async () => {
    await bloco("2099-10-05");
    await bloco("2099-10-31");
    const semana = await pedir("de=2099-10-05&ate=2099-10-11&sede=christus_dt");
    expect(semana.status).toBe(200);
    expect((await semana.json()).map((r: RotinaPlanejada) => r.data)).toEqual(["2099-10-05"]);

    const mes = await pedir("de=2099-10-01&ate=2099-10-31&sede=christus_dt");
    expect(mes.status).toBe(200);
    expect((await mes.json()).map((r: RotinaPlanejada) => r.data).sort()).toEqual(["2099-10-05", "2099-10-31"]);

    const teto = await pedir(`de=2099-09-01&ate=${somarDias("2099-09-01", MAX_DIAS_PERIODO - 1)}`);
    expect(teto.status).toBe(200);
    expect(await teto.json()).toHaveLength(2);
  });

  it("?data= continua funcionando", async () => {
    await bloco("2099-10-05");
    const dia = await pedir("data=2099-10-05&sede=christus_dt");
    expect(dia.status).toBe(200);
    expect(await dia.json()).toHaveLength(1);
  });
});

describe("GET /api/execucoes: devolve o período pedido", () => {
  beforeEach(() => {
    reiniciarBanco();
    sessao = SUP;
  });

  it("o dia (Agenda, Acompanhamento), o mês (Relatórios) e o teto exato", async () => {
    await execucao("2099-10-05");
    await execucao("2099-10-31");
    const dia = await getExecucoes(new Request("http://x/api/execucoes?de=2099-10-05&ate=2099-10-05&sede=christus_dt"));
    expect(dia.status).toBe(200);
    expect((await dia.json()).map((e: ExecucaoRealizada) => e.data_execucao)).toEqual(["2099-10-05"]);

    const mes = await getExecucoes(new Request("http://x/api/execucoes?de=2099-10-01&ate=2099-10-31&sede=christus_dt"));
    expect((await mes.json()).map((e: ExecucaoRealizada) => e.data_execucao).sort()).toEqual(["2099-10-05", "2099-10-31"]);

    const teto = await getExecucoes(new Request(`http://x/api/execucoes?de=2099-09-01&ate=${somarDias("2099-09-01", MAX_DIAS_PERIODO - 1)}`));
    expect(teto.status).toBe(200);
    expect(await teto.json()).toHaveLength(2);
  });
});
