/**
 * Validação do dia inteiro — a mesma regra da agenda manual, aplicada aos
 * caminhos que gravam em lote (geração pela rota padrão, importação, cópia).
 *
 * Medido na produção em 20/08, antes disto existir: **38 sobreposições e 7 blocos
 * dentro do próprio intervalo** gravados desde junho, porque só o arrasto passava
 * por `validarAlocacao`.
 */
import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "@/lib/calculations";
import { resumirProblemas, validarDia, type BlocoDoDia } from "@/lib/validacaoDoDia";
import type { Funcionario, Tarefa } from "@/types";

const DATA = "2026-08-19";
const aud = { criado_por: "t", criado_em: "", atualizado_por: "t", atualizado_em: "" };

const pessoa = (parcial: Partial<Funcionario> = {}): Funcionario =>
  ({
    id: "f1", nome: "Gleydison", genero: "masculino", sede_id: "s1", turno: "manha",
    entrada: "06:30", saida: "16:30", intervalo_min: 90,
    intervalo_inicio: "12:00", intervalo_fim: "13:30", intervalos: "12:00-13:30",
    cargo: "ASG", ativo: true, observacoes: "", ...aud, ...parcial,
  }) as Funcionario;

const tarefa = (parcial: Partial<Tarefa> = {}): Tarefa =>
  ({
    id: "t1", nome_tarefa: "Limpeza WC", tipo_tarefa: "Rota", local_id: "l1", sede_id: "s1",
    regra_calculo: "fixo", tempo_base_min: 10, quantidade: 1, frequencia: "diaria",
    prioridade: "media", ativo: true, observacoes: "", ...aud, ...parcial,
  }) as Tarefa;

const bloco = (inicio: string, fim: string, extra: Partial<BlocoDoDia> = {}): BlocoDoDia => ({
  funcionario_id: "f1", tarefa_id: "t1", inicio_planejado: inicio, fim_planejado: fim,
  tempo_previsto_min: 10, ...extra,
});

const rodar = (blocos: BlocoDoDia[], opts: Partial<Parameters<typeof validarDia>[0]> = {}) =>
  validarDia({
    blocos,
    funcionarios: new Map([["f1", pessoa()]]),
    tarefas: new Map([["t1", tarefa()]]),
    parametros: PARAMETROS_PADRAO,
    data: DATA,
    ...opts,
  });

describe("validarDia", () => {
  it("dia coerente não gera problema nenhum", () => {
    expect(rodar([bloco("07:00", "07:10"), bloco("07:10", "07:20")])).toEqual([]);
  });

  it("pega sobreposição entre dois blocos NOVOS (nenhum gravado ainda)", () => {
    // Era o furo da geração: ela criava os dois de uma vez e ninguém comparava
    // um com o outro.
    const p = rodar([bloco("08:00", "08:30"), bloco("08:15", "08:45")]);
    expect(p.map((x) => x.codigo)).toEqual(["SOBREPOSICAO", "SOBREPOSICAO"]);
  });

  it("a sobreposição aparece nos DOIS blocos, de propósito", () => {
    const p = rodar([bloco("08:00", "08:30"), bloco("08:15", "08:45")]);
    expect(p.map((x) => x.inicio).sort()).toEqual(["08:00", "08:15"]);
  });

  it("pega bloco dentro do próprio intervalo", () => {
    const p = rodar([bloco("12:15", "12:30")]);
    expect(p.map((x) => x.codigo)).toContain("INTERVALO");
  });

  it("NÃO reporta tarefa depois da saída — é o dado que se quer registrar", () => {
    // A CESIU tem 27 blocos assim de propósito. Já são sinalizados na agenda
    // (hachura amaranto + contagem no cabeçalho); reportar aqui afogaria o resto.
    expect(rodar([bloco("17:00", "17:10")])).toEqual([]);
  });

  it("NÃO reporta sobrecarga — é alerta, e apareceria em todo bloco da sede", () => {
    // 60 blocos de 10 min = 600 min numa jornada líquida de 510 → 117%.
    const dia = Array.from({ length: 60 }, (_, i) => {
      const m = 6 * 60 + 30 + i * 10;
      const hh = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
      return bloco(hh(m), hh(m + 10));
    });
    expect(rodar(dia).filter((p) => p.codigo === "SOBRECARGA")).toEqual([]);
  });

  it("pega restrição de gênero", () => {
    const p = validarDia({
      blocos: [bloco("07:00", "07:10")],
      funcionarios: new Map([["f1", pessoa({ genero: "masculino" })]]),
      tarefas: new Map([["t1", tarefa({ restricao_genero: "feminino" })]]),
      parametros: PARAMETROS_PADRAO,
      data: DATA,
    });
    expect(p.map((x) => x.codigo)).toContain("RESTRICAO_GENERO");
  });

  it("pega requisito de treinamento que a pessoa não tem", () => {
    const p = validarDia({
      blocos: [bloco("07:00", "07:10")],
      funcionarios: new Map([["f1", pessoa()]]),
      tarefas: new Map([["t1", tarefa({ requisitos: "treino1" })]]),
      parametros: PARAMETROS_PADRAO,
      data: DATA,
      requisitos: [{ id: "treino1", nome: "NR-35", tipo: "treinamento", descricao: "", ativo: true, ...aud }],
      qualificacoes: [],
    });
    expect(p.map((x) => x.codigo)).toContain("REQUISITO_FALTANDO");
  });

  it("EPI não bloqueia — segue a mesma regra da agenda", () => {
    const p = validarDia({
      blocos: [bloco("07:00", "07:10")],
      funcionarios: new Map([["f1", pessoa()]]),
      tarefas: new Map([["t1", tarefa({ requisitos: "epi1" })]]),
      parametros: PARAMETROS_PADRAO,
      data: DATA,
      requisitos: [{ id: "epi1", nome: "Luvas", tipo: "epi", descricao: "", ativo: true, ...aud }],
      qualificacoes: [],
    });
    expect(p).toEqual([]);
  });

  it("bloco cancelado não é validado", () => {
    expect(rodar([bloco("08:00", "08:30"), bloco("08:15", "08:45", { status: "cancelada" })])).toEqual([]);
  });

  it("pessoa fora do mapa é ignorada em vez de quebrar a geração", () => {
    const p = validarDia({
      blocos: [bloco("08:00", "08:30", { funcionario_id: "fantasma" })],
      funcionarios: new Map(),
      tarefas: new Map([["t1", tarefa()]]),
      parametros: PARAMETROS_PADRAO,
      data: DATA,
    });
    expect(p).toEqual([]);
  });
});

describe("resumirProblemas", () => {
  it("dia limpo não produz linha nenhuma", () => {
    expect(resumirProblemas([])).toEqual([]);
  });

  it("conta por código e corta a lista longa", () => {
    const p = rodar([
      bloco("08:00", "08:30"), bloco("08:15", "08:45"),
      bloco("12:15", "12:30"),
    ]);
    const linhas = resumirProblemas(p, 2);
    expect(linhas[0]).toContain("SOBREPOSICAO");
    expect(linhas[0]).toContain("INTERVALO");
    expect(linhas.at(-1)).toMatch(/e mais \d+/u);
  });
});
