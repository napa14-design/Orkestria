/**
 * Escopo de sede — a parte do sistema em que um erro vaza dado de outra sede.
 *
 * A propriedade que estes testes protegem é uma só: **um supervisor nunca
 * amplia o próprio alcance**. Nem omitindo o filtro, nem trocando o parâmetro
 * na URL, nem com cookie antigo.
 */
import { describe, expect, it } from "vitest";
import {
  CHAVES_SO_ADMINISTRADOR,
  limitarSedeConsulta,
  montarSedesDaSessao,
  podeAlterarSede,
  podeCriarNoCatalogo,
  podeEditarItemDoCatalogo,
  podeEditarParametro,
  podeGerenciarCatalogo,
  sedesPermitidas,
  type SessaoUsuario,
} from "@/lib/permissions";

const base: SessaoUsuario = {
  id: "u1",
  nome: "Teste",
  email: "t@t.com",
  perfil: "supervisor",
  sede_id: "aldeota",
};

const umaSede: SessaoUsuario = { ...base, sedes: ["aldeota"] };
const duasSedes: SessaoUsuario = { ...base, sedes: ["aldeota", "messejana"] };
const geral: SessaoUsuario = { ...base, sede_id: "geral", sedes: [] };
const admin: SessaoUsuario = { ...base, perfil: "administrador", sede_id: "geral" };
const gerencia: SessaoUsuario = { ...base, perfil: "visualizador", sede_id: "geral" };

describe("montarSedesDaSessao", () => {
  it("junta a principal com as extras, sem repetir", () => {
    expect(montarSedesDaSessao("aldeota", "messejana,aldeota")).toEqual(["aldeota", "messejana"]);
  });

  it("ignora espaços e entradas vazias do CSV", () => {
    expect(montarSedesDaSessao("aldeota", " messejana , ,benfica ")).toEqual([
      "aldeota",
      "messejana",
      "benfica",
    ]);
  });

  it("devolve vazio para 'geral' — quem alcança todas não tem lista", () => {
    expect(montarSedesDaSessao("geral", "messejana")).toEqual([]);
  });
});

describe("sedesPermitidas", () => {
  it("null (sem restrição) para administrador, gerência e supervisor geral", () => {
    expect(sedesPermitidas(admin)).toBeNull();
    expect(sedesPermitidas(gerencia)).toBeNull();
    expect(sedesPermitidas(geral)).toBeNull();
  });

  it("a lista completa para quem opera várias", () => {
    expect(sedesPermitidas(duasSedes)).toEqual(["aldeota", "messejana"]);
  });

  it("cai na sede principal quando o cookie é antigo e não tem a lista", () => {
    // Cookie emitido antes do campo existir: falha FECHANDO, nunca abrindo.
    expect(sedesPermitidas(base)).toEqual(["aldeota"]);
  });
});

describe("limitarSedeConsulta — nunca amplia", () => {
  it("sem sede pedida, devolve a principal (não 'todas')", () => {
    expect(limitarSedeConsulta(umaSede)).toBe("aldeota");
    expect(limitarSedeConsulta(duasSedes)).toBe("aldeota");
  });

  it("aceita sede pedida que está no escopo", () => {
    expect(limitarSedeConsulta(duasSedes, "messejana")).toBe("messejana");
  });

  it("recusa sede fora do escopo caindo na principal", () => {
    expect(limitarSedeConsulta(duasSedes, "benfica")).toBe("aldeota");
    expect(limitarSedeConsulta(umaSede, "messejana")).toBe("aldeota");
  });

  it("nunca devolve undefined para quem tem escopo", () => {
    // undefined significaria "todas as sedes" na camada de consulta.
    for (const pedida of [undefined, "", "benfica", "geral"]) {
      expect(limitarSedeConsulta(duasSedes, pedida)).not.toBeUndefined();
    }
  });

  it("preserva o filtro pedido para quem alcança todas", () => {
    expect(limitarSedeConsulta(admin, "benfica")).toBe("benfica");
    expect(limitarSedeConsulta(gerencia, "benfica")).toBe("benfica");
    expect(limitarSedeConsulta(admin)).toBeUndefined();
  });
});

describe("podeAlterarSede", () => {
  it("administrador altera qualquer sede", () => {
    expect(podeAlterarSede(admin, "qualquer")).toBe(true);
  });

  it("supervisor altera as que opera e nenhuma outra", () => {
    expect(podeAlterarSede(duasSedes, "aldeota")).toBe(true);
    expect(podeAlterarSede(duasSedes, "messejana")).toBe(true);
    expect(podeAlterarSede(duasSedes, "benfica")).toBe(false);
  });

  it("gerência não altera nada, nem a própria sede", () => {
    expect(podeAlterarSede({ ...gerencia, sede_id: "aldeota" }, "aldeota")).toBe(false);
  });

  it("cookie antigo altera só a sede principal", () => {
    expect(podeAlterarSede(base, "aldeota")).toBe(true);
    expect(podeAlterarSede(base, "messejana")).toBe(false);
  });
});

/**
 * A régua não pertence a quem é medido.
 *
 * Os 121% da CESIU só são sobrecarga porque `ocupacao_alta` vale 100. Se o
 * supervisor pudesse subir para 200, o diagnóstico sumiria da tela sem que
 * nada mudasse no chão — e ninguém conseguiria distinguir depois "a sede
 * melhorou" de "alguém mexeu na régua".
 */
