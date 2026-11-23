/**
 * Importação de rota com os dados do RH (13/11/2026): quem a importação CADASTRA
 * precisa de nome completo, matrícula, empresa e admissão — vindos das colunas
 * novas do modelo. Quem já está na sede é reaproveitado e não precisa. Sem os
 * dados, a importação inteira é recusada antes de gravar qualquer coisa.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { analisarRota, areaDaPlanilha, dataDaPlanilha, textoDaColuna, type LinhaPlanilha } from "@/lib/importacaoRota";
import { reiniciarBanco } from "@/lib/memoryStore";
import { aplicarImportacao } from "@/services/importacaoService";

const SEDE = "christus_dt";
const DATA = "2026-11-16";
const linha = (funcionario: string, extra: Partial<LinhaPlanilha> = {}): LinhaPlanilha => ({
  funcionario, entrada: "07:00", saida: "16:00", inicio: "07:00", fim: "08:00", tarefa: "Varrer o pátio", local: "Pátio", ...extra,
});
const RH = { nome_completo: "Joana Maria de Souza", matricula: "4321", empresa: "Apel Filial 7", admissao: "15/03/2024" };
const doSede = async () => (await getDataSource()).consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: SEDE }]);

describe("importação de rota × dados do RH", () => {
  beforeEach(() => reiniciarBanco());

  it("pessoa nova sem as colunas do RH: recusa e não grava nada", async () => {
    const antes = (await doSede()).length;
    const analise = analisarRota([linha("Joana")]);
    await expect(aplicarImportacao(SEDE, DATA, analise, "t@t.com")).rejects.toThrow(/colunas do RH/);
    expect((await doSede()).length).toBe(antes);
    const ds = await getDataSource();
    // Só os blocos da importação: o seed monta a agenda de HOJE, e DATA pode ser hoje.
    const daImportacao = (await ds.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: DATA }]))
      .filter((r) => r.observacao === "Importada da planilha");
    expect(daImportacao).toEqual([]);
    expect(await ds.listar("eventos_quadro")).toEqual([]);
  });

  it("pessoa nova com as colunas: cadastra com os dados limpos e a empresa na grafia do Chromos", async () => {
    const analise = analisarRota([linha("Joana", RH), linha("Joana", { inicio: "08:00", fim: "09:00", tarefa: "Limpar WC" })]);
    expect(analise.erros).toEqual([]);
    const r = await aplicarImportacao(SEDE, DATA, analise, "t@t.com");
    expect(r.funcionarios.criados).toBe(1);
    const joana = (await doSede()).find((f) => f.nome === "Joana");
    expect(joana).toMatchObject({ nome_completo: "Joana Maria de Souza", matricula: "4321", empresa: "APEL 7", data_admissao: "2024-03-15" });
  });

  it("quem já está na sede é reaproveitado sem precisar das colunas", async () => {
    const r = await aplicarImportacao(SEDE, DATA, analisarRota([linha("Aurilene")]), "t@t.com");
    expect(r.funcionarios).toEqual({ criados: 0, reaproveitados: 1 });
  });

  it("matrícula repetida (na planilha ou já em uso) é recusada", async () => {
    const dup = analisarRota([linha("Joana", RH), linha("Maria", { ...RH, nome_completo: "Maria Clara Lima" })]);
    await expect(aplicarImportacao(SEDE, DATA, dup, "t@t.com")).rejects.toThrow(/duas pessoas na planilha/);
    await aplicarImportacao(SEDE, DATA, analisarRota([linha("Joana", RH)]), "t@t.com");
    const deNovo = analisarRota([linha("Clara", { ...RH, nome_completo: "Clara Souza", empresa: "APEL 7" })]);
    await expect(aplicarImportacao(SEDE, "2026-11-17", deNovo, "t@t.com")).rejects.toThrow(/já está em outro cadastro/);
  });

  it("área: entende o texto das planilhas das sedes, com unidade e vírgula (23/11/2026)", () => {
    expect(areaDaPlanilha("68.041 m²")).toBe(68.041); // POP do Sul 3
    expect(areaDaPlanilha("797,29 m2")).toBe(797.29);
    expect(areaDaPlanilha("1.234,5")).toBe(1234.5);
    expect(areaDaPlanilha("120")).toBe(120);
    expect(areaDaPlanilha("")).toBe(0);
    expect(areaDaPlanilha("ver planta")).toBe(0);
    const a = analisarRota([
      linha("Ana", { ...RH, local: "Sala 310", metragem: "68.041 m²" }),
      linha("Ana", { ...RH, local: "Pátio", metragem: "ver planta", tarefa: "T2", inicio: "08:00", fim: "09:00" }),
    ] as LinhaPlanilha[]);
    expect(a.locais.map((l) => [l.nome_local, l.metragem])).toEqual([["Sala 310", 68.041], ["Pátio", 0]]);
    expect(a.avisos.filter((x) => x.campo === "Metragem (m²)").map((x) => x.mensagem)).toEqual(['"ver planta" não é uma área. O local "Pátio" entrou sem metragem.']);
  });

  it("tipo de serviço: só rotina, pesada ou desincrustante; texto solto vira rotina com aviso (19/11/2026)", () => {
    const a = analisarRota([
      linha("Ana", { ...RH, tarefa: "T1", tipo_servico: "Pesada" }),
      linha("Ana", { ...RH, tarefa: "T2", tipo_servico: "limpeza sala", inicio: "08:00", fim: "09:00" }),
      linha("Ana", { ...RH, tarefa: "T3", inicio: "09:00", fim: "10:00" }),
    ] as LinhaPlanilha[]);
    expect(a.tarefas.map((t) => [t.nome_tarefa, t.tipo_servico])).toEqual([["T1", "pesada"], ["T2", "rotina"], ["T3", "rotina"]]);
    expect(a.avisos.filter((x) => x.campo === "Tipo de serviço").map((x) => x.mensagem)).toEqual([
      'Tipo de serviço "limpeza sala" não é rotina, pesada nem desincrustante. Usei rotina.',
    ]);
  });

  it("data de admissão: dd/mm/aaaa ou célula de data do Excel; texto que não é data vira erro de linha", () => {
    expect(dataDaPlanilha("5/3/2024")).toBe("2024-03-05");
    expect(dataDaPlanilha("2024-03-05")).toBe("2024-03-05");
    expect(dataDaPlanilha("março")).toBeNull();
    expect(textoDaColuna("admissao", new Date(Date.UTC(2024, 2, 15)))).toBe("2024-03-15");
    expect(textoDaColuna("entrada", new Date(Date.UTC(1899, 11, 30, 7, 5)))).toBe("07:05"); // hora continua hora
    expect(analisarRota([linha("Joana", { ...RH, admissao: "março" })]).erros.map((e) => e.campo)).toContain("Admissão");
  });
});
