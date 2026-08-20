/**
 * CONTRATO DO DataSource — a mesma bateria rodada contra os dois bancos.
 *
 * Por que existe: três bugs seguidos tiveram a mesma forma — o banco de memória
 * sendo **mais permissivo que o Firestore**, então a falha não aparecia em teste
 * nem em desenvolvimento e só derrubava a escrita em produção.
 *
 *  - 25/06: `criar` fazia `push` em memória e `set` (upsert) no Firestore, então
 *    gravar duas vezes com o mesmo id duplicava aqui e substituía lá. Isso
 *    invalidava toda verificação de idempotência feita só em memória.
 *  - 18/08: campo opcional gravado como `undefined` — memória aceitava, Firestore
 *    **recusa o documento inteiro**. Parou a importação da CESIU no meio: 86
 *    locais criados e nenhuma tarefa.
 *  - 20/08: o conserto do item anterior foi aplicado ao `criar` dos dois bancos,
 *    mas ao `atualizar` só do Firestore — criando uma divergência NOVA ao
 *    consertar a antiga, com um teste que cobria só a metade consertada.
 *
 * A lição dos três é a mesma: **testar cada implementação por si não pega
 * divergência**. O que pega é uma bateria só, rodada contra as duas — que é o
 * que este arquivo faz.
 *
 * ## Como rodar contra o Firestore também
 *
 * A perna do Firestore só liga com o **emulador**, e essa é a trava de
 * segurança: sem `FIRESTORE_EMULATOR_HOST` os testes nem constroem o adaptador,
 * então não existe caminho para escrever na base real por engano.
 *
 *     npm run emulador                       # porta 8085 (ver firebase.json)
 *     FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm test
 *
 * ⚠️ Confira no log que subiu ("All emulators ready"). A porta é 8085 e não a
 * 8080 padrão porque a 8080 costuma estar ocupada por emulador de outro projeto
 * — e aí o `emulators:start` falha calado enquanto a suíte roda contra o
 * emulador alheio. Aconteceu em 20/08.
 *
 * ## O que este contrato NÃO cobre
 *
 * **Índice composto.** O emulador não exige índice, então uma consulta
 * multi-campo passa aqui e pode falhar em produção. Isso continua sendo
 * responsabilidade do `firestore.indexes.json` — ver o comentário em
 * `lib/datasource.ts`.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DataSource } from "@/lib/datasource";
import { MemoryDataSource } from "@/lib/memoryStore";
import type { Feriado, Sede } from "@/types";

/** Prefixo próprio: o contrato nunca olha nem mexe em registro que não criou. */
const P = "contrato-teste-";
const aud = {
  criado_por: "contrato",
  criado_em: "2026-01-01T00:00:00.000Z",
  atualizado_por: "contrato",
  atualizado_em: "2026-01-01T00:00:00.000Z",
};

const sede = (id: string, extra: Partial<Sede> = {}): Sede => ({
  id: P + id,
  nome_sede: "Sede do contrato",
  cidade: "Fortaleza",
  endereco: "",
  tipo_sede: "escola",
  ativo: true,
  ...aud,
  ...extra,
});

const feriado = (id: string, inicio: string, sedeId = ""): Feriado => ({
  id: P + id,
  sede_id: sedeId,
  nome: "Feriado do contrato",
  data_inicio: inicio,
  data_fim: inicio,
  ativo: true,
  ...aud,
});

