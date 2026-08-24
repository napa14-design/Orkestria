/**
 * Tipo de local virou catálogo — e o fator vem junto.
 *
 * Pedido do dono do produto, três vezes: *"seria bom poder criar no próprio
 * modal"*, *"eu ainda acho que deveria poder cadastrar e a pessoa coloca"*.
 *
 * A minha objeção era que `tipo_local` é a chave de onde sai a intensidade de
 * limpeza, então tipo criado sem fator cairia em **1,0 em silêncio**. Estes
 * testes existem para essa objeção não voltar a ser verdade: quem cria informa
 * o fator, e quem calcula enxerga o catálogo.
 *
 * (Medido em 24/08/2026, e vale registrar: as 427 tarefas da produção são
 * `regra_calculo: fixo`, e a intensidade **só incide** em `por_m2`/`por_unidade`
 * — ou seja, hoje o fator não muda nenhum número. O risco era de desenho, não
 * de operação.)
 */
import { describe, expect, it } from "vitest";
import {
  FATOR_POR_TIPO_LOCAL,
  fatorIntensidadeLocal,
  multiplicadorTempo,
  tempoPrevistoMin,
} from "@/lib/calculations";
import type { Local, Tarefa } from "@/types";

const local = (extra: Partial<Local>): Local =>
  ({
    id: "l1",
    sede_id: "s1",
    nome_local: "Teste",
    tipo_local: "outros",
    metragem: 10,
    ativo: true,
    ...extra,
  }) as Local;

const tarefa = (extra: Partial<Tarefa>): Tarefa =>
  ({
    id: "t1",
    sede_id: "s1",
    local_id: "l1",
    nome_tarefa: "Teste",
    regra_calculo: "por_m2",
    tempo_base_min: 2,
    tipo_servico: "rotina",
    ativo: true,
    ...extra,
  }) as Tarefa;

/** O que o serviço monta a partir da coleção `tipos_local`. */
const CATALOGO = new Map<string, number>([
  ["laboratorio", 1.3],
  ["quadra", 0.8],
  ["banheiro", 1.5],
]);

describe("fatorIntensidadeLocal — a ordem de prioridade", () => {
  it("1º: o fator digitado no próprio local vence tudo", () => {
    const l = local({ tipo_local: "laboratorio", fator_intensidade: 0.5 });
    expect(fatorIntensidadeLocal(l, CATALOGO)).toBe(0.5);
  });

  it("2º: o fator do tipo, vindo do catálogo — inclusive de tipo criado pelo usuário", () => {
    expect(fatorIntensidadeLocal(local({ tipo_local: "laboratorio" }), CATALOGO)).toBe(1.3);
    expect(fatorIntensidadeLocal(local({ tipo_local: "quadra" }), CATALOGO)).toBe(0.8);
  });

  it("3º: sem catálogo carregado, os 12 tipos antigos continuam certos", () => {
    // Era a objeção: cair em 1,0 calado. Para os tipos conhecidos, não cai.
    expect(fatorIntensidadeLocal(local({ tipo_local: "banheiro" }))).toBe(1.5);
    expect(fatorIntensidadeLocal(local({ tipo_local: "area_externa" }))).toBe(0.8);
    expect(fatorIntensidadeLocal(local({ tipo_local: "sala" }))).toBe(1);
  });

  it("tipo desconhecido e sem catálogo cai em 1,0 — o limite honesto do fallback", () => {
    expect(fatorIntensidadeLocal(local({ tipo_local: "laboratorio" }))).toBe(1);
  });

  it("o catálogo vence a constante quando os dois têm o mesmo tipo", () => {
    const so = new Map<string, number>([["banheiro", 1.2]]);
    expect(FATOR_POR_TIPO_LOCAL.banheiro).toBe(1.5);
    expect(fatorIntensidadeLocal(local({ tipo_local: "banheiro" }), so)).toBe(1.2);
  });

  it("fator zerado ou negativo no catálogo é ignorado, não zera o tempo", () => {
    const ruim = new Map<string, number>([["laboratorio", 0]]);
    expect(fatorIntensidadeLocal(local({ tipo_local: "laboratorio" }), ruim)).toBe(1);
  });

  it("sem local, 1,0", () => {
    expect(fatorIntensidadeLocal(undefined, CATALOGO)).toBe(1);
  });
});

describe("o fator do catálogo chega até o tempo previsto", () => {
  it("por m²: 2 min/m² × 10 m² × 1,3 do laboratório = 26", () => {
    const l = local({ tipo_local: "laboratorio" });
    expect(tempoPrevistoMin(tarefa({}), l, CATALOGO)).toBe(26);
  });

  it("sem o catálogo, o mesmo caso dá 20 — é a divergência que o threading evita", () => {
    expect(tempoPrevistoMin(tarefa({}), local({ tipo_local: "laboratorio" }))).toBe(20);
  });

  it("tempo FIXO não recebe intensidade — é o caso das 427 tarefas de hoje", () => {
    const t = tarefa({ regra_calculo: "fixo", tempo_base_min: 30 });
    const l = local({ tipo_local: "laboratorio" });
    expect(tempoPrevistoMin(t, l, CATALOGO)).toBe(30);
    expect(multiplicadorTempo(t, l, CATALOGO)).toBe(1);
  });

  it("por unidade recebe intensidade — é o caminho dos objetos (6 bebedouros)", () => {
    const t = tarefa({ regra_calculo: "por_unidade", tempo_base_min: 5, quantidade: 6 });
    const l = local({ tipo_local: "quadra" }); // 0,8
    expect(tempoPrevistoMin(t, l, CATALOGO)).toBe(24); // 5 × 6 × 0,8
  });
});