describe("podeEditarParametro", () => {
  const marcado = (chave: string, sede_id = "geral") => ({
    chave,
    editavel_por_supervisor: true,
    sede_id,
  });

  it("supervisor edita parâmetro comum marcado como editável", () => {
    expect(podeEditarParametro(umaSede, marcado("bloco_agenda_min"))).toBe(true);
    expect(podeEditarParametro(umaSede, marcado("bloco_agenda_min", "aldeota"))).toBe(true);
  });

  it("supervisor NÃO edita os limites de ocupação, mesmo marcados como editáveis", () => {
    for (const chave of CHAVES_SO_ADMINISTRADOR) {
      expect(podeEditarParametro(umaSede, marcado(chave)), chave).toBe(false);
      expect(podeEditarParametro(umaSede, marcado(chave, "aldeota")), chave).toBe(false);
    }
  });

  it("as três chaves travadas são exatamente os limites de ocupação", () => {
    expect([...CHAVES_SO_ADMINISTRADOR].sort()).toEqual([
      "ocupacao_adequada",
      "ocupacao_alta",
      "ocupacao_baixa",
    ]);
  });

  it("administrador continua editando tudo", () => {
    for (const chave of CHAVES_SO_ADMINISTRADOR) {
      expect(podeEditarParametro(admin, marcado(chave))).toBe(true);
    }
  });

  it("visualizador não edita nada", () => {
    expect(podeEditarParametro(gerencia, marcado("bloco_agenda_min"))).toBe(false);
  });

  it("supervisor não edita parâmetro de sede que não opera", () => {
    expect(podeEditarParametro(umaSede, marcado("bloco_agenda_min", "messejana"))).toBe(false);
  });

  it("a flag desmarcada continua valendo para as chaves comuns", () => {
    expect(
      podeEditarParametro(umaSede, { ...marcado("bloco_agenda_min"), editavel_por_supervisor: false }),
    ).toBe(false);
  });
});

/**
 * Catálogo global: criar é aditivo, editar é que alcança as 18 sedes.
 *
 * Até 24/08/2026 os três catálogos (tipos de local, categorias, requisitos)
 * eram só de administrador — e a medição da produção mostrou o absurdo: o
 * sistema tem **2 usuários**, e quem opera o piloto é uma **supervisora**. O
 * atalho "+ novo", feito para poupar passos, dava 403 justamente para ela.
 */
describe("catálogo global", () => {
  const item = (autor?: string) => ({ criado_por: autor });

  it("supervisor CRIA — é aditivo e não mexe em registro existente", () => {
    expect(podeCriarNoCatalogo(umaSede)).toBe(true);
    expect(podeCriarNoCatalogo(admin)).toBe(true);
  });

  it("visualizador não cria nada", () => {
    expect(podeCriarNoCatalogo(gerencia)).toBe(false);
  });

  it("supervisor edita o que ELE criou", () => {
    expect(podeEditarItemDoCatalogo(umaSede, item(umaSede.email))).toBe(true);
  });

  it("supervisor NÃO edita item de outro — muda o cálculo das 18 sedes", () => {
    expect(podeEditarItemDoCatalogo(umaSede, item("outra.pessoa@x.com"))).toBe(false);
  });

  it("os itens semeados ficam intocáveis para o supervisor", () => {
    // Os 12 tipos, 8 categorias e 17 requisitos vieram com outro autor.
    expect(podeEditarItemDoCatalogo(umaSede, item("ia02@px.com.br"))).toBe(false);
    expect(podeEditarItemDoCatalogo(umaSede, item("catalogo"))).toBe(false);
    expect(podeEditarItemDoCatalogo(umaSede, item("import"))).toBe(false);
  });

  it("item sem autor não vira brecha", () => {
    expect(podeEditarItemDoCatalogo(umaSede, item(undefined))).toBe(false);
    expect(podeEditarItemDoCatalogo(umaSede, item(""))).toBe(false);
    expect(podeEditarItemDoCatalogo(umaSede, null)).toBe(false);
    expect(podeEditarItemDoCatalogo(umaSede, undefined)).toBe(false);
  });

  it("sessão sem e-mail não casa com item sem autor", () => {
    // Sem o guard, `undefined === undefined` daria **true** e um cookie
    // malformado abriria o catálogo inteiro. É o vazio casando com o vazio.
    const semEmail = { ...umaSede, email: "" } as SessaoUsuario;
    expect(podeEditarItemDoCatalogo(semEmail, item(""))).toBe(false);
    expect(podeEditarItemDoCatalogo(semEmail, item(undefined))).toBe(false);
    const indefinido = { ...umaSede, email: undefined as unknown as string };
    expect(podeEditarItemDoCatalogo(indefinido, item(undefined))).toBe(false);
  });

  it("administrador edita qualquer um, inclusive sem autor", () => {
    expect(podeEditarItemDoCatalogo(admin, item("qualquer@x.com"))).toBe(true);
    expect(podeEditarItemDoCatalogo(admin, null)).toBe(true);
  });

  it("visualizador não edita nem o que tivesse criado", () => {
    expect(podeEditarItemDoCatalogo(gerencia, item(gerencia.email))).toBe(false);
  });

  it("a gestão ampla do catálogo segue de administrador", () => {
    // É o que governa a ação "Recalibrar", que multiplica o tempo de todas as
    // tarefas de uma categoria em todas as sedes.
    expect(podeGerenciarCatalogo(admin)).toBe(true);
    expect(podeGerenciarCatalogo(umaSede)).toBe(false);
  });
});
