/**
 * "Usar este dia como padrão" — o dia montado vira a rota padrão dos dias da
 * semana marcados, SUBSTITUINDO o que valia neles (pedido do dono, 21/10/2026).
 *
 * O que estes testes protegem é o efeito no dia GERADO, não o retorno da
 * função: depois de usar um dia como padrão, gerar uma data daqueles dias tem
 * de trazer só o dia novo, e gerar os outros dias tem de trazer a rota antiga.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/modelos/padrao/route";

vi.mock("@/lib/session", () => ({
  obterSessao: async () => ({ id: "a", nome: "Admin", email: "a@x", perfil: "administrador", sede_id: "geral", sedes: [] }),
}));
import { reiniciarBanco } from "@/lib/memoryStore";
import { getDataSource } from "@/lib/datasource";
import { ErroValidacao } from "@/services/erros";
import {
  gerarDiaDaRotaPadrao,
  getModelos,
  salvarModelo,
  usarDiaComoPadrao,
} from "@/services/modelosService";
import { createRotina, getRotinasByData } from "@/services/rotinasService";

const SEDE = "christus_dt";
// 2026-08-03 é segunda (dia de montar); 08-10 segunda e 08-11 terça (dias de gerar).
const ORIGEM = "2026-08-03";
const SEGUNDA = "2026-08-10";
const TERCA = "2026-08-11";
const SEG_A_SEX = [1, 2, 3, 4, 5];

/** Monta ORIGEM com estes blocos de Aurilene (tarefa, hora); limpa antes. */
async function montar(blocos: Array<[string, string]>) {
  await limpar(ORIGEM);
  for (const [tarefa_id, hora] of blocos)
    await createRotina(
      { data: ORIGEM, funcionario_id: "christus_f1", tarefa_id, local_id: "christus_l1", inicio_planejado: hora, supervisor_id: "u1" } as never,
      "t@t.com",
    );
}
async function limpar(data: string) {
  const ds = await getDataSource();
  for (const r of await getRotinasByData(data, SEDE)) await ds.excluir("rotinas_planejadas", r.id);
}
const geradoEm = async (data: string) => {
  await gerarDiaDaRotaPadrao(SEDE, data, "t@t.com");
  return (await getRotinasByData(data, SEDE)).map((r) => `${r.inicio_planejado} ${r.tarefa_id}`).sort();
};
const padroes = async () =>
  (await getModelos(SEDE)).filter((m) => m.padrao).map((m) => `${m.nome_modelo} [${m.dias_semana}]`).sort();