/** A bateria. Roda igual para qualquer implementação de `DataSource`. */
function contrato(nome: string, montar: () => Promise<DataSource>) {
  describe(`DataSource: ${nome}`, () => {
    let ds: DataSource;
    const sujeira: Array<["sedes" | "feriados", string]> = [];

    const criarSede = async (s: Sede) => {
      sujeira.push(["sedes", s.id]);
      return ds.criar("sedes", s);
    };
    const criarFeriado = async (f: Feriado) => {
      sujeira.push(["feriados", f.id]);
      return ds.criar("feriados", f);
    };

    beforeEach(async () => {
      ds = await montar();
    });

    afterAll(async () => {
      for (const [tabela, id] of sujeira) {
        try {
          await ds.excluir(tabela, id);
        } catch {
          /* já não existia */
        }
      }
    });

    // ── leitura ────────────────────────────────────────────────────────
    it("obter id inexistente devolve null (não lança, não devolve undefined)", async () => {
      expect(await ds.obter("sedes", `${P}nao-existe`)).toBeNull();
    });

    it("listar traz o que foi criado naquela tabela e nada de outra", async () => {
      await criarSede(sede("listar"));
      await criarFeriado(feriado("listar", "2026-05-01"));
      const sedes = await ds.listar("sedes");
      expect(sedes.some((s) => s.id === `${P}listar`)).toBe(true);
      expect(sedes.some((s) => s.id === `${P}listar` && "data_inicio" in s)).toBe(false);
    });

    // ── criar ──────────────────────────────────────────────────────────
    it("criar com id NOVO acrescenta e devolve o registro", async () => {
      const r = await criarSede(sede("novo"));
      expect(r.id).toBe(`${P}novo`);
      expect((await ds.obter("sedes", `${P}novo`))?.nome_sede).toBe("Sede do contrato");
    });

    it("criar com id EXISTENTE substitui, não duplica — incidente de 25/06", async () => {
      await criarSede(sede("upsert"));
      await criarSede(sede("upsert", { nome_sede: "Trocada" }));
      const todas = (await ds.listar("sedes")).filter((s) => s.id === `${P}upsert`);
      expect(todas.length).toBe(1);
      expect(todas[0].nome_sede).toBe("Trocada");
    });

    it("dois criar concorrentes com o mesmo id deixam UM registro", async () => {
      // É a promessa do id determinístico da materialização (`m_<data>_...`):
      // dois cliques simultâneos gravam o mesmo documento, não dois.
      await Promise.all([
        criarSede(sede("corrida")),
        criarSede(sede("corrida", { nome_sede: "Segunda" })),
      ]);
      expect((await ds.listar("sedes")).filter((s) => s.id === `${P}corrida`).length).toBe(1);
    });

    it("criar com campo opcional undefined grava SEM a chave — incidente da CESIU", async () => {
      await criarSede(sede("undef", { codigo: undefined, grupo: undefined }));
      const g = await ds.obter("sedes", `${P}undef`);
      expect(g).not.toBeNull();
      expect(Object.hasOwn(g!, "codigo")).toBe(false);
      expect(Object.hasOwn(g!, "grupo")).toBe(false);
      expect(g!.nome_sede).toBe("Sede do contrato");
    });

    it("criar preserva '' , 0 e false — são valores, não ausência", async () => {
      // Importa porque limpar campo no sistema é `""` (ex.: zerar a validade de
      // uma qualificação). Se `""` sumisse, a limpeza deixaria de gravar.
      await criarSede(sede("vazios", { codigo: "", ativo: false }));
      const g = await ds.obter("sedes", `${P}vazios`);
      expect(g?.codigo).toBe("");
      expect(g?.ativo).toBe(false);
    });

    // ── atualizar ──────────────────────────────────────────────────────
    it("atualizar mexe só nos campos passados", async () => {
      await criarSede(sede("parcial", { codigo: "AAA" }));
      const r = await ds.atualizar("sedes", `${P}parcial`, { nome_sede: "Outro nome" });
      expect(r.nome_sede).toBe("Outro nome");
      expect(r.codigo).toBe("AAA");
      expect(r.cidade).toBe("Fortaleza");
    });

    it("atualizar com undefined PRESERVA o valor — incidente de 20/08", async () => {
      // `undefined` quer dizer "não mexi neste campo". Quem limpa grava "".
      await criarSede(sede("preserva", { codigo: "PQL1" }));
      await ds.atualizar("sedes", `${P}preserva`, { nome_sede: "Novo", codigo: undefined });
      const g = await ds.obter("sedes", `${P}preserva`);
      expect(g?.nome_sede).toBe("Novo");
      expect(g?.codigo).toBe("PQL1");
    });

    it("atualizar com '' LIMPA o campo", async () => {
      await criarSede(sede("limpa", { codigo: "PQL1" }));
      await ds.atualizar("sedes", `${P}limpa`, { codigo: "" });
      expect((await ds.obter("sedes", `${P}limpa`))?.codigo).toBe("");
    });

    it("atualizar registro inexistente lança", async () => {
      await expect(ds.atualizar("sedes", `${P}fantasma`, { nome_sede: "x" })).rejects.toThrow();
    });

    // ── excluir ────────────────────────────────────────────────────────
    it("excluir tira do listar e do obter", async () => {
      await criarSede(sede("excluir"));
      await ds.excluir("sedes", `${P}excluir`);
      expect(await ds.obter("sedes", `${P}excluir`)).toBeNull();
    });

    it("excluir o que não existe NÃO lança", async () => {
      await expect(ds.excluir("sedes", `${P}nunca-existiu`)).resolves.toBeUndefined();
    });

    // ── consultar ──────────────────────────────────────────────────────
    it("consultar por igualdade traz só o que casa", async () => {
      await criarFeriado(feriado("eq-a", "2026-03-01", `${P}sede-a`));
      await criarFeriado(feriado("eq-b", "2026-03-02", `${P}sede-b`));
      const r = await ds.consultar("feriados", [
        { campo: "sede_id", op: "==", valor: `${P}sede-a` },
      ]);
      expect(r.map((x) => x.id)).toEqual([`${P}eq-a`]);
    });

    it("consultar por intervalo (>= e <=) inclui as pontas", async () => {
      await criarFeriado(feriado("faixa-1", "2026-06-10", `${P}faixa`));
      await criarFeriado(feriado("faixa-2", "2026-06-20", `${P}faixa`));
      await criarFeriado(feriado("faixa-3", "2026-06-30", `${P}faixa`));
      const r = await ds.consultar("feriados", [
        { campo: "sede_id", op: "==", valor: `${P}faixa` },
        { campo: "data_inicio", op: ">=", valor: "2026-06-10" },
        { campo: "data_inicio", op: "<=", valor: "2026-06-20" },
      ]);
      expect(r.map((x) => x.id).sort()).toEqual([`${P}faixa-1`, `${P}faixa-2`]);
    });

    it("consultar sem nenhum resultado devolve lista vazia", async () => {
      const r = await ds.consultar("feriados", [
        { campo: "sede_id", op: "==", valor: `${P}sede-que-nao-existe` },
      ]);
      expect(r).toEqual([]);
    });

    it("criar SEM id é recusado com mensagem útil", async () => {
      // O campo `id` é o id do documento. Gravar sem ele produz um registro que
      // a leitura enxerga e a edição não alcança — foi o que aconteceu com o
      // `bloco_agenda_min` de três sedes (a tela dava "Registro undefined não
      // encontrado"). Aqui a escrita para antes, dizendo o porquê.
      const semId = { ...sede("sem-id") } as Record<string, unknown>;
      delete semId.id;
      await expect(ds.criar("sedes", semId as never)).rejects.toThrow(/sem id utilizável/u);
    });

    // ── gravarLote: tudo ou nada ───────────────────────────────────────
    it("lote grava todas as operações", async () => {
      sujeira.push(["sedes", `${P}lote-1`], ["sedes", `${P}lote-2`]);
      await ds.gravarLote([
        { tipo: "criar", tabela: "sedes", registro: sede("lote-1") },
        { tipo: "criar", tabela: "sedes", registro: sede("lote-2") },
      ]);
      expect(await ds.obter("sedes", `${P}lote-1`)).not.toBeNull();
      expect(await ds.obter("sedes", `${P}lote-2`)).not.toBeNull();
    });

    it("lote com UMA operação inválida não grava NADA — o caso da CESIU", async () => {
      // Em 18/08 a importação parou com 86 locais criados e nenhuma tarefa,
      // porque as escritas eram soltas. Com lote, ou entra tudo ou não entra
      // nada. `atualizar` de registro inexistente é a falha usada aqui porque
      // vale igual nos dois bancos.
      sujeira.push(["sedes", `${P}atomico-1`], ["sedes", `${P}atomico-2`]);
      await expect(
        ds.gravarLote([
          { tipo: "criar", tabela: "sedes", registro: sede("atomico-1") },
          { tipo: "atualizar", tabela: "sedes", id: `${P}nao-existe-mesmo`, mudancas: { nome_sede: "x" } },
          { tipo: "criar", tabela: "sedes", registro: sede("atomico-2") },
        ]),
      ).rejects.toThrow();
      expect(await ds.obter("sedes", `${P}atomico-1`)).toBeNull();
      expect(await ds.obter("sedes", `${P}atomico-2`)).toBeNull();
    });

    it("lote mistura tabelas — é o que põe dado e auditoria no mesmo commit", async () => {
      sujeira.push(["sedes", `${P}misto`], ["feriados", `${P}misto`]);
      await ds.gravarLote([
        { tipo: "criar", tabela: "sedes", registro: sede("misto") },
        { tipo: "criar", tabela: "feriados", registro: feriado("misto", "2026-12-25") },
      ]);
      expect(await ds.obter("sedes", `${P}misto`)).not.toBeNull();
      expect(await ds.obter("feriados", `${P}misto`)).not.toBeNull();
    });

    it("lote faz criar, atualizar e excluir numa operação só", async () => {
      sujeira.push(["sedes", `${P}multi-a`], ["sedes", `${P}multi-b`]);
      await criarSede(sede("multi-a", { codigo: "ANTIGO" }));
      await criarSede(sede("multi-b"));
      await ds.gravarLote([
        { tipo: "atualizar", tabela: "sedes", id: `${P}multi-a`, mudancas: { codigo: "NOVO" } },
        { tipo: "excluir", tabela: "sedes", id: `${P}multi-b` },
      ]);
      expect((await ds.obter("sedes", `${P}multi-a`))?.codigo).toBe("NOVO");
      expect(await ds.obter("sedes", `${P}multi-b`)).toBeNull();
    });

    it("lote vazio não quebra", async () => {
      await expect(ds.gravarLote([])).resolves.toBeUndefined();
    });

    it("consultar enxerga o que acabou de ser gravado", async () => {
      // Sem isto, um serviço que grava e relê na mesma chamada (a importação
      // faz exatamente isso) pode ver o estado velho.
      await criarFeriado(feriado("recem", "2026-09-07", `${P}recem`));
      const r = await ds.consultar("feriados", [
        { campo: "sede_id", op: "==", valor: `${P}recem` },
      ]);
      expect(r.length).toBe(1);
    });
  });
}

// ── memória: roda sempre ──────────────────────────────────────────────
contrato("memória", async () => new MemoryDataSource());

// ── Firestore: só com o emulador ligado ───────────────────────────────
const EMULADOR = process.env.FIRESTORE_EMULATOR_HOST;
if (EMULADOR) {
  contrato(`Firestore (emulador ${EMULADOR})`, async () => {
    // Segunda trava, além da ausência da env: se alguém apontar a variável para
    // um host que não seja local, o contrato para em vez de escrever fora.
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):/u.test(EMULADOR)) {
      throw new Error(
        `FIRESTORE_EMULATOR_HOST aponta para "${EMULADOR}", que não é local. ` +
          "O contrato só roda contra emulador — nunca contra uma base real.",
      );
    }
    const { FirebaseDataSource } = await import("@/lib/firebaseClient");
    return new FirebaseDataSource();
  });
} else {
  describe("DataSource: Firestore", () => {
    it.skip("pulado — ligue o emulador e defina FIRESTORE_EMULATOR_HOST", () => {});
  });
}
