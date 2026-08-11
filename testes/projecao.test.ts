/**
 * Projeção do dia a partir da rota padrão.
 *
 * Estes casos existem para uma coisa acima das outras: a geração de verdade e a
 * geração sombra usam a MESMA função. Se alguém mexer nas regras de descarte para
 * ajustar a sombra, o dia real muda junto — e o contrário também. Os testes
 * travam o comportamento e a ORDEM dos motivos, que é o que decide a mensagem
 * que o supervisor lê.
 */
import { describe, expect, it } from "vitest";
import {
  chaveMaterializacao,
  compararRotaComODia,
  type ContextoProjecao,
  projetarDiaDaRota,
} from "@/lib/projecaoDia";
import type { ModeloRotinaItem } from "@/types";
import { funcionario, rotina, tarefa } from "./fixtures";

// 2026-08-10 é uma SEGUNDA; 2026-08-15, um SÁBADO.
const SEGUNDA = "2026-08-10";
const SABADO = "2026-08-15";

function item(parcial: Partial<ModeloRotinaItem> = {}): ModeloRotinaItem {
  return {
    id: "m1",
    nome_modelo: "Rota padrão",
    sede_id: "aldeota",
    funcionario_id: "f1",
    tarefa_id: "t1",
    local_id: "l1",
    inicio_planejado: "08:00",
    padrao: true,
    criado_por: "teste",
    criado_em: "2026-01-01T00:00:00.000Z",
    ...parcial,
  };
}

function contexto(parcial: Partial<ContextoProjecao> = {}): ContextoProjecao {
  return {
    data: SEGUNDA,
    tarefas: new Map([["t1", tarefa()]]),
    funcionarios: new Map([["f1", funcionario()]]),
    jaNoDia: new Set(),
    ausentes: new Set(),
    letivoFora: false,
    ...parcial,
  };
}

