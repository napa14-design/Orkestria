/**
 * Desfazer o dia — o caminho de volta do "Gerar o dia".
 *
 * Reportado da tela em 25/08/2026: *"cliquei em gerar a rota padrão sem querer,
 * podia ter a opção de limpar o dia"*. Gerar cria dezenas de blocos de uma vez
 * e desfazer significava apagar um a um, no × de cada card.
 *
 * Apagar em lote é a operação mais perigosa da tela, então o que estes testes
 * protegem são as duas travas — não a remoção em si:
 *
 *  1. **bloco com realizado registrado nunca sai** (o realizado é evidência);
 *  2. **`"geradas"` não toca no que a pessoa montou à mão.**
 */
import { beforeEach, describe, expect, it } from "vitest";
import { reiniciarBanco } from "@/lib/memoryStore";
import { getDataSource } from "@/lib/datasource";
import { getRotinasByData, limparDia } from "@/services/rotinasService";

const SEDE = "christus_dt";
const DIA = "2026-09-10";

/** Grava direto no banco: o teste é da limpeza, não do caminho de criação. */
async function semear(blocos: Array<{ id: string; inicio: string }>) {
  const ds = await getDataSource();
  for (const b of blocos) {
    await ds.criar("rotinas_planejadas", {
      id: b.id,
      data: DIA,
      funcionario_id: "christus_f1",
      sede_id: SEDE,
      tarefa_id: "christus_t1",
      local_id: "christus_l1",
      inicio_planejado: b.inicio,
      fim_planejado: b.inicio,
      tempo_previsto_min: 10,
      tempo_visual_min: 30,
      blocos_ocupados: 1,
      status: "planejada",
      observacao: "",
      supervisor_id: "u1",
      criado_em: "",
      atualizado_em: "",
    } as never);
  }
}

async function comRealizado(rotinaId: string) {
  const ds = await getDataSource();
  await ds.criar("execucoes_realizadas", {
    id: `e_${rotinaId}`,
    rotina_id: rotinaId,
    data_execucao: DIA,
    sede_id: SEDE,
    funcionario_id: "christus_f1",
    status_realizado: "conforme_planejado",
    tempo_real_min: 10,
    observacao: "",
    justificativa: "",
    epis_confirmados: "",
    supervisor_id: "u1",
    criado_em: "",
    atualizado_em: "",
  } as never);
}

const ids = async () => (await getRotinasByData(DIA, SEDE)).map((r) => r.id).sort();

describe("limparDia", () => {
  beforeEach(() => reiniciarBanco());

  it('"geradas" remove o que a máquina criou e preserva o que foi montado à mão', async () => {
    await semear([
      { id: "ri_2026-09-10_item1", inicio: "07:00" }, // rota padrão
      { id: "m_2026-09-10_f_t_0800", inicio: "08:00" }, // gerar/duplicar/importar
      { id: "arrastado-a-mao-xyz", inicio: "09:00" }, // alocação manual
    ]);
    const r = await limparDia(SEDE, DIA, "geradas", "t@t.com");
    expect(r.removidas).toBe(2);
    expect(r.manuais).toBe(1);
    expect(await ids()).toEqual(["arrastado-a-mao-xyz"]);
  });

  it('"todas" limpa o dia inteiro, inclusive o manual', async () => {
    await semear([
      { id: "ri_2026-09-10_item1", inicio: "07:00" },
      { id: "arrastado-a-mao-xyz", inicio: "09:00" },
    ]);
    const r = await limparDia(SEDE, DIA, "todas", "t@t.com");
    expect(r.removidas).toBe(2);
    expect(await ids()).toEqual([]);
  });

  it("NUNCA remove bloco com realizado registrado — nem no escopo 'todas'", async () => {
    await semear([
      { id: "ri_2026-09-10_item1", inicio: "07:00" },
      { id: "ri_2026-09-10_item2", inicio: "08:00" },
    ]);
    await comRealizado("ri_2026-09-10_item2");

    const r = await limparDia(SEDE, DIA, "todas", "t@t.com");
    expect(r.removidas).toBe(1);
    expect(r.preservadas).toBe(1);
    expect(await ids()).toEqual(["ri_2026-09-10_item2"]);
    expect(r.detalhes.join(" ")).toMatch(/realizado registrado/u);
  });

  it("o realizado protege também o bloco manual", async () => {
    await semear([{ id: "manual-1", inicio: "07:00" }]);
    await comRealizado("manual-1");
    const r = await limparDia(SEDE, DIA, "todas", "t@t.com");
    expect(r.removidas).toBe(0);
    expect(r.preservadas).toBe(1);
  });

  it("dia vazio não faz nada e não quebra", async () => {
    const r = await limparDia(SEDE, "2026-09-11", "geradas", "t@t.com");
    expect(r).toEqual({ removidas: 0, preservadas: 0, manuais: 0, detalhes: [] });
  });

  it("não encosta em outra sede nem em outro dia", async () => {
    await semear([{ id: "ri_2026-09-10_item1", inicio: "07:00" }]);
    const ds = await getDataSource();
    await ds.criar("rotinas_planejadas", {
      id: "ri_2026-09-10_outrasede",
      data: DIA,
      sede_id: "christus_eus",
      funcionario_id: "x",
      tarefa_id: "x",
      local_id: "x",
      inicio_planejado: "07:00",
      fim_planejado: "07:10",
      tempo_previsto_min: 10,
      tempo_visual_min: 30,
      blocos_ocupados: 1,
      status: "planejada",
      observacao: "",
      supervisor_id: "u1",
      criado_em: "",
      atualizado_em: "",
    } as never);

    await limparDia(SEDE, DIA, "todas", "t@t.com");
    expect(await ids()).toEqual([]);
    expect((await getRotinasByData(DIA, "christus_eus")).map((r) => r.id)).toEqual([
      "ri_2026-09-10_outrasede",
    ]);
  });

  it("o relatório conta o que ficou, para a mensagem não mentir", async () => {
    await semear([
      { id: "ri_2026-09-10_a", inicio: "07:00" },
      { id: "manual-b", inicio: "08:00" },
      { id: "ri_2026-09-10_c", inicio: "09:00" },
    ]);
    await comRealizado("ri_2026-09-10_c");
    const r = await limparDia(SEDE, DIA, "geradas", "t@t.com");
    expect([r.removidas, r.preservadas, r.manuais]).toEqual([1, 1, 1]);
    expect(r.detalhes).toHaveLength(2);
  });
});