describe("usarDiaComoPadrao", () => {
  beforeEach(() => reiniciarBanco());

  it("sede sem rota: o dia vira a rota padrão dos dias marcados", async () => {
    await montar([["christus_t1", "06:00"]]);
    const r = await usarDiaComoPadrao(ORIGEM, SEDE, SEG_A_SEX, "t@t.com");
    expect(r.itens).toBe(1);
    expect(await padroes()).toEqual(["Rota padrão · seg, ter, qua, qui, sex [1,2,3,4,5]"]);
    expect(await geradoEm(TERCA)).toEqual(["06:00 christus_t1"]);
  });

  it("substitui SÓ os dias marcados: a rota antiga fica nos outros", async () => {
    // Rota de todo dia às 06:00; a segunda passa a ter outro dia às 10:00.
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Rota padrão", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await montar([["christus_t3", "10:00"]]);

    const r = await usarDiaComoPadrao(ORIGEM, SEDE, [1], "t@t.com");

    expect(await geradoEm(SEGUNDA)).toEqual(["10:00 christus_t3"]);
    expect(await geradoEm(TERCA)).toEqual(["06:00 christus_t1"]);
    // A antiga encolheu; o nome de quem salvou à mão fica (a tela mostra os dias).
    expect(await padroes()).toEqual(["Rota padrão [0,2,3,4,5,6]", "Rota padrão · seg [1]"]);
    expect(r.encolhidas).toHaveLength(1);
  });

  it("rota antiga que fica sem dia nenhum some", async () => {
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Rota padrão", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await montar([["christus_t3", "10:00"]]);

    const r = await usarDiaComoPadrao(ORIGEM, SEDE, [0, 1, 2, 3, 4, 5, 6], "t@t.com");

    expect(r.removidas).toEqual(["Rota padrão"]);
    expect(await padroes()).toHaveLength(1);
    expect(await geradoEm(TERCA)).toEqual(["10:00 christus_t3"]);
  });

  it("acaba com o 'acrescenta': a camada extra da segunda também sai da segunda", async () => {
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Todo dia", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await montar([["christus_t5", "14:00"]]);
    await salvarModelo("Extra de segunda", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true, diasSemana: "1" });
    await montar([["christus_t3", "10:00"]]);

    await usarDiaComoPadrao(ORIGEM, SEDE, [1], "t@t.com");

    // Antes, a segunda era "todo dia" + "extra"; agora é só o dia novo.
    expect(await geradoEm(SEGUNDA)).toEqual(["10:00 christus_t3"]);
  });

  it("usar de novo nos MESMOS dias alinha o dia já gerado em vez de duplicar", async () => {
    await montar([["christus_t1", "06:00"]]);
    await usarDiaComoPadrao(ORIGEM, SEDE, SEG_A_SEX, "t@t.com");
    expect(await geradoEm(TERCA)).toEqual(["06:00 christus_t1"]);

    await montar([["christus_t1", "07:00"]]);
    await usarDiaComoPadrao(ORIGEM, SEDE, SEG_A_SEX, "t@t.com");

    expect(await geradoEm(TERCA)).toEqual(["07:00 christus_t1"]);
  });

  it("não mexe em evento nem em rota que não é padrão", async () => {
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Formatura", ORIGEM, SEDE, "t@t.com", { evento: true, comDuracao: true });
    await usarDiaComoPadrao(ORIGEM, SEDE, [0, 1, 2, 3, 4, 5, 6], "t@t.com");
    const formatura = (await getModelos(SEDE)).find((m) => m.nome_modelo === "Formatura");
    expect(formatura).toMatchObject({ evento: true, padrao: false, itens: 1 });
  });

  it("dado antigo marcado padrão E evento continua intocado (o gerar já o ignora)", async () => {
    const ds = await getDataSource();
    await ds.criar("modelos_rotina", {
      id: "legado", nome_modelo: "Feira antiga", sede_id: SEDE, funcionario_id: "christus_f1",
      tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "06:00",
      padrao: true, evento: true, criado_por: "t", criado_em: "",
    } as never);
    await montar([["christus_t3", "10:00"]]);
    await usarDiaComoPadrao(ORIGEM, SEDE, [0, 1, 2, 3, 4, 5, 6], "t@t.com");
    expect(await ds.obter("modelos_rotina", "legado")).toMatchObject({ nome_modelo: "Feira antiga", padrao: true });
  });

  it("Seg–Sáb e depois Seg–Sex: o sábado continua com a rota inteira (ids não colidem)", async () => {
    // O defeito: o id cortava o nome em 24 letras, "seg, ter, qua, …" era igual
    // nos dois, e a camada nova sobrescrevia os itens da antiga.
    await montar([["christus_t1", "06:00"], ["christus_t3", "10:00"]]);
    await usarDiaComoPadrao(ORIGEM, SEDE, [1, 2, 3, 4, 5, 6], "t@t.com");
    await montar([["christus_t1", "07:00"], ["christus_t3", "11:00"]]);
    await usarDiaComoPadrao(ORIGEM, SEDE, SEG_A_SEX, "t@t.com");

    const modelos = (await getModelos(SEDE)).filter((m) => m.padrao);
    const sabado = modelos.find((m) => m.dias_semana === "6");
    expect(sabado?.itens).toBe(2);
    expect(modelos.find((m) => m.dias_semana === "1,2,3,4,5")?.itens).toBe(2);
  });

  it("volta a Seg–Sex depois de usar em menos dias (sem beco: a camada que encolheu cede os ids)", async () => {
    // Seg–Sex → só Seg → Seg–Sex: a camada "ter–sex" guardava os ids de
    // padrao-12345 e a trava de colisão recusava, com "use outro nome" num
    // botão que não tem nome. Idem Seg–Sáb → Seg–Sex → Seg–Sáb.
    // A MESMA pessoa e tarefa nas três montagens (só o horário muda): é aí que
    // os ids coincidem — com tarefas diferentes o teste passava sem a correção.
    for (const [primeiro, segundo] of [[SEG_A_SEX, [1]], [SEG_A_SEX, [5]], [[1, 2, 3, 4, 5, 6], SEG_A_SEX]] as const) {
      reiniciarBanco();
      await montar([["christus_t1", "06:00"]]);
      await usarDiaComoPadrao(ORIGEM, SEDE, [...primeiro], "t@t.com");
      await montar([["christus_t1", "10:00"]]);
      await usarDiaComoPadrao(ORIGEM, SEDE, [...segundo], "t@t.com");
      await montar([["christus_t1", "14:00"]]);
      await usarDiaComoPadrao(ORIGEM, SEDE, [...primeiro], "t@t.com");

      expect(await geradoEm(SEGUNDA), JSON.stringify(primeiro)).toEqual(["14:00 christus_t1"]);
      expect(await geradoEm(TERCA)).toEqual(["14:00 christus_t1"]);
      expect(await padroes()).toHaveLength(1);
    }
  });

  it("falha no meio do encolher: repetir a operação acerta (decide item a item)", async () => {
    await montar([["christus_t1", "06:00"], ["christus_t5", "14:00"]]);
    await salvarModelo("Rota padrão", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await montar([["christus_t3", "10:00"]]);
    const ds = await getDataSource();
    const original = ds.atualizar.bind(ds);
    let n = 0;
    const espiao = vi.spyOn(ds, "atualizar").mockImplementation(async (t, id, m) => {
      if (t === "modelos_rotina" && ++n === 2) throw new Error("rede caiu");
      return original(t, id, m);
    });
    await expect(usarDiaComoPadrao(ORIGEM, SEDE, [1], "t@t.com")).rejects.toThrow(/Repita a operação/u);
    espiao.mockRestore();

    await usarDiaComoPadrao(ORIGEM, SEDE, [1], "t@t.com");

    expect(await geradoEm(SEGUNDA)).toEqual(["10:00 christus_t3"]);
    expect(await geradoEm(TERCA)).toEqual(["06:00 christus_t1", "14:00 christus_t5"]);
  });

  it("Seg–Sex e depois Seg–Qui: a sexta continua gerando a rota antiga completa", async () => {
    await montar([["christus_t1", "06:00"], ["christus_t3", "10:00"]]);
    await usarDiaComoPadrao(ORIGEM, SEDE, SEG_A_SEX, "t@t.com");
    await montar([["christus_t1", "07:00"]]);
    await usarDiaComoPadrao(ORIGEM, SEDE, [1, 2, 3, 4], "t@t.com");

    expect(await geradoEm("2026-08-14")).toEqual(["06:00 christus_t1", "10:00 christus_t3"]); // sexta
    expect(await geradoEm(TERCA)).toEqual(["07:00 christus_t1"]);
  });

  it("duas rotas antigas que sobram nos mesmos dias não se fundem (a que substitui continua substituindo)", async () => {
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Base", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await montar([["christus_t5", "14:00"]]);
    await salvarModelo("Fim", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true, diasSemana: "1,4", substitui: true });
    await montar([["christus_t3", "10:00"]]);

    await usarDiaComoPadrao(ORIGEM, SEDE, [0, 1, 2, 3, 5, 6], "t@t.com");

    // Na quinta sobram as duas antigas; "Fim" substitui o dia, então só ela monta.
    expect(await geradoEm("2026-08-13")).toEqual(["14:00 christus_t5"]);
    expect((await getModelos(SEDE)).map((m) => m.nome_modelo).sort()).toEqual(["Base", "Fim", "Rota padrão · dom, seg, ter, qua, sex, sáb"]);
  });

  it("salvarModelo recusa nome que apagaria itens de outra rota (e não grava nada)", async () => {
    // Mesmas 24 primeiras letras depois de normalizar = mesmo id de item.
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Rota padrão de segunda a sexta", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true, diasSemana: "1,2,3,4,5" });
    await expect(
      salvarModelo("Rota padrão de segunda a quinta", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true, diasSemana: "1,2,3,4" }),
    ).rejects.toThrow(/apagaria tarefas da rota/u);
    expect(await padroes()).toEqual(["Rota padrão de segunda a sexta [1,2,3,4,5]"]);
  });

  it("sem dia marcado recusa — e não toca na rota que existe", async () => {
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Rota padrão", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await expect(usarDiaComoPadrao(ORIGEM, SEDE, [], "t@t.com")).rejects.toBeInstanceOf(ErroValidacao);
    await expect(usarDiaComoPadrao(ORIGEM, SEDE, [7, -1], "t@t.com")).rejects.toBeInstanceOf(ErroValidacao);
    expect(await padroes()).toEqual(["Rota padrão []"]);
  });

  it("a rota recusa dias que não são inteiros de 0 a 6 (null não vira domingo)", async () => {
    for (const dias of [[null], [""], [false], [7], ["1"], [1.5], [0, 1, 2, 3, 4, 5, 6, 0]]) {
      const r = await POST(
        new Request("http://x/api/modelos/padrao", { method: "POST", body: JSON.stringify({ data_origem: ORIGEM, sede_id: SEDE, dias }) }),
      );
      expect(r.status, JSON.stringify(dias)).toBe(400);
    }
  });

  it("dia vazio recusa antes de encolher a rota antiga", async () => {
    await montar([["christus_t1", "06:00"]]);
    await salvarModelo("Rota padrão", ORIGEM, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await limpar(ORIGEM);
    await expect(usarDiaComoPadrao(ORIGEM, SEDE, [1], "t@t.com")).rejects.toBeInstanceOf(ErroValidacao);
    expect(await padroes()).toEqual(["Rota padrão []"]);
  });
});