describe("projetarDiaDaRota", () => {
  it("materializa o item comum", () => {
    const p = projetarDiaDaRota([item()], contexto());
    expect(p.materializar).toHaveLength(1);
    expect(p.descartados).toHaveLength(0);
  });

  it("pula o que já está no dia (idempotência)", () => {
    const ctx = contexto({ jaNoDia: new Set([chaveMaterializacao("f1", "t1", "08:00")]) });
    const p = projetarDiaDaRota([item()], ctx);
    expect(p.materializar).toHaveLength(0);
    expect(p.descartados[0].motivo).toBe("ja_no_dia");
  });

  it("pula item cuja tarefa ou pessoa saiu do cadastro", () => {
    expect(projetarDiaDaRota([item({ tarefa_id: "sumiu" })], contexto()).descartados[0].motivo).toBe(
      "cadastro_removido",
    );
    expect(
      projetarDiaDaRota([item({ funcionario_id: "sumiu" })], contexto()).descartados[0].motivo,
    ).toBe("cadastro_removido");
  });

  it("pula tarefa de calendário fora do período letivo", () => {
    const ctx = contexto({
      tarefas: new Map([["t1", tarefa({ depende_calendario: true })]]),
      letivoFora: true,
    });
    expect(projetarDiaDaRota([item()], ctx).descartados[0].motivo).toBe("fora_do_periodo_letivo");
  });

  it("tarefa semanal entra só nos dias configurados", () => {
    // `dias_semana` é CSV NUMÉRICO (0=dom … 6=sáb): "1,3,5" = seg, qua, sex.
    // Escrever "seg,qua,sex" faz `parseDiasSemana` devolver [] e a tarefa passa
    // a valer todo dia — foi o erro que estes testes pegaram em mim.
    const tarefas = new Map([["t1", tarefa({ frequencia: "semanal", dias_semana: "1,3,5" })]]);
    // Quem trabalha no sábado, para o motivo testado ser o dia da semana e não a escala.
    const funcionarios = new Map([["f1", funcionario({ escala: "seg_sab" })]]);
    expect(projetarDiaDaRota([item()], contexto({ tarefas })).materializar).toHaveLength(1);
    expect(
      projetarDiaDaRota([item()], contexto({ tarefas, funcionarios, data: SABADO })).descartados[0]
        .motivo,
    ).toBe("outro_dia_da_semana");
  });

  it("semanal sem dias configurados vale todo dia (retrocompatibilidade)", () => {
    const tarefas = new Map([["t1", tarefa({ frequencia: "semanal", dias_semana: "" })]]);
    const funcionarios = new Map([["f1", funcionario({ escala: "seg_sab" })]]);
    expect(
      projetarDiaDaRota([item()], contexto({ tarefas, funcionarios, data: SABADO })).materializar,
    ).toHaveLength(1);
  });

  it("escala seg_sex não trabalha sábado — e é esse o motivo relatado", () => {
    expect(projetarDiaDaRota([item()], contexto({ data: SABADO })).descartados[0].motivo).toBe(
      "folga_pela_escala",
    );
  });

  it("item da rota vale só nos dias dele", () => {
    const segundaSo = item({ dias_semana: "1" });
    const funcionarios = new Map([["f1", funcionario({ escala: "seg_sab" })]]);
    expect(projetarDiaDaRota([segundaSo], contexto()).materializar).toHaveLength(1);
    const noSabado = projetarDiaDaRota([segundaSo], contexto({ funcionarios, data: SABADO }));
    expect(noSabado.descartados[0].motivo).toBe("item_de_outro_dia");
  });

  it("item sem dias vale todo dia (rotas salvas antes do campo existir)", () => {
    const funcionarios = new Map([["f1", funcionario({ escala: "seg_sab" })]]);
    expect(
      projetarDiaDaRota([item({ dias_semana: "" })], contexto({ funcionarios, data: SABADO }))
        .materializar,
    ).toHaveLength(1);
    expect(
      projetarDiaDaRota([item({ dias_semana: undefined })], contexto({ funcionarios, data: SABADO }))
        .materializar,
    ).toHaveLength(1);
  });

  it("camadas se somam: a de todo dia mais a de segunda", () => {
    // É o desenho da rota padrão: união das camadas, não substituição.
    const todoDia = item({ id: "todos", tarefa_id: "t1" });
    const soSegunda = item({ id: "seg", tarefa_id: "t2", dias_semana: "1", inicio_planejado: "09:00" });
    const ctx = contexto();
    ctx.tarefas.set("t2", tarefa({ id: "t2", nome_tarefa: "Encerar" }));

    const naSegunda = projetarDiaDaRota([todoDia, soSegunda], ctx);
    expect(naSegunda.materializar.map((i) => i.id)).toEqual(["todos", "seg"]);

    const naTerca = projetarDiaDaRota([todoDia, soSegunda], { ...ctx, data: "2026-08-11" });
    expect(naTerca.materializar.map((i) => i.id)).toEqual(["todos"]);
    expect(naTerca.descartados[0].motivo).toBe("item_de_outro_dia");
  });

  it("camada que SUBSTITUI monta o dia sozinha", () => {
    // A ambiguidade que isto fecha: salvar o dia INTEIRO da segunda como camada
    // fazia a segunda receber tudo duas vezes, e onde o horário diferia duplicava
    // de verdade. Agora a intenção é declarada.
    const base = item({ id: "base", nome_modelo: "Todo dia" });
    const segunda = item({
      id: "seg",
      nome_modelo: "Segunda própria",
      dias_semana: "1",
      substitui: true,
      inicio_planejado: "09:00",
    });

    const naSegunda = projetarDiaDaRota([base, segunda], contexto());
    expect(naSegunda.materializar.map((i) => i.id)).toEqual(["seg"]);
    expect(naSegunda.descartados[0]).toMatchObject({ motivo: "substituido_por_camada" });

    // Na terça a camada não vale, então a base volta a montar o dia.
    const naTerca = projetarDiaDaRota([base, segunda], contexto({ data: "2026-08-11" }));
    expect(naTerca.materializar.map((i) => i.id)).toEqual(["base"]);
    expect(naTerca.descartados[0].motivo).toBe("item_de_outro_dia");
  });

  it("camada que acrescenta continua somando (padrão de quem não marcou substituir)", () => {
    const base = item({ id: "base", nome_modelo: "Todo dia" });
    const extra = item({ id: "extra", nome_modelo: "Extra segunda", dias_semana: "1", inicio_planejado: "09:00" });
    expect(projetarDiaDaRota([base, extra], contexto()).materializar.map((i) => i.id)).toEqual([
      "base",
      "extra",
    ]);
  });

  it("substituição só vale nos dias da camada, não nos outros", () => {
    const base = item({ id: "base", nome_modelo: "Todo dia" });
    const sabado = item({
      id: "sab",
      nome_modelo: "Sábado próprio",
      dias_semana: "6",
      substitui: true,
    });
    // Segunda: a camada de sábado não vale, e a base monta normalmente.
    const p = projetarDiaDaRota([base, sabado], contexto());
    expect(p.materializar.map((i) => i.id)).toEqual(["base"]);
  });

  it("o dia do ITEM é checado antes do dia da TAREFA", () => {
    // Os dois motivos dizem "não é hoje", mas o texto na tela é diferente: um cita
    // a rota, o outro cita a tarefa. A ordem decide qual a pessoa lê.
    const ctx = contexto({
      tarefas: new Map([["t1", tarefa({ frequencia: "semanal", dias_semana: "2" })]]),
    });
    expect(projetarDiaDaRota([item({ dias_semana: "3" })], ctx).descartados[0].motivo).toBe(
      "item_de_outro_dia",
    );
    expect(projetarDiaDaRota([item({ dias_semana: "1" })], ctx).descartados[0].motivo).toBe(
      "outro_dia_da_semana",
    );
  });

  it("pula quem está ausente", () => {
    const ctx = contexto({ ausentes: new Set(["f1"]) });
    expect(projetarDiaDaRota([item()], ctx).descartados[0].motivo).toBe("pessoa_ausente");
  });

  it("a ordem dos motivos é estável: 'já no dia' vence os outros", () => {
    // Um item que também estaria ausente e fora do dia da semana deve ser
    // relatado como "já no dia" — é o motivo mais alto na ordem.
    const ctx = contexto({
      jaNoDia: new Set([chaveMaterializacao("f1", "t1", "08:00")]),
      ausentes: new Set(["f1"]),
      tarefas: new Map([["t1", tarefa({ frequencia: "semanal", dias_semana: "2" })]]),
    });
    expect(projetarDiaDaRota([item()], ctx).descartados[0].motivo).toBe("ja_no_dia");
  });

  it("preserva a ordem da rota nos descartes (o texto na tela segue essa ordem)", () => {
    const ctx = contexto({ ausentes: new Set(["f1", "f2"]) });
    ctx.funcionarios.set("f2", funcionario({ id: "f2", nome: "Ana" }));
    const p = projetarDiaDaRota(
      [item({ id: "a", inicio_planejado: "07:00" }), item({ id: "b", funcionario_id: "f2" })],
      ctx,
    );
    expect(p.descartados.map((d) => d.item.id)).toEqual(["a", "b"]);
  });
});

