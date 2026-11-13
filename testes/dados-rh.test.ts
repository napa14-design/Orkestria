/**
 * Dados do RH obrigatórios (pedido do dono, 13/11/2026): nome completo, matrícula,
 * empresa e data de admissão em quem está no quadro. Desligado e posto vago ficam
 * dispensados. O Orkestria passou a ser o dono da empresa: ela se edita no cadastro,
 * e a matrícula é única por empresa.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { validarFuncionario } from "@/lib/validations";
import { empresaAmbigua, empresasConhecidas, normalizarEmpresa } from "@/lib/empresas";
import { createFuncionario, updateFuncionario } from "@/services/funcionariosService";
import { funcionario, rh } from "./fixtures";

const codigos = (p: Parameters<typeof validarFuncionario>[0]) => validarFuncionario(p).map((a) => a.codigo);
const COMPLETO = { nome_completo: "Cristina Maria da Silva", matricula: "123", empresa: "Apel - Matriz", data_admissao: "2020-03-01" };

describe("normalizarEmpresa: a grafia do Quadro da Infra", () => {
  it("as grafias da folha do RH viram as do Quadro", () => {
    const casos: Array<[string, string]> = [
      ["Apel - Matriz", "APEL MATRIZ"], ["APEL Matriz", "APEL MATRIZ"], ["Apel Filial 7", "APEL 7"], ["Apel Filial 9", "APEL 9"],
      ["APEL-10", "APEL 10"], ["IPADE - Filial 07", "IPADE 7"], ["Ipade 02", "IPADE 2"], ["Ipade 10", "IPADE 10"],
      ["Ipade", "IPADE"], ["CTEC - Filial 2", "CTEC 2"], ["CTEC Filial 06", "CTEC 6"], ["Apel 100", "APEL 100"],
    ];
    for (const [de, para] of casos) expect([de, normalizarEmpresa(de)]).toEqual([de, para]);
    expect(empresaAmbigua("Apel Filial")).toBe("não diz qual filial");
    expect(empresasConhecidas([{ empresa: "Apel - Matriz" }, { empresa: "APEL MATRIZ" }, { empresa: "Apel Filial" }, { empresa: "" }])).toEqual(["APEL MATRIZ"]);
  });
});

describe("validarFuncionario: dados do RH", () => {
  it("quem está no quadro precisa dos quatro, e a mensagem diz quais faltam", () => {
    const a = validarFuncionario(funcionario({ ...COMPLETO, matricula: "", empresa: " " }));
    expect(a.map((x) => x.codigo)).toContain("DADOS_DO_RH");
    expect(a.find((x) => x.codigo === "DADOS_DO_RH")?.mensagem).toBe("Preencha matrícula, empresa.");
    expect(codigos(funcionario(COMPLETO))).not.toContain("DADOS_DO_RH");
  });

  it("desligado e posto vago ficam dispensados", () => {
    expect(codigos(funcionario({ desligado_em: "2026-11-12" }))).not.toContain("DADOS_DO_RH");
  });

  it("admissão tem de ser dia de verdade e não futura", () => {
    expect(codigos(funcionario({ ...COMPLETO, data_admissao: "2026-02-30" }))).toContain("ADMISSAO_INVALIDA");
    expect(codigos(funcionario({ ...COMPLETO, data_admissao: "01/03/2020" }))).toContain("ADMISSAO_INVALIDA");
    expect(codigos(funcionario({ ...COMPLETO, data_admissao: "2999-01-01" }))).toContain("ADMISSAO_INVALIDA");
    expect(codigos(funcionario(COMPLETO))).not.toContain("ADMISSAO_INVALIDA");
  });
});

describe("cadastro com os dados do RH", () => {
  beforeEach(() => reiniciarBanco());
  const base = { sede_id: "christus_dt", turno: "integral", entrada: "07:00", saida: "16:00" };

  it("recusa cadastro novo sem os dados; aceita com eles e grava a empresa na grafia do Chromos", async () => {
    await expect(createFuncionario({ nome: "Sem RH", ...base } as never, "t@t.com")).rejects.toThrow(/Preencha/);
    const f = await createFuncionario({ nome: "Com RH", ...base, ...COMPLETO, empresa: "  Apel  -  Matriz " } as never, "t@t.com");
    expect(f).toMatchObject({ empresa: "APEL MATRIZ", nome_completo: "Cristina Maria da Silva", data_admissao: "2020-03-01" });
  });

  it("matrícula é única por empresa — em qualquer grafia da mesma empresa (revisão de segurança)", async () => {
    await createFuncionario({ nome: "Uma", ...base, ...COMPLETO } as never, "t@t.com");
    for (const empresa of [
      "APEL - MATRIZ", "Apel-Matriz", "Apél - Matriz", "Apel​ - Matriz", "apel matriz", "Apel  - Matriz",
      "Apel – Matriz", "Apel — Matriz", "Apel ‐ Matriz", "Apel - Matriz.",
    ])
      await expect(createFuncionario({ nome: "Duas", ...base, ...COMPLETO, empresa } as never, "t@t.com")).rejects.toThrow(/matrícula já está/);
    const outra = await createFuncionario({ nome: "Três", ...base, ...COMPLETO, empresa: "Ipade" } as never, "t@t.com");
    expect(outra).toMatchObject({ matricula: "123", empresa: "IPADE" });
  });

  it("ficha antiga gravada em outra grafia também segura a matrícula", async () => {
    const ds = await getDataSource();
    const seed = await ds.obter("funcionarios", "christus_f1");
    await ds.criar("funcionarios", { ...seed!, id: "antiga", ...COMPLETO, empresa: "Apel - Matriz" } as never); // como a carga gravou
    await expect(createFuncionario({ nome: "Nova", ...base, ...COMPLETO, empresa: "APEL MATRIZ" } as never, "t@t.com")).rejects.toThrow(/matrícula já está/);
  });

  it("empresa ambígua (\"Apel Filial\" sem número) é recusada", async () => {
    await expect(createFuncionario({ nome: "X", ...base, ...COMPLETO, empresa: "Apel Filial" } as never, "t@t.com")).rejects.toThrow(/qual filial/);
  });

  it("o POST não escolhe a própria dispensa: desligado_em, ativo:false e cia. são recusados (revisão de segurança)", async () => {
    for (const extra of [{ desligado_em: "9999-12-31" }, { desligado_em: "x" }, { ativo: false }, { substituido_por: "y" }, { motivo_desligamento: "z" }])
      await expect(createFuncionario({ nome: "Esperta", ...base, ...extra } as never, "t@t.com")).rejects.toThrow(/Cadastro novo não leva/);
    // `ativo: true` é o padrão e passa (a transferência o manda).
    await expect(createFuncionario({ nome: "Ok", ...base, ...rh(), ativo: true } as never, "t@t.com")).resolves.toBeTruthy();
  });

  it("ficha inativa (passou o posto adiante) fica dispensada, como o desligado (decisão do dono)", () => {
    expect(codigos(funcionario({ ativo: false }))).not.toContain("DADOS_DO_RH");
  });

  it("edição de ficha sem os dados exige completar; desligado (posto vago) edita sem eles", async () => {
    const ds = await getDataSource();
    // A ficha do seed não tem os dados do RH (é o caso das fichas antigas).
    await expect(updateFuncionario("christus_f1", { entrada: "06:30" }, "t@t.com")).rejects.toThrow(/Preencha/);
    const completo = await updateFuncionario("christus_f1", { entrada: "06:30", ...rh() }, "t@t.com");
    expect(completo.entrada).toBe("06:30");
    await ds.atualizar("funcionarios", "christus_f2", { desligado_em: "2026-01-01", ativo: false });
    await expect(updateFuncionario("christus_f2", { observacoes: "posto vago" }, "t@t.com")).resolves.toBeTruthy();
  });
});
