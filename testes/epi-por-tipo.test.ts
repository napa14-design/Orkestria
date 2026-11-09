/**
 * EPI padrão por tipo de local (pedido da coordenação, 06/11/2026): quem cadastra não
 * repete à mão o EPI de todo banheiro. Tarefa nova sem EPI marcado nasce com o do tipo;
 * o que é marcado à mão manda; editar não reaplica.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { episDaTarefa } from "@/services/execucoesService";
import { createTarefa, updateTarefa } from "@/services/tarefasService";
import { createTipoLocal, updateTipoLocal } from "@/services/tiposLocalService";
import type { Tarefa } from "@/types";

const ds = () => getDataSource();
let base: Omit<Tarefa, "id" | "sede_id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em">;

beforeEach(async () => {
  reiniciarBanco();
  const d = await ds();
  const aud = { criado_por: "a", criado_em: "", atualizado_por: "a", atualizado_em: "" };
  await d.criar("requisitos", { id: "luva", nome: "Luvas nitrílicas", tipo: "epi", descricao: "", ativo: true, ...aud });
  await d.criar("requisitos", { id: "pff2", nome: "Máscara PFF2", tipo: "epi", descricao: "", ativo: true, ...aud });
  await d.criar("requisitos", { id: "velha", nome: "Bota antiga", tipo: "epi", descricao: "", ativo: false, ...aud });
  await d.criar("requisitos", { id: "nr35", nome: "NR-35", tipo: "treinamento", descricao: "", ativo: true, ...aud });
  await d.criar("tipos_local", { id: "wc", nome: "Banheiro", fator_intensidade: 1.5, ativo: true, epis_padrao: "luva,pff2", ...aud });
  await d.atualizar("locais", "christus_l1", { tipo_local: "wc" });
  const t = (await d.listar("tarefas")).find((x) => x.local_id === "christus_l1")!;
  const { id: _i, sede_id: _s, criado_por: _a, criado_em: _b, atualizado_por: _c, atualizado_em: _d, ...resto } = t;
  base = { ...resto, nome_tarefa: "Limpar WC novo", requisitos: "" };
});

describe("tarefa nova herda o EPI do tipo do local", () => {
  it("sem EPI marcado, nasce com os do tipo, e a declaração do realizado passa a pedi-los", async () => {
    const t = await createTarefa(base, "c@x.com");
    expect(t.requisitos).toBe("luva,pff2");
    expect((await episDaTarefa(t.id)).sort()).toEqual(["Luvas nitrílicas", "Máscara PFF2"]);
  });

  it("EPI marcado à mão manda: não completa com o do tipo", async () => {
    expect((await createTarefa({ ...base, requisitos: "luva" }, "c@x.com")).requisitos).toBe("luva");
  });

  it("treinamento marcado não é EPI: mantém e acrescenta o do tipo", async () => {
    expect((await createTarefa({ ...base, requisitos: "nr35" }, "c@x.com")).requisitos).toBe("nr35,luva,pff2");
  });

  it("EPI inativo no catálogo não entra", async () => {
    await (await ds()).atualizar("tipos_local", "wc", { epis_padrao: "luva,velha" });
    expect((await createTarefa(base, "c@x.com")).requisitos).toBe("luva");
  });

  it("local de tipo sem EPI padrão segue como era", async () => {
    await (await ds()).atualizar("locais", "christus_l1", { tipo_local: "outros" });
    expect((await createTarefa(base, "c@x.com")).requisitos).toBe("");
  });

  it("editar não reaplica: quem tirou o EPI decidiu", async () => {
    const t = await createTarefa(base, "c@x.com");
    expect((await updateTarefa(t.id, { requisitos: "" }, "c@x.com")).requisitos).toBe("");
  });

  it("mudar o padrão do tipo não mexe nas tarefas que já existem", async () => {
    const t = await createTarefa(base, "c@x.com");
    await (await ds()).atualizar("tipos_local", "wc", { epis_padrao: "luva" });
    expect((await (await ds()).obter("tarefas", t.id))?.requisitos).toBe("luva,pff2");
  });
});

describe("cadastro do EPI padrão no tipo", () => {
  it("aceita só EPI do catálogo, nunca treinamento, id inexistente ou não-texto", async () => {
    for (const epis_padrao of ["nr35", "luva,nr35", 5, ["luva"]])
      await expect(createTipoLocal({ nome: "X", fator_intensidade: 1, ativo: true, epis_padrao } as never, "a")).rejects.toThrow(/EPIs padrão/);
    await expect(updateTipoLocal("wc", { epis_padrao: "nr35" }, "a")).rejects.toThrow(/EPIs padrão/);
    expect((await (await ds()).obter("tipos_local", "wc"))?.epis_padrao).toBe("luva,pff2");
  });

  it("grava a lista limpa: espaço e repetição somem, e o EPI com espaço também entra na tarefa", async () => {
    expect((await updateTipoLocal("wc", { epis_padrao: " luva , pff2,luva," }, "a")).epis_padrao).toBe("luva,pff2");
    await (await ds()).atualizar("tipos_local", "wc", { epis_padrao: "luva, pff2" }); // gravado antes, por fora
    expect((await createTarefa(base, "c@x.com")).requisitos).toBe("luva,pff2");
  });

  it("EPI apagado do catálogo não trava o tipo: some ao salvar", async () => {
    await (await ds()).excluir("requisitos", "pff2");
    expect((await updateTipoLocal("wc", { epis_padrao: "luva,pff2", nome: "Banheiro" }, "a")).epis_padrao).toBe("luva");
  });

  it("local sem tipo e requisitos que não são texto não derrubam a criação", async () => {
    await (await ds()).atualizar("locais", "christus_l1", { tipo_local: "" });
    expect((await createTarefa(base, "c@x.com")).requisitos).toBe("");
    await (await ds()).atualizar("locais", "christus_l1", { tipo_local: "wc" });
    await expect(createTarefa({ ...base, requisitos: 5 as never }, "c@x.com")).resolves.toBeTruthy();
  });

  it("vazio limpa, e um EPI válido grava", async () => {
    expect((await updateTipoLocal("wc", { epis_padrao: "" }, "a")).epis_padrao).toBe("");
    expect((await createTipoLocal({ nome: "Copa", fator_intensidade: 1.5, ativo: true, epis_padrao: "luva" }, "a")).epis_padrao).toBe("luva");
  });
});
