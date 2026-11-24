/**
 * "Remanejos do dia" (24/11/2026): para quem está fora, o que foi feito de cada tarefa. A regra é
 * pura; a rota respeita o escopo e não entrega ao supervisor nem o tipo da ausência.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConteudoRemanejos } from "@/components/RemanejosDoDia";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { SessaoUsuario } from "@/lib/permissions";
import { remanejosDoDia } from "@/lib/remanejosDoDia";
import type { RemanejoDaPessoa } from "@/services/remanejosDoDiaService";
import type { RotinaPlanejada } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao }));
const { GET } = await import("@/app/api/remanejos/route");

const DIA = "2026-11-24";
const r = (id: string, funcionario_id: string, extra: Partial<RotinaPlanejada> = {}): RotinaPlanejada =>
  ({ id, data: DIA, funcionario_id, sede_id: "s", tarefa_id: `t-${id}`, inicio_planejado: "10:00", fim_planejado: "10:30", status: "planejada", origem_item_id: `i-${id}`, ...extra }) as RotinaPlanejada;
const item = (id: string, funcionario_id: string) => ({ id: `i-${id}`, funcionario_id });
const marca = (extra: object = {}) => JSON.stringify({ de: "ana", inicio: "10:00", fim: "10:30", observacao: "", cedidas: [], em: "2026-11-24T09:00:00Z", ...extra });
const emprestimo = (funcionario_id: string, inicio: string, fim: string) => ({ funcionario_id, data: DIA, inicio, fim, libera_rota: true });

describe("remanejosDoDia (pura)", () => {
  const calcular = (
    rotinas: RotinaPlanejada[],
    itens: { id: string; funcionario_id: string }[],
    ausentes: string[],
    eventuais: ReturnType<typeof emprestimo>[] = [],
  ) => remanejosDoDia({ rotinas, itensDaRota: itens, ausentes: new Set(ausentes), eventuais });

  it("ausente: o que ninguém pegou é 'sem ninguém'; o que passou diz para quem e como", () => {
    const [g] = calcular(
      [
        r("a", "ana"),
        r("b", "bia", { remanejo_auto: marca(), titular_id: "ana" }), // automático
        r("c", "bia", { titular_id: "ana", status: "realizada" }), // Feita por
        r("d", "bia"), // trocada à mão: o item da rota é da Ana
        r("e", "ana", { status: "cancelada" }),
        r("f", "ana", { status: "nao_realizada" }),
      ],
      ["a", "b", "c", "d", "e", "f"].map((id) => item(id, "ana")),
      ["ana"],
    );
    expect(g).toMatchObject({ funcionario_id: "ana", motivo: "ausente", janela: "" });
    expect(g.tarefas.map((t) => [t.rotina_id, t.situacao, t.para, t.como])).toEqual([
      ["a", "sem_ninguem", undefined, undefined],
      ["b", "passou", "bia", "automatico"],
      ["c", "passou", "bia", "a_mao"],
      ["d", "passou", "bia", "a_mao"],
      ["e", "cancelada", undefined, undefined],
      ["f", "registrada", undefined, undefined],
    ]);
  });

  it("quem está fora sem tarefa aparece; quem está presente não", () => {
    expect(calcular([r("a", "bia")], [item("a", "bia")], ["ana"])).toEqual([{ funcionario_id: "ana", motivo: "ausente", janela: "", tarefas: [] }]);
  });

  it("empréstimo: só as tarefas da janela, e quem trocou de horário vale pelo horário de antes", () => {
    const [g] = calcular(
      [
        r("dentro", "ana"),
        r("fora", "ana", { inicio_planejado: "15:00", fim_planejado: "15:30" }),
        r("movida", "bia", { inicio_planejado: "17:00", fim_planejado: "17:30", titular_id: "ana", remanejo_auto: marca({ motivo: "emprestimo" }) }),
      ],
      [item("dentro", "ana"), item("fora", "ana"), item("movida", "ana")],
      [],
      [emprestimo("ana", "09:00", "12:00")],
    );
    expect(g).toMatchObject({ motivo: "emprestimo", janela: "09:00–12:00" });
    expect(g.tarefas.map((t) => [t.rotina_id, t.situacao])).toEqual([["dentro", "sem_ninguem"], ["movida", "passou"]]);
    expect(g.tarefas[1].inicio).toBe("10:00"); // o horário de antes do remanejo
  });

  it("bloco sem item da rota (montado à mão) vale pelo dono atual; emprestado que também faltou conta como ausente", () => {
    const grupos = calcular([r("m", "ana", { origem_item_id: undefined })], [], ["ana"], [emprestimo("ana", "09:00", "12:00")]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ motivo: "ausente" });
    expect(grupos[0].tarefas[0].situacao).toBe("sem_ninguem");
  });

  const umSo = (bloco: RotinaPlanejada, ausentes: string[], eventuais: ReturnType<typeof emprestimo>[] = []) => {
    const todos = calcular([bloco], bloco.origem_item_id ? [{ id: bloco.origem_item_id, funcionario_id: "ana" }] : [], ausentes, eventuais);
    return todos.flatMap((g) => g.tarefas.map((t) => ({ ...t, lista: g.funcionario_id, motivo: g.motivo })));
  };

  it("quem cobre também está fora: ninguém cobre (na lista do dono, se ele está fora; senão na de quem está com ela)", () => {
    expect(umSo(r("x", "bia"), ["bia"])).toMatchObject([{ lista: "bia", situacao: "sem_ninguem" }]);
    expect(umSo(r("x", "bia"), ["ana", "bia"])).toMatchObject([{ lista: "ana", situacao: "sem_ninguem" }]);
    expect(umSo(r("x", "bia"), ["ana"], [emprestimo("bia", "09:00", "12:00")])).toMatchObject([{ lista: "ana", situacao: "sem_ninguem" }]);
    // Empréstimo de quem cobre em OUTRO horário não descobre a tarefa.
    expect(umSo(r("x", "bia"), ["ana"], [emprestimo("bia", "13:00", "15:00")])).toMatchObject([{ lista: "ana", situacao: "passou" }]);
    // Só quem está com ela está fora, no horário ATUAL dela, que é o que aparece.
    const mudou = { origem_inicio: "10:00", inicio_planejado: "14:00", fim_planejado: "14:30" };
    expect(umSo(r("x", "bia", mudou), [], [emprestimo("bia", "13:00", "15:00")])).toMatchObject([{ lista: "bia", situacao: "sem_ninguem", inicio: "14:00", fim: "14:30" }]);
    expect(umSo(r("x", "bia", mudou), [], [emprestimo("bia", "09:00", "12:00")])).toEqual([]);
    expect(umSo(r("x", "bia", mudou), ["ana"], [emprestimo("bia", "09:00", "12:00")])).toMatchObject([{ lista: "ana", situacao: "passou" }]);
    // Feita por quem depois faltou: "já registrada" na lista dela, nunca "passou" para ela mesma.
    expect(umSo(r("x", "bia", { status: "realizada" }), ["bia"])).toMatchObject([{ lista: "bia", situacao: "registrada" }]);
    // Já registrada por quem depois saiu: continua passada.
    expect(umSo(r("x", "bia", { status: "realizada" }), ["ana", "bia"])).toMatchObject([{ lista: "ana", situacao: "passou" }]);
  });

  it("cancelada ou cedida depois de passar não conta como passada; não feita por quem cobriu também não", () => {
    expect(umSo(r("x", "bia", { status: "cancelada" }), ["ana"])[0].situacao).toBe("cancelada");
    expect(umSo(r("x", "bia", { status: "remanejada" }), ["ana"])[0].situacao).toBe("cancelada");
    expect(umSo(r("x", "bia", { status: "nao_realizada" }), ["ana"])[0].situacao).toBe("registrada");
    expect(umSo(r("x", "ana", { status: "realizada" }), ["ana"])[0].situacao).toBe("registrada");
    expect(umSo(r("x", "ana", { status: "pendente" }), ["ana"])[0].situacao).toBe("sem_ninguem");
  });

  it("titular sem item da rota vale; automático e depois arrastada é troca à mão", () => {
    expect(umSo(r("x", "bia", { origem_item_id: "", titular_id: "ana", status: "realizada" }), ["ana"])).toMatchObject([{ lista: "ana", situacao: "passou", como: "a_mao" }]);
    // Item da Ana, titular gravado com quem cobria: a lista da Ana tem a tarefa; se só a Bia falta, é dela.
    const doisPassos = r("x", "caio", { titular_id: "bia", remanejo_auto: marca({ de: "bia" }) });
    expect(umSo(doisPassos, ["ana", "bia"])).toMatchObject([{ lista: "ana", situacao: "passou", para: "caio" }]);
    expect(umSo(doisPassos, ["bia"])).toMatchObject([{ lista: "bia", situacao: "passou", para: "caio" }]);
    // `titular_antes` vence o `de` do primeiro remanejo.
    const comAntes = r("x", "caio", { origem_item_id: "", titular_id: "ana", remanejo_auto: marca({ de: "bia", titular_antes: "ana" }) });
    expect(umSo(comAntes, ["ana"])).toMatchObject([{ lista: "ana", situacao: "passou" }]);
    expect(umSo(comAntes, ["bia"])).toEqual([]);
    expect(umSo(r("x", "caio", { titular_id: "ana" }), ["ana"])).toMatchObject([{ situacao: "passou", para: "caio", como: "a_mao" }]);
  });

  it("empréstimo: troca de horário vale pelo horário da dona (origem da rota; na cadeia, o primeiro remanejo)", () => {
    const e = [emprestimo("ana", "09:00", "12:00")];
    const as14 = { origem_inicio: "10:00", inicio_planejado: "14:00", fim_planejado: "14:45" };
    expect(umSo(r("x", "bia", as14), [], e)).toMatchObject([{ situacao: "passou", inicio: "10:00", fim: "10:45" }]);
    // O inverso: a tarefa das 14h que a Bia adiantou para as 10h não é do empréstimo.
    expect(umSo(r("x", "bia", { origem_inicio: "14:00" }), [], e)).toEqual([]);
    // A própria Ana mudou a dela para fora da janela: não é do empréstimo.
    expect(umSo(r("x", "ana", as14), [], e)).toEqual([]);
    const m2 = marca({ de: "bia", titular_antes: "ana", inicio: "15:00", fim: "15:30", anterior: marca({ motivo: "emprestimo" }) });
    const dois = r("x", "caio", { titular_id: "ana", inicio_planejado: "16:30", fim_planejado: "17:00", remanejo_auto: m2, origem_item_id: "" });
    expect(umSo(dois, [], e)).toMatchObject([{ lista: "ana", inicio: "10:00", fim: "10:30", como: "automatico" }]);
  });

  it("empréstimo: borda não conta, começo antes da janela conta, e várias janelas valem todas, em ordem", () => {
    const g = calcular(
      [
        r("tarde", "ana", { inicio_planejado: "15:30", fim_planejado: "16:30" }),
        r("colada", "ana", { inicio_planejado: "10:00", fim_planejado: "10:30" }),
        r("antes", "ana", { inicio_planejado: "08:30", fim_planejado: "09:30" }),
        r("colada2", "ana", { inicio_planejado: "13:30", fim_planejado: "14:00" }),
      ],
      [],
      [],
      [emprestimo("ana", "09:00", "10:00"), emprestimo("ana", "14:00", "16:00")],
    );
    expect(g).toHaveLength(1);
    expect(g[0].janela).toBe("09:00–10:00, 14:00–16:00");
    expect(g[0].tarefas.map((t) => t.rotina_id)).toEqual(["antes", "tarde"]);
  });

  it("atividade adicional comum (sem libera_rota) não põe ninguém fora", () => {
    expect(calcular([r("a", "ana")], [item("a", "ana")], [], [{ ...emprestimo("ana", "09:00", "12:00"), libera_rota: false }])).toEqual([]);
  });
});

describe("GET /api/remanejos", () => {
  const COORD: SessaoUsuario = { id: "c", nome: "C", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
  const pedir = (q: string) => GET(new Request(`http://x/api/remanejos?${q}`));

  beforeEach(async () => {
    reiniciarBanco();
    const d = await getDataSource();
    for (const x of await d.listar("rotinas_planejadas")) await d.excluir("rotinas_planejadas", x.id);
    await d.criar("ausencias", { id: "aus", funcionario_id: "christus_f1", sede_id: "christus_dt", tipo: "atestado", data_inicio: DIA, data_fim: DIA, observacao: "segredo", criado_em: "", atualizado_em: "" } as never);
    await d.criar("rotinas_planejadas", r("x", "christus_f1", { sede_id: "christus_dt", tarefa_id: "christus_t1", origem_item_id: "" }));
  });

  it("devolve a pessoa, a tarefa e a situação, sem o tipo nem a observação da ausência", async () => {
    sessao = COORD;
    const resp = await pedir(`data=${DIA}&sede=christus_dt`);
    expect(resp.status).toBe(200);
    const corpo = await resp.json();
    expect(corpo).toHaveLength(1);
    expect(corpo[0]).toMatchObject({ motivo: "ausente", tarefas: [{ situacao: "sem_ninguem" }] });
    expect(JSON.stringify(corpo)).not.toMatch(/atestado|segredo/);
  });

  it("nada de outra sede nem do que está escrito no empréstimo: quem cobre de fora vira 'Pessoa de outra sede'", async () => {
    sessao = COORD;
    const d = await getDataSource();
    const f1 = await d.obter("funcionarios", "christus_f1");
    await d.criar("funcionarios", { ...f1!, id: "f-ald", nome: "NomeDaAldeota", nome_completo: "NomeDaAldeota", sede_id: "christus_ald" });
    const ev = { local_id: "", categoria_id: "apoio_outro_setor", data: DIA, tipo: "eventual", inicio: "09:00", fim: "12:00", tempo_min: 0, observacao: "segredo-obs", supervisor_id: "", libera_rota: true, criado_em: "", atualizado_em: "" };
    await d.criar("servicos_eventuais", { ...ev, id: "e1", sede_id: "christus_dt", funcionario_id: "christus_f2", descricao: "segredo-destino" } as never);
    await d.criar("servicos_eventuais", { ...ev, id: "e2", sede_id: "christus_ald", funcionario_id: "f-ald", descricao: "" } as never);
    await d.criar("rotinas_planejadas", r("y", "f-ald", { sede_id: "christus_dt", tarefa_id: "christus_t1", origem_item_id: "", titular_id: "christus_f1" }));
    await d.criar("rotinas_planejadas", r("z-ald", "christus_f1", { sede_id: "christus_ald", tarefa_id: "christus_t1", origem_item_id: "" }));
    const texto = JSON.stringify(await (await pedir(`data=${DIA}&sede=christus_dt`)).json());
    expect(texto).not.toContain("z-ald"); // bloco de outra sede
    expect(texto).toContain("Pessoa de outra sede");
    expect(texto).toContain("09:00–12:00"); // o empréstimo daqui aparece
    expect(texto).not.toMatch(/NomeDaAldeota|segredo/);
    expect(JSON.parse(texto)).toHaveLength(2); // só as duas pessoas daqui; a emprestada da Aldeota não
    // Coordenador de duas sedes: lê cada uma, uma por vez.
    sessao = { ...COORD, sedes: ["christus_dt", "christus_ald"] };
    expect(await (await pedir(`data=${DIA}&sede=christus_ald`)).json()).toHaveLength(1);
  });

  it("ausência aberta de quem já saiu não é ausência do dia", async () => {
    sessao = COORD;
    const d = await getDataSource();
    await d.excluir("rotinas_planejadas", "x");
    await d.atualizar("funcionarios", "christus_f1", { desligado_em: DIA, ativo: false });
    expect(await (await pedir(`data=${DIA}&sede=christus_dt`)).json()).toEqual([]);
    await d.atualizar("funcionarios", "christus_f1", { desligado_em: "", ativo: false }); // inativa antiga, sem data
    expect(await (await pedir(`data=${DIA}&sede=christus_dt`)).json()).toEqual([]);
    await d.atualizar("funcionarios", "christus_f2", { desligado_em: DIA, ativo: false });
    await d.criar("servicos_eventuais", { id: "e-saiu", sede_id: "christus_dt", funcionario_id: "christus_f2", local_id: "", categoria_id: "apoio_outro_setor", data: DIA, tipo: "eventual", descricao: "x", inicio: "09:00", fim: "12:00", tempo_min: 0, observacao: "", supervisor_id: "", libera_rota: true, criado_em: "", atualizado_em: "" } as never);
    expect(await (await pedir(`data=${DIA}&sede=christus_dt`)).json()).toEqual([]);
    await d.atualizar("funcionarios", "christus_f1", { desligado_em: "2026-12-01", ativo: true }); // aviso prévio: ainda está
    expect(await (await pedir(`data=${DIA}&sede=christus_dt`)).json()).toHaveLength(1);
  });

  it("supervisor não recebe; sem sessão também não", async () => {
    sessao = { ...COORD, perfil: "supervisor" };
    expect((await pedir(`data=${DIA}&sede=christus_dt`)).status).toBe(403);
    sessao = null;
    expect((await pedir(`data=${DIA}&sede=christus_dt`)).status).toBe(401);
  });

  it("coordenador não lê outra sede: cai na dele; data ou sede inválida é 400", async () => {
    sessao = { ...COORD, sede_id: "christus_ald", sedes: ["christus_ald"] };
    expect(await (await pedir(`data=${DIA}&sede=christus_dt`)).json()).toEqual([]); // caiu na Aldeota
    sessao = COORD;
    expect((await pedir("data=2026-13-40&sede=christus_dt")).status).toBe(400);
    sessao = { ...COORD, perfil: "administrador", sede_id: "geral", sedes: [] };
    expect((await pedir(`data=${DIA}`)).status).toBe(400); // sem sede, o administrador não recebe a rede
    expect((await pedir(`data=${DIA}&sede=geral`)).status).toBe(400);
  });
});

describe("o modal", () => {
  const html = (pessoas: RemanejoDaPessoa[], ehHoje = true) =>
    renderToStaticMarkup(createElement(ConteudoRemanejos, { pessoas, sedeId: "s", ehHoje })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("ninguém fora", () => expect(html([])).toContain("Ninguém ausente nem emprestado"));

  it("conta o que passou e o que ficou sem ninguém, e mostra para quem", () => {
    const pessoas: RemanejoDaPessoa[] = [
      {
        funcionario_id: "ana",
        nome: "Ana",
        motivo: "emprestimo",
        janela: "09:00–12:00",
        tarefas: [
          { rotina_id: "1", inicio: "10:00", fim: "10:30", tarefa: "Varrer", situacao: "passou", para: "Bia", como: "automatico" },
          { rotina_id: "2", inicio: "11:00", fim: "11:30", tarefa: "Lavar", situacao: "sem_ninguem" },
        ],
      },
    ];
    const t = html(pessoas);
    expect(t).toMatch(/1 tarefa\(s\) passaram/);
    expect(t).toMatch(/1 sem cobertura registrada · resolver na Central/);
    expect(t).toContain("Emprestado(a) 09:00–12:00");
    expect(t).toMatch(/Varrer .*→ Bia \( ?automático ?\)/);
    expect(t).toMatch(/Lavar sem cobertura registrada/);
    expect(html(pessoas, false)).not.toContain("resolver na Central"); // a Central só trata hoje
  });
});
