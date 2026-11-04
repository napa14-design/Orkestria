/**
 * Quem pode assumir um bloco de quem faltou (04/11/2026): a Central e o painel de
 * Cobertura usam a mesma régua. Pessoas fictícias — o repo é público.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "@/lib/calculations";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { avaliarCandidatos } from "@/lib/redistribuicao";
import type { Funcionario, Local, RotinaPlanejada, Tarefa } from "@/types";

const DATA = "2026-11-04"; // quarta

const bloco = (id: string, funcionario_id: string, inicio_planejado: string, fim_planejado: string): RotinaPlanejada => ({
  id, data: DATA, funcionario_id, sede_id: "s", tarefa_id: "t", local_id: "l", inicio_planejado, fim_planejado,
  tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "",
  criado_em: "", atualizado_em: "",
});

describe("avaliarCandidatos", () => {
  let base: Funcionario;
  let tarefa: Tarefa;
  let local: Local;
  const pessoa = (id: string, nome: string, extra: Partial<Funcionario> = {}): Funcionario => ({
    ...base, id, nome, sede_id: "s", entrada: "07:00", saida: "17:00", escala: "seg_sex", genero: "feminino", ...extra,
  });
  const avaliar = (funcionarios: Funcionario[], rotinasDoDia: RotinaPlanejada[] = [], t = tarefa) =>
    avaliarCandidatos({
      rotina: bloco("falta", "ausente", "14:00", "14:30"),
      funcionarios,
      disponiveisIds: new Set(funcionarios.map((f) => f.id)),
      rotinasDoDia,
      tarefa: t,
      local,
      parametros: PARAMETROS_PADRAO,
      requisitosCatalogo: [],
      qualificacoes: [],
    });

  beforeEach(async () => {
    reiniciarBanco();
    const d = await getDataSource();
    base = (await d.obter("funcionarios", "christus_f1"))!;
    tarefa = { ...(await d.obter("tarefas", "christus_t2"))!, id: "t", sede_id: "s", local_id: "l", requisitos: "", restricao_genero: "", janela_inicio: "", janela_fim: "" };
    local = { ...(await d.obter("locais", "christus_l1"))!, id: "l", sede_id: "s" };
  });

  it("quem tem conflito no horário vem depois de quem está livre, mesmo com mais folga", () => {
    const r = avaliar(
      [pessoa("cheia", "Ana"), pessoa("livre", "Bia")],
      [bloco("a", "cheia", "14:00", "14:30"), bloco("b", "livre", "08:00", "09:00"), bloco("c", "livre", "09:30", "10:30")],
    );
    expect(r.map((c) => c.funcionario.id)).toEqual(["livre", "cheia"]);
    expect(r[0].alertas).toEqual([]);
    expect(r[1].alertas.length).toBeGreaterThan(0);
  });

  it("entre as sem alerta, a mais leve primeiro; empate vai pelo nome", () => {
    // A carga manda contra a ordem do nome: Ana é a mais cheia, e Zeca, o mais leve.
    const r = avaliar(
      [pessoa("a", "Ana"), pessoa("b", "Bia"), pessoa("z", "Zeca")],
      [bloco("x", "a", "08:00", "09:00"), bloco("y", "a", "09:30", "10:30"), bloco("w", "b", "08:00", "09:00")],
    );
    expect(r.map((c) => c.funcionario.nome)).toEqual(["Zeca", "Bia", "Ana"]);
    const empate = avaliar([pessoa("c", "Cida"), pessoa("a", "Ana")]);
    expect(empate.map((c) => c.funcionario.nome)).toEqual(["Ana", "Cida"]);
  });

  it("confere o requisito só com as qualificações da própria pessoa", () => {
    const requisito = { id: "r", nome: "NR35", exige_qualificacao: true, ativo: true } as never;
    const t = { ...tarefa, requisitos: "r" };
    const funcionarios = [pessoa("sem", "Ana Sem"), pessoa("com", "Zeca Com")];
    const r = avaliarCandidatos({
      rotina: bloco("falta", "ausente", "14:00", "14:30"),
      funcionarios,
      disponiveisIds: new Set(["sem", "com"]),
      rotinasDoDia: [],
      tarefa: t,
      local,
      parametros: PARAMETROS_PADRAO,
      requisitosCatalogo: [requisito],
      qualificacoes: [{ id: "q", funcionario_id: "com", requisito_id: "r", ativo: true } as never],
    });
    expect(r[0].funcionario.id).toBe("com");
    expect(r[0].alertas).toEqual([]);
    expect(r[1].alertas.length).toBeGreaterThan(0);
  });

  it("fora: quem faltou, outra sede e quem não está disponível", () => {
    const funcionarios = [pessoa("ausente", "Quem Faltou"), pessoa("outra", "Outra Sede", { sede_id: "z" }), pessoa("ok", "Presente"), pessoa("folga", "De Folga")];
    const r = avaliarCandidatos({
      rotina: bloco("falta", "ausente", "14:00", "14:30"),
      funcionarios,
      disponiveisIds: new Set(["ausente", "outra", "ok"]),
      rotinasDoDia: [],
      tarefa,
      local,
      parametros: PARAMETROS_PADRAO,
      requisitosCatalogo: [],
      qualificacoes: [],
    });
    expect(r.map((c) => c.funcionario.id)).toEqual(["ok"]);
  });

  it("o próprio bloco da falta não conta como conflito de quem o avalia", () => {
    const r = avaliar([pessoa("ok", "Presente")], [bloco("falta", "ok", "14:00", "14:30")]);
    expect(r[0].alertas).toEqual([]);
  });

  it("restrição de gênero vira alerta: fora da faixa 'sem alerta'", () => {
    const r = avaliar([pessoa("h", "Homem", { genero: "masculino" })], [], { ...tarefa, restricao_genero: "feminino" });
    expect(r[0].alertas.length).toBeGreaterThan(0);
  });
});
