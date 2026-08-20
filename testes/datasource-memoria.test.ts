/**
 * Contrato do `DataSource` no modo memória.
 *
 * Existe por causa de um bug que só apareceu depois de meses: `criar` em memória
 * fazia `push` puro, enquanto o Firestore faz `doc(id).set()` — **sobrescreve**.
 * As duas fontes discordavam da mesma chamada, e o modo memória era **mais gentil
 * que a produção**: gravar duas vezes com o mesmo id duplicava a linha aqui e
 * substituía o documento lá.
 *
 * Isso torna inútil qualquer verificação de idempotência feita só em memória —
 * inclusive a garantia "dois cliques simultâneos gravam o mesmo doc", que estava
 * documentada como verificada e nunca havia sido exercida de verdade.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDataSource } from "@/lib/memoryStore";

const sede = () => ({
  id: "sede-teste",
  nome_sede: "Sede de teste",
  cidade: "Fortaleza",
  endereco: "",
  tipo_sede: "escola" as const,
  grupo: "",
  ativo: true,
  criado_por: "teste",
  criado_em: "2026-01-01T00:00:00.000Z",
  atualizado_por: "teste",
  atualizado_em: "2026-01-01T00:00:00.000Z",
});

describe("MemoryDataSource.criar", () => {
  let ds: MemoryDataSource;
  beforeEach(() => {
    ds = new MemoryDataSource();
  });

  it("gravar com id NOVO acrescenta", async () => {
    const antes = (await ds.listar("sedes")).length;
    await ds.criar("sedes", sede());
    expect((await ds.listar("sedes")).length).toBe(antes + 1);
  });

  it("gravar com id EXISTENTE substitui, não duplica (igual ao Firestore)", async () => {
    await ds.criar("sedes", sede());
    const depoisDoPrimeiro = (await ds.listar("sedes")).length;

    await ds.criar("sedes", { ...sede(), nome_sede: "Nome trocado" });
    expect((await ds.listar("sedes")).length).toBe(depoisDoPrimeiro);

    const guardada = await ds.obter("sedes", "sede-teste");
    expect(guardada?.nome_sede).toBe("Nome trocado");
  });

  it("dois 'cliques simultâneos' com o mesmo id deixam UM registro", async () => {
    // É a garantia que o id determinístico da materialização promete. Com `push`,
    // ela era falsa em memória e ninguém percebia.
    await Promise.all([
      ds.criar("sedes", sede()),
      ds.criar("sedes", { ...sede(), nome_sede: "Corrida" }),
    ]);
    expect((await ds.listar("sedes")).filter((s) => s.id === "sede-teste")).toHaveLength(1);
  });
});

/**
 * Campo opcional gravado como `undefined`.
 *
 * O Firestore **recusa o documento inteiro** (`Cannot use "undefined" as a
 * Firestore value`), e o modo memória guardava sem reclamar — de novo o falso
 * mais gentil que o real. Custou uma importação pela metade em produção: os 86
 * locais da CESIU criados e nenhuma tarefa, porque `categoria_id` vinha
 * `undefined` quando a planilha não trazia categoria.
 */
describe("undefined em campo opcional", () => {
  it("a chave não é gravada (é o que o Firestore faz depois do semUndefined)", async () => {
    const ds = new MemoryDataSource();
    await ds.criar("sedes", { ...sede(), codigo: undefined, grupo: undefined });
    const guardada = await ds.obter("sedes", "sede-teste");
    expect(guardada).not.toBeNull();
    expect(Object.hasOwn(guardada!, "codigo")).toBe(false);
    expect(Object.hasOwn(guardada!, "grupo")).toBe(false);
    expect(guardada!.nome_sede).toBe("Sede de teste");
  });
});

/**
 * `atualizar` com campo `undefined`.
 *
 * O `criar` já foi alinhado nos dois bancos, mas o `atualizar` não: o Firestore
 * aplica `semUndefined` (a chave é ignorada e o valor antigo permanece) e a
 * memória fazia o spread cru, apagando o valor. Mesma família do bug do
 * `categoria_id`, e introduzida ao consertar metade dele.
 */
describe("atualizar com undefined", () => {
  it("undefined NÃO apaga o valor gravado (é 'não mexi', não 'limpe')", async () => {
    const ds = new MemoryDataSource();
    await ds.criar("sedes", { ...sede(), codigo: "PQL1" });
    await ds.atualizar("sedes", "sede-teste", { nome_sede: "Novo nome", codigo: undefined });
    const guardada = await ds.obter("sedes", "sede-teste");
    expect(guardada?.nome_sede).toBe("Novo nome");
    expect(guardada?.codigo).toBe("PQL1");
  });

  it("string vazia CONTINUA limpando o campo (é assim que o sistema limpa)", async () => {
    const ds = new MemoryDataSource();
    await ds.criar("sedes", { ...sede(), codigo: "PQL1" });
    await ds.atualizar("sedes", "sede-teste", { codigo: "" });
    expect((await ds.obter("sedes", "sede-teste"))?.codigo).toBe("");
  });
});