describe("compararRotaComODia", () => {
  it("dia igual à rota não gera divergência", () => {
    const div = compararRotaComODia([item()], [rotina({ inicio_planejado: "08:00" })]);
    expect(div).toEqual({ soNaRota: [], soNoDia: [], movidos: [] });
  });

  it("reconhece bloco MOVIDO em vez de contar duas divergências", () => {
    // É o achado que importa: a chave inclui o horário, então numa regeração o
    // bloco das 08:00 nasceria ao lado do das 09:00 em vez de reconciliar.
    const div = compararRotaComODia([item()], [rotina({ inicio_planejado: "09:00" })]);
    expect(div.movidos).toHaveLength(1);
    expect(div.movidos[0].de).toBe("08:00");
    expect(div.movidos[0].para).toBe("09:00");
    expect(div.soNaRota).toHaveLength(0);
    expect(div.soNoDia).toHaveLength(0);
  });

  it("separa o que só existe na rota do que o supervisor acrescentou", () => {
    const div = compararRotaComODia(
      [item({ tarefa_id: "t1" })],
      [rotina({ id: "r9", tarefa_id: "t9", inicio_planejado: "14:00" })],
    );
    expect(div.soNaRota).toHaveLength(1);
    expect(div.soNoDia).toHaveLength(1);
    expect(div.movidos).toHaveLength(0);
  });

  it("não casa o mesmo bloco do dia com dois itens da rota", () => {
    const div = compararRotaComODia(
      [item({ id: "a", inicio_planejado: "08:00" }), item({ id: "b", inicio_planejado: "10:00" })],
      [rotina({ inicio_planejado: "09:00" })],
    );
    expect(div.movidos).toHaveLength(1);
    expect(div.soNaRota).toHaveLength(1);
    expect(div.soNoDia).toHaveLength(0);
  });
});
