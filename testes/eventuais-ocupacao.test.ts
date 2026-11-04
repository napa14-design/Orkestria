/**
 * Serviço eventual na ocupação (04/11/2026). A coordenação registrava o apoio ao
 * pedagógico e o mostrador não mudava: a pessoa ficava "no limbo". Conta só o tempo
 * que ela não tinha com tarefa, senão o mesmo horário entra em dobro.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OccupancySummary from "@/components/agenda/OccupancySummary";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { SessaoUsuario } from "@/lib/permissions";
import { resumoExecutivo } from "@/services/resumoExecutivoService";
import { createServicoEventual, updateServicoEventual } from "@/services/servicosEventuaisService";
import {
  CATEGORIA_APOIO_PEDAGOGICO,
  eventuaisForaDasTarefas,
  eventuaisNoApoio,
  ocupacaoPorPessoa,
  PARAMETROS_PADRAO,
  MAX_MINUTOS_EVENTUAL,
  percentualApoioOutroSetor,
  resumoDeOcupacao,
  resumoFuncionario,
  semAusentes,
} from "@/lib/calculations";
import { ErroValidacao } from "@/services/erros";
import type { Ausencia, Feriado, Funcionario, RotinaPlanejada, ServicoEventual, StatusRotina } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));
const { GET, POST } = await import("@/app/api/servicos-eventuais/route");
const { PUT, DELETE } = await import("@/app/api/servicos-eventuais/[id]/route");
const { GET: GET_FERIADOS } = await import("@/app/api/feriados/route");

const DIA = "2026-11-04";
const bloco = (inicio: string, fim: string, min: number, status: StatusRotina = "planejada", extra: Partial<RotinaPlanejada> = {}) =>
  ({ id: inicio, data: DIA, funcionario_id: "f", tarefa_id: "t", inicio_planejado: inicio, fim_planejado: fim, tempo_previsto_min: min, status, ...extra }) as RotinaPlanejada;
const evento = (inicio: string, fim: string, tempo_min: number, extra: Partial<ServicoEventual> = {}) =>
  ({ id: inicio, sede_id: "s", funcionario_id: "f", data: DIA, inicio, fim, tempo_min, categoria_id: CATEGORIA_APOIO_PEDAGOGICO, ...extra }) as ServicoEventual;
const minutos = (r: RotinaPlanejada[], e: ServicoEventual[]) => eventuaisForaDasTarefas(r, e).reduce((s, x) => s + x.tempo_previsto_min, 0);

describe("eventuaisForaDasTarefas", () => {
  it("em horário livre, conta inteiro", () => {
    expect(minutos([bloco("07:00", "08:00", 60)], [evento("09:00", "10:35", 95)])).toBe(95);
  });

  it("em horário com tarefa, não conta o que já estava planejado", () => {
    expect(minutos([bloco("09:00", "10:00", 60)], [evento("09:00", "10:35", 95)])).toBe(35);
    expect(minutos([bloco("08:00", "12:00", 240)], [evento("09:00", "10:35", 95)])).toBe(0);
  });

  it("tarefas sobrepostas não descontam duas vezes", () => {
    expect(minutos([bloco("09:00", "10:00", 60), bloco("09:30", "10:00", 30)], [evento("09:00", "10:30", 90)])).toBe(30);
  });

  it("tarefa cancelada ou remanejada não ocupa o horário", () => {
    expect(minutos([bloco("09:00", "10:00", 60, "cancelada")], [evento("09:00", "10:00", 60)])).toBe(60);
    expect(minutos([bloco("09:00", "10:00", 60, "remanejada")], [evento("09:00", "10:00", 60)])).toBe(60);
  });

  it("dois eventuais no mesmo horário não contam em dobro", () => {
    expect(minutos([], [evento("09:00", "10:00", 60), evento("09:30", "10:30", 60)])).toBe(90);
  });

  it("sem início e fim, entra o tempo inteiro", () => {
    expect(minutos([bloco("09:00", "10:00", 60)], [evento("", "", 45)])).toBe(45);
    expect(minutos([bloco("09:00", "10:00", 60)], [evento("10:00", "09:00", 45)])).toBe(45);
  });

  it("com início e fim, vale o horário, não o tempo digitado", () => {
    expect(minutos([bloco("09:00", "10:00", 60)], [evento("09:00", "10:00", 120)])).toBe(0); // tudo com tarefa
    expect(minutos([], [evento("09:00", "10:00", 480)])).toBe(60); // não infla
    expect(minutos([], [evento("09:00", "10:35", 0)])).toBe(95); // o formulário nasce com 0
    expect(minutos([bloco("09:00", "10:00", 60)], [evento("09:00", "11:00", 30)])).toBe(60);
  });

  it("não depende da ordem dos lançamentos", () => {
    const a = evento("09:00", "10:00", 30);
    const b = { ...evento("09:00", "10:00", 60), id: "b" };
    expect(minutos([], [a, b])).toBe(60);
    expect(minutos([], [b, a])).toBe(60);
  });

  it("tempo gravado como texto não vira concatenação, e zero ou negativo não cria registro", () => {
    expect(minutos([bloco("09:00", "10:00", 60)], [evento("", "", "60" as never), evento("", "", "30" as never)])).toBe(90);
    expect(eventuaisForaDasTarefas([], [evento("", "", 0)])).toEqual([]);
    expect(eventuaisForaDasTarefas([], [evento("", "", -5)])).toEqual([]);
    expect(eventuaisForaDasTarefas([], [evento("", "", "abc" as never)])).toEqual([]);
  });

  it("o teto vale por pessoa e dia: vários lançamentos sem horário não somam sem limite", () => {
    const muitos = Array.from({ length: 5 }, (_, i) => ({ ...evento("", "", 1440), id: `e${i}` }));
    expect(minutos([], muitos)).toBe(MAX_MINUTOS_EVENTUAL);
    expect(eventuaisForaDasTarefas([], muitos)).toHaveLength(1);
    // Outro dia ou outra pessoa têm o próprio teto.
    expect(minutos([], [evento("", "", 1440), evento("", "", 1440, { data: "2026-11-05" }), evento("", "", 1440, { funcionario_id: "g" })])).toBe(3 * MAX_MINUTOS_EVENTUAL);
    expect(eventuaisNoApoio([], muitos, [CATEGORIA_APOIO_PEDAGOGICO]).apoioMin).toBe(MAX_MINUTOS_EVENTUAL);
  });

  it("horário com fim igual ao início não é janela: vale o tempo digitado, e não desconta tarefa", () => {
    expect(minutos([bloco("09:00", "10:00", 60)], [evento("09:30", "09:30", 45)])).toBe(45);
  });

  it("sem pessoa, não é ocupação de ninguém", () => {
    expect(eventuaisForaDasTarefas([], [evento("09:00", "10:00", 60, { funcionario_id: "" })])).toEqual([]);
  });

  it("tarefa de outra pessoa ou de outro dia não desconta", () => {
    expect(minutos([bloco("09:00", "10:00", 60, "planejada", { funcionario_id: "outra" })], [evento("09:00", "10:00", 60)])).toBe(60);
    expect(minutos([bloco("09:00", "10:00", 60, "planejada", { data: "2026-11-05" })], [evento("09:00", "10:00", 60)])).toBe(60);
  });
});

describe("no mostrador e no Painel", () => {
  const pessoa = { id: "f", nome: "Ana", entrada: "07:00", saida: "17:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", escala: "seg_sex" } as Funcionario;

  const mostrador = (
    eventuais: ServicoEventual[],
    { rotinas = [bloco("07:00", "08:00", 60)], ausencias = [], feriados = [], data = DIA }: { rotinas?: RotinaPlanejada[]; ausencias?: Ausencia[]; feriados?: Feriado[]; data?: string } = {},
  ) =>
    renderToStaticMarkup(
      createElement(OccupancySummary, {
        funcionarios: [pessoa],
        rotinas,
        eventuais,
        ausencias,
        feriados,
        data,
        tarefas: [],
        parametros: PARAMETROS_PADRAO,
        selecionadoId: "f",
        aoSelecionar: () => {},
      }),
    ).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("o mostrador da Rotina sobe com o eventual e explica por quê", () => {
    const sem = mostrador([]);
    expect(sem).toContain("11.1%");
    expect(sem).not.toContain("Eventual lançado");
    const com = mostrador([evento("09:00", "10:30", 90)]);
    expect(com).toContain("27.8%");
    expect(com).toContain("Eventual lançado 1h30");
    expect(com).toContain("Fora das tarefas (já somado) 1h30");
    expect(com).toContain("Tarefas no dia 1");
  });

  it("eventual inteiro sobre tarefa: a ocupação não muda, mas o lançamento aparece", () => {
    const com = mostrador([evento("07:00", "08:00", 60)]);
    expect(com).toContain("11.1%");
    expect(com).toContain("Eventual lançado 1h");
    expect(com).toContain("Fora das tarefas (já somado) 0min");
  });

  it("só eventual em folga ou feriado: mostra as horas, sem % nem selo de subutilizado", () => {
    const feriado = { id: "x", sede_id: "", nome: "F", data_inicio: DIA, data_fim: DIA, ativo: true } as Feriado;
    const casos = [
      mostrador([evento("09:00", "10:00", 60, { data: "2026-11-07" })], { rotinas: [], data: "2026-11-07" }), // sábado
      mostrador([evento("09:00", "10:00", 60)], { rotinas: [], feriados: [feriado] }),
    ];
    for (const tela of casos) {
      expect(tela).toContain("Só eventual");
      expect(tela).toContain("Tempo planejado 1h");
      expect(tela).not.toContain("Subutilizado");
      expect(tela).not.toContain("Ociosidade");
      expect(tela).not.toMatch(/\d%/u);
    }
  });

  it("em dia de escala sem agenda, segue medindo como qualquer dia", () => {
    const tela = mostrador([evento("09:00", "10:00", 60)], { rotinas: [] });
    expect(tela).not.toContain("Só eventual");
    expect(tela).toContain("11.1%");
    expect(tela).toContain("Ociosidade prevista");
  });

  it("com bloco em feriado, segue medindo: o bloco é do planejamento, não do eventual", () => {
    const feriado = { id: "x", sede_id: "", nome: "F", data_inicio: DIA, data_fim: DIA, ativo: true } as Feriado;
    expect(mostrador([evento("09:00", "10:00", 60)], { feriados: [feriado] })).toContain("22.2%");
  });

  it("em dia ausente, o eventual não conta em tela nenhuma: nem % nem lançado", () => {
    const ausencia = { id: "a", funcionario_id: "f", data_inicio: DIA, data_fim: DIA } as Ausencia;
    const tela = mostrador([evento("09:00", "10:30", 90)], { ausencias: [ausencia] });
    expect(tela).toContain("11.1%");
    expect(tela).not.toContain("Eventual lançado");
    // Ausência de outra pessoa ou de outro dia não apaga.
    const outra = { ...ausencia, funcionario_id: "g" };
    const antes = { ...ausencia, data_inicio: "2026-11-01", data_fim: "2026-11-03" };
    expect(semAusentes([evento("09:00", "10:30", 90)], [outra, antes])).toHaveLength(1);
    expect(semAusentes([evento("09:00", "10:30", 90)], [{ ...antes, data_fim: DIA }])).toHaveLength(0);
  });

  it("ao trocar de data, o eventual do dia anterior não soma enquanto a lista nova não chega", () => {
    expect(mostrador([evento("09:00", "10:30", 90, { data: "2026-11-03" })])).toContain("11.1%");
  });

  it("em feriado, soma tempo, mas não entra no denominador; feriado de outra sede não vale", () => {
    const dele = { id: "x", sede_id: "s", nome: "F", data_inicio: DIA, data_fim: DIA, ativo: true } as Feriado;
    const fora = eventuaisForaDasTarefas([], [evento("09:00", "10:00", 60)]);
    const comSede = { ...pessoa, sede_id: "s" };
    expect(ocupacaoPorPessoa([comSede], fora, [dele])[0]).toMatchObject({ dias: 0, planejado: 60 });
    expect(ocupacaoPorPessoa([comSede], fora, [{ ...dele, sede_id: "outra" }])[0].dias).toBe(1);
    expect(ocupacaoPorPessoa([comSede], fora, [{ ...dele, ativo: false }])[0].dias).toBe(1);
    // Com bloco, o dia conta como sempre contou, mesmo em feriado.
    const b = bloco("07:00", "08:00", 60);
    expect(ocupacaoPorPessoa([comSede], [b], [dele])[0].dias).toBe(1);
  });

  it("no mostrador, o horário que já tinha tarefa não conta em dobro, e o eventual de outra pessoa não entra", () => {
    const com = mostrador([evento("07:00", "08:30", 90), evento("09:00", "10:00", 60, { funcionario_id: "outra" })]);
    expect(com).toContain("16.7%"); // 90 de 540: 60 da tarefa + 30 fora dela
    expect(com).toContain("Eventual lançado 1h30");
    expect(com).toContain("Fora das tarefas (já somado) 30min");
  });

  it("o resumo do dia soma o eventual ao planejado e tira da ociosidade", () => {
    const sem = resumoFuncionario(pessoa, [bloco("07:00", "08:00", 60)], PARAMETROS_PADRAO);
    const com = resumoFuncionario(pessoa, [bloco("07:00", "08:00", 60)], PARAMETROS_PADRAO, 95);
    expect(com.tempo_planejado_min).toBe(sem.tempo_planejado_min + 95);
    expect(com.ocupacao_percentual).toBeGreaterThan(sem.ocupacao_percentual);
    expect(com.ociosidade_prevista_min).toBe(sem.ociosidade_prevista_min - 95);
    expect(com.total_tarefas).toBe(sem.total_tarefas);
  });

  it("no Painel, dia de escala só com eventual entra na conta, com a jornada do dia", () => {
    const fora = eventuaisForaDasTarefas([], [evento("09:00", "10:35", 95)]);
    const [p] = ocupacaoPorPessoa([pessoa], fora);
    expect(p.dias).toBe(1);
    expect(p.planejado).toBe(95);
    expect(resumoDeOcupacao([p], PARAMETROS_PADRAO).pessoasPlanejadas).toBe(1);
  });

  it("em folga, soma tempo, mas não entra no denominador", () => {
    const fora = eventuaisForaDasTarefas([], [evento("09:00", "10:35", 95, { data: "2026-11-07" })]); // sábado
    const [p] = ocupacaoPorPessoa([pessoa], fora);
    expect(p.dias).toBe(0);
    expect(p.planejado).toBe(95);
    expect(p.ocupacao).toBe(0);
    // Quem trabalha no sábado conta o dia.
    expect(ocupacaoPorPessoa([{ ...pessoa, escala: "seg_sab" }], fora)[0].dias).toBe(1);
  });

  it("1 h na folga sobe a ocupação de quem já estava cheio, em vez de derrubar", () => {
    const cheio = bloco("07:00", "16:00", 540);
    const fora = eventuaisForaDasTarefas([cheio], [evento("09:00", "10:00", 60, { data: "2026-11-07" })]);
    const [p] = ocupacaoPorPessoa([pessoa], [cheio, ...fora]);
    expect(p.dias).toBe(1);
    expect(p.planejado).toBe(600);
    expect(p.ocupacao).toBeGreaterThan(100);
  });

  it("no apoio, entra o eventual inteiro, mesmo sobre tarefa; no total, só o que não tinha tarefa", () => {
    const blocos = [bloco("09:00", "10:00", 60), bloco("07:00", "08:00", 60)];
    const evs = [evento("09:00", "10:30", 90)];
    const conta = eventuaisNoApoio(blocos, evs, [CATEGORIA_APOIO_PEDAGOGICO]);
    expect(conta).toEqual({ apoioMin: 90, foraDasTarefasMin: 30 });
    expect(percentualApoioOutroSetor(blocos, new Set(), conta)).toBe(60); // 90 de 150
  });

  it("no apoio também vale o horário, e eventual sem pessoa não conta", () => {
    expect(eventuaisNoApoio([], [evento("09:00", "10:35", 0)], [CATEGORIA_APOIO_PEDAGOGICO]).apoioMin).toBe(95);
    expect(eventuaisNoApoio([], [evento("09:00", "10:00", 60, { funcionario_id: "" })], [CATEGORIA_APOIO_PEDAGOGICO])).toEqual({ apoioMin: 0, foraDasTarefasMin: 0 });
  });

  it("erro de digitação não distorce o relatório: teto de um dia, também no que já está gravado", () => {
    expect(minutos([], [evento("", "", 100000)])).toBe(MAX_MINUTOS_EVENTUAL);
    expect(eventuaisNoApoio([], [evento("", "", 100000)], [CATEGORIA_APOIO_PEDAGOGICO]).apoioMin).toBe(MAX_MINUTOS_EVENTUAL);
    // Hora impossível não é janela, mesmo a que `hhmmParaMin` aceitaria calada.
    for (const fim of ["99:99", "09:99", "24:00", "9:30"]) expect(minutos([], [evento("09:00", fim, 60)])).toBe(60);
    expect(minutos([], [evento(9 as never, "10:00", 60)])).toBe(60);
  });

  describe("ao gravar", () => {
    const base = () => ({ sede_id: "christus_dt", funcionario_id: "christus_f1", local_id: "", categoria_id: "", data: DIA, tipo: "eventual", descricao: "Provas", observacao: "", supervisor_id: "" }) as never;
    const dados = (extra: Record<string, unknown>) => ({ ...(base() as object), ...extra }) as never;

    it("com início e fim, o tempo gravado é o do horário, e a lista mostra o que conta", async () => {
      reiniciarBanco();
      const criado = await createServicoEventual(dados({ inicio: "09:00", fim: "10:35", tempo_min: 0 }), "c@x.com");
      expect(criado.tempo_min).toBe(95);
      const editado = await updateServicoEventual(criado.id, { fim: "10:00", tempo_min: 480 } as never, "c@x.com");
      expect(editado.tempo_min).toBe(60);
    });

    it("sem horário, vale o digitado, arredondado", async () => {
      reiniciarBanco();
      const criado = await createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 45.6 }), "c@x.com");
      expect(criado.tempo_min).toBe(46);
      expect((await updateServicoEventual(criado.id, { tempo_min: "60" } as never, "c@x.com")).tempo_min).toBe(60);
    });

    it("com horário, o tempo digitado não impede salvar: é descartado", async () => {
      reiniciarBanco();
      const criado = await createServicoEventual(dados({ inicio: "09:00", fim: "10:00", tempo_min: 2000 }), "c@x.com");
      expect(criado.tempo_min).toBe(60);
    });

    it("não grava campo de autoria nem campo desconhecido, nem na criação nem na edição", async () => {
      reiniciarBanco();
      const forjado = { criado_por: "outro@x.com", criado_em: "2001-01-01", atualizado_por: "outro@x.com", id: "forjado", xyz: 1 };
      const criado = await createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 60, ...forjado }), "c@x.com");
      expect(criado).toMatchObject({ criado_por: "c@x.com" });
      expect(criado.id).not.toBe("forjado");
      expect(criado).not.toHaveProperty("xyz");
      const editado = await updateServicoEventual(criado.id, { descricao: "Outra", ...forjado } as never, "c@x.com");
      expect(editado).toMatchObject({ descricao: "Outra", criado_por: "c@x.com", atualizado_por: "c@x.com", id: criado.id });
      expect(editado.criado_em).not.toBe("2001-01-01");
      expect(editado).not.toHaveProperty("xyz");
    });

    it("editar não troca quem registrou", async () => {
      reiniciarBanco();
      const criado = await createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 60, supervisor_id: "quem-registrou" }), "c@x.com");
      const editado = await updateServicoEventual(criado.id, { descricao: "Outra", supervisor_id: "forjado" } as never, "c@x.com");
      expect(editado.supervisor_id).toBe("quem-registrou");
    });

    it("recusa data que não existe e tipo fora da lista: a data entra na conta", async () => {
      reiniciarBanco();
      for (const ruim of [{ data: "lixo" }, { data: "" }, { data: null }, { data: 123 }, { data: "2099-13-45" }, { data: "2099-03-10x" }, { tipo: "qualquer" }])
        await expect(createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 60, ...ruim }), "c@x.com")).rejects.toThrow();
      expect(await (await getDataSource()).listar("servicos_eventuais")).toEqual([]);
      const imprevisto = await createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 60, tipo: "imprevisto" }), "c@x.com");
      expect(imprevisto.tipo).toBe("imprevisto");
    });

    it("recusa tempo acima de um dia, texto, hora impossível, hora que não é texto e horário invertido", async () => {
      reiniciarBanco();
      for (const ruim of [
        { tempo_min: 1441 },
        { tempo_min: "abc" },
        { tempo_min: 10, inicio: "09:00", fim: "99:99" },
        { tempo_min: 10, inicio: ["09:00"], fim: "" },
        { tempo_min: 0, inicio: "17:00", fim: "16:00" },
        { tempo_min: 0, inicio: "16:00", fim: "16:00" },
      ])
        await expect(createServicoEventual(dados({ inicio: "", fim: "", ...ruim }), "c@x.com")).rejects.toThrow();
      const ok = await createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 60 }), "c@x.com");
      await expect(updateServicoEventual(ok.id, { tempo_min: "abc" } as never, "c@x.com")).rejects.toThrow();
      expect((await (await getDataSource()).obter("servicos_eventuais", ok.id))?.tempo_min).toBe(60);
    });

    it("sem início e fim, tempo zero é recusado: gravava e o mostrador não mudava, a queixa original", async () => {
      reiniciarBanco();
      for (const tempo_min of [0, 0.4, "0.4", -5, null, undefined, "", "  ", true, [5], {}])
        await expect(createServicoEventual(dados({ inicio: "", fim: "", tempo_min }), "c@x.com"), String(tempo_min)).rejects.toThrow(ErroValidacao);
      // Só o início não fecha a janela: o tempo continua obrigatório.
      await expect(createServicoEventual(dados({ inicio: "09:00", fim: "", tempo_min: 0 }), "c@x.com")).rejects.toThrow(ErroValidacao);
      expect(await (await getDataSource()).listar("servicos_eventuais")).toEqual([]);
      // E editar não tira o que faz o lançamento contar.
      const ok = await createServicoEventual(dados({ inicio: "09:00", fim: "10:00", tempo_min: 0 }), "c@x.com");
      await expect(updateServicoEventual(ok.id, { inicio: "", fim: "", tempo_min: 0 } as never, "c@x.com")).rejects.toThrow(ErroValidacao);
    });

    it("com início e fim, tempo em branco não atrapalha", async () => {
      reiniciarBanco();
      expect((await createServicoEventual(dados({ inicio: "09:00", fim: "10:00", tempo_min: null }), "c@x.com")).tempo_min).toBe(60);
    });

    it("recusa hora quase certa e campo do tipo errado com erro de validação, nunca 500", async () => {
      reiniciarBanco();
      for (const ruim of [
        { inicio: "25:00", fim: "26:00" },
        { inicio: "09:75", fim: "10:00" },
        { inicio: "09:00", fim: "24:00" },
        { inicio: 0, fim: "" },
        { inicio: false, fim: "" },
        { descricao: 123 },
        { descricao: ["x"] },
        { observacao: 123 },
        { funcionario_id: { a: 1 } },
        { local_id: 5 },
        { categoria_id: [] },
        { sede_id: 7 },
      ])
        await expect(createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 60, ...ruim }), "c@x.com"), JSON.stringify(ruim)).rejects.toThrow(ErroValidacao);
      // No banco de memória, um id esquisito só "não existe"; no Firestore, derruba o `doc()`.
      for (const ruim of [{ funcionario_id: { a: 1 } }, { local_id: 5 }, { categoria_id: [] }, { sede_id: 7 }])
        await expect(createServicoEventual(dados({ inicio: "", fim: "", tempo_min: 60, ...ruim }), "c@x.com"), JSON.stringify(ruim))
          .rejects.toMatchObject({ alertas: [expect.objectContaining({ codigo: "VINCULO_INVALIDO" })] });
      for (const corpo of [null, [], 5, "x"])
        await expect(createServicoEventual(corpo as never, "c@x.com"), JSON.stringify(corpo)).rejects.toThrow(ErroValidacao);
      expect(await (await getDataSource()).listar("servicos_eventuais")).toEqual([]);
    });
  });

  describe("permissão nas rotas de gravação", () => {
    const corpo = { sede_id: "christus_dt", funcionario_id: "christus_f1", data: DIA, tipo: "eventual", descricao: "Provas", inicio: "09:00", fim: "10:00", tempo_min: 0 };
    const req = (metodo: string, b: unknown, url = "http://x/api/servicos-eventuais") =>
      new Request(url, { method: metodo, body: typeof b === "string" ? b : JSON.stringify(b) });
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const coord: SessaoUsuario = { id: "c", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };

    it("supervisor e visualizador não gravam: POST, PUT e DELETE dão 403 e nada muda", async () => {
      reiniciarBanco();
      const ds = await getDataSource();
      await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "e", sede_id: "christus_dt", funcionario_id: "christus_f1", descricao: "Antes" }));
      for (const perfil of ["supervisor", "visualizador"] as const) {
        sessao = { ...coord, id: "s", perfil };
        expect((await POST(req("POST", corpo))).status).toBe(403);
        expect((await PUT(req("PUT", { descricao: "Depois" }), ctx("e"))).status).toBe(403);
        expect((await DELETE(req("DELETE", {}), ctx("e"))).status).toBe(403);
      }
      const lista = await ds.listar("servicos_eventuais");
      expect(lista).toHaveLength(1);
      expect(lista[0].descricao).toBe("Antes");
    });

    it("coordenador não grava em sede que não opera, nem leva o lançamento para lá", async () => {
      reiniciarBanco();
      const ds = await getDataSource();
      await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "dele", sede_id: "christus_dt", funcionario_id: "christus_f1" }));
      await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "alheio", sede_id: "christus_ald", funcionario_id: "" }));
      sessao = coord;
      expect((await POST(req("POST", { ...corpo, sede_id: "christus_ald" }))).status).toBe(403);
      expect((await PUT(req("PUT", { sede_id: "christus_ald" }), ctx("dele"))).status).toBe(403);
      expect((await PUT(req("PUT", { descricao: "x" }), ctx("alheio"))).status).toBe(403);
      expect((await DELETE(req("DELETE", {}), ctx("alheio"))).status).toBe(403);
      expect(await ds.listar("servicos_eventuais")).toHaveLength(2);
    });

    it("quem registrou vem da sessão, não do corpo; autoria forjada não passa", async () => {
      reiniciarBanco();
      sessao = coord;
      const r = await POST(req("POST", { ...corpo, supervisor_id: "forjado", criado_por: "forjado@x.com" }));
      expect(r.status).toBe(201);
      expect(await r.json()).toMatchObject({ supervisor_id: "c", criado_por: "c@x.com", tempo_min: 60 });
    });

    it("corpo que não é lançamento dá recusa, não 500", async () => {
      reiniciarBanco();
      const ds = await getDataSource();
      await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "e", sede_id: "christus_dt", funcionario_id: "christus_f1", tipo: "eventual", descricao: "Antes" }));
      sessao = { ...coord, perfil: "administrador", sede_id: "", sedes: [] };
      for (const b of ["null", "[]", "5", "{não é json"]) {
        expect((await POST(req("POST", b))).status, b).toBe(422);
        expect((await PUT(req("PUT", b), ctx("e"))).status, b).toBe(422);
      }
      sessao = coord; // sem sede no corpo: nem chega a validar
      expect((await POST(req("POST", "null"))).status).toBe(403);
    });
  });

  it("o resumo do Chromos lê os eventuais do período pelo serviço", async () => {
    reiniciarBanco();
    const ds = await getDataSource();
    await ds.criar("rotinas_planejadas", { ...bloco("07:00", "08:00", 60), id: "r", data: "2099-03-10", funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t2" });
    await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "e", data: "2099-03-10", funcionario_id: "christus_f1", sede_id: "christus_dt" }));
    // De outro mês, antes ou depois: não pode entrar.
    await ds.criar("servicos_eventuais", evento("11:00", "12:00", 60, { id: "e2", data: "2099-04-10", funcionario_id: "christus_f1", sede_id: "christus_dt" }));
    await ds.criar("servicos_eventuais", evento("11:00", "12:00", 60, { id: "e3", data: "2099-02-28", funcionario_id: "christus_f1", sede_id: "christus_dt" }));
    const r = await resumoExecutivo("2099-03", "2099-03", new Date("2026-11-04T12:00:00Z"));
    expect(r.geral.apoioPedagogicoPct).toBe(50);
  });

  it("o resumo do Chromos não conta eventual de dia ausente", async () => {
    reiniciarBanco();
    const ds = await getDataSource();
    const agora = new Date("2026-11-04T12:00:00Z");
    const nomes = { funcionario_id: "christus_f1", sede_id: "christus_dt" };
    await ds.criar("rotinas_planejadas", { ...bloco("07:00", "08:00", 60), id: "r", data: "2099-07-13", tarefa_id: "christus_t2", ...nomes });
    const so = await resumoExecutivo("2099-07", "2099-07", agora);
    await ds.criar("rotinas_planejadas", { ...bloco("07:00", "08:00", 60), id: "r2", data: "2099-08-13", tarefa_id: "christus_t2", ...nomes });
    await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "e", data: "2099-08-14", ...nomes }));
    await ds.criar("ausencias", { id: "a", tipo: "falta", observacao: "", data_inicio: "2099-08-14", data_fim: "2099-08-14", ...nomes } as never);
    const r = await resumoExecutivo("2099-08", "2099-08", agora);
    // Igual ao mês só com o bloco: nem o tempo, nem o dia, nem o apoio do lançamento.
    expect(r.geral.ocupacaoMediaPct).toBe(so.geral.ocupacaoMediaPct);
    expect(r.geral.apoioPedagogicoPct).toBe(0);
  });

  it("o resumo do Chromos não cria dia em feriado", async () => {
    reiniciarBanco();
    const ds = await getDataSource();
    await ds.criar("rotinas_planejadas", { ...bloco("07:00", "08:00", 60), id: "r", data: "2099-05-11", funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t2" });
    await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "e", data: "2099-05-12", funcionario_id: "christus_f1", sede_id: "christus_dt" }));
    const semFeriado = await resumoExecutivo("2099-05", "2099-05", new Date("2026-11-04T12:00:00Z"));
    await ds.criar("feriados", { id: "f", sede_id: "", nome: "F", data_inicio: "2099-06-12", data_fim: "2099-06-12", ativo: true } as never);
    await ds.criar("rotinas_planejadas", { ...bloco("07:00", "08:00", 60), id: "r2", data: "2099-06-11", funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t2" });
    await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, { id: "e2", data: "2099-06-12", funcionario_id: "christus_f1", sede_id: "christus_dt" }));
    const comFeriado = await resumoExecutivo("2099-06", "2099-06", new Date("2026-11-04T12:00:00Z"));
    expect(comFeriado.geral.ocupacaoMediaPct).toBeGreaterThan(semFeriado.geral.ocupacaoMediaPct!);
  });

  it("o supervisor recebe só quem, quando e quanto: nem descrição, nem observação, nem e-mail", async () => {
    reiniciarBanco();
    const ds = await getDataSource();
    await ds.criar("servicos_eventuais", evento("09:00", "10:00", 60, {
      id: "e", funcionario_id: "christus_f1", sede_id: "christus_dt", descricao: "Texto livre", observacao: "atestado de alguém", criado_por: "c@x.com",
    }));
    const pedir = () => GET(new Request(`http://x/api/servicos-eventuais?de=${DIA}&ate=${DIA}&sede=christus_dt`));
    sessao = { id: "s", nome: "Sup", email: "s@x.com", perfil: "supervisor", sede_id: "christus_dt", sedes: ["christus_dt"] };
    const lista = await (await pedir()).json();
    expect(lista).toEqual([expect.objectContaining({ funcionario_id: "christus_f1", inicio: "09:00", fim: "10:00", tempo_min: 60 })]);
    expect(JSON.stringify(lista)).not.toMatch(/Texto livre|atestado|c@x\.com|apoio_pedagogico|categoria_id|tipo/);
    // Lançamento sem pessoa não serve ao mostrador, e sem período a rota não lê o histórico.
    await ds.criar("servicos_eventuais", evento("11:00", "12:00", 60, { id: "e2", funcionario_id: "", sede_id: "christus_dt" }));
    expect(await (await pedir()).json()).toHaveLength(1);
    for (const q of ["", "&de=0000&ate=9999", "&de=2026-11-01&ate=2026-11-30", `&de=${DIA}`, "&de=2026-11-09&ate=2026-11-02"])
      expect((await GET(new Request(`http://x/api/servicos-eventuais?sede=christus_dt${q}`))).status).toBe(400);
    expect((await GET(new Request("http://x/api/servicos-eventuais?sede=christus_dt&de=2026-11-02&ate=2026-11-08"))).status).toBe(200); // a semana
    sessao = { id: "c", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
    const doCoordenador = await (await pedir()).json();
    expect(doCoordenador).toHaveLength(2);
    expect(JSON.stringify(doCoordenador)).toContain("atestado");
    expect((await GET(new Request("http://x/api/servicos-eventuais?sede=christus_dt"))).status).toBe(200); // a tela de lançamentos
  });

  it("o supervisor vê o feriado, mas não o e-mail de quem criou", async () => {
    reiniciarBanco();
    await (await getDataSource()).criar("feriados", {
      id: "f", sede_id: "", nome: "Feriado", data_inicio: DIA, data_fim: DIA, ativo: true, criado_por: "outra-sede@x.com", atualizado_por: "outra-sede@x.com", criado_em: "", atualizado_em: "",
    });
    sessao = { id: "s", nome: "Sup", email: "s@x.com", perfil: "supervisor", sede_id: "christus_dt", sedes: ["christus_dt"] };
    const dele = await (await GET_FERIADOS(new Request("http://x/api/feriados?sede=christus_dt"))).json();
    expect(dele).toEqual([{ id: "f", sede_id: "", nome: "Feriado", data_inicio: DIA, data_fim: DIA, ativo: true }]);
    sessao = { id: "c", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
    expect(JSON.stringify(await (await GET_FERIADOS(new Request("http://x/api/feriados?sede=christus_dt"))).json())).toContain("outra-sede@x.com");
  });

  it("categoria de fora ou sem categoria não é apoio, mas o tempo conta no total", () => {
    const evs = [evento("09:00", "10:00", 60, { categoria_id: "modulo_m01" }), evento("10:00", "11:00", 60, { categoria_id: "" })];
    expect(eventuaisNoApoio([], evs, [CATEGORIA_APOIO_PEDAGOGICO])).toEqual({ apoioMin: 0, foraDasTarefasMin: 120 });
  });

  it("o percentual nunca passa de 100%, mesmo com apoio planejado no mesmo horário", () => {
    const b = bloco("09:00", "10:00", 60);
    const r = percentualApoioOutroSetor([b], new Set(["t"]), eventuaisNoApoio([b], [evento("09:00", "10:00", 60)], [CATEGORIA_APOIO_PEDAGOGICO]));
    expect(r).toBe(100);
  });
});
