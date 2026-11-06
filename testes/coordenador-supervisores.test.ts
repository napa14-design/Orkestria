/**
 * Coordenador cadastra os supervisores das sedes dele (04/11/2026). Os ataques
 * vieram da revisão de segurança, feita ANTES do código, e a primeira versão do
 * desenho não passava: um PUT no supervisor com `id`, `email`, `versao_sessao` e
 * `senha_hash` do administrador virava sessão de administrador na reconferência.
 * Pelas rotas, com banco de memória. Toda recusa confere que o cadastro não mudou.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { conviteAcesso } from "@/lib/emails/conviteAcesso";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { SessaoUsuario } from "@/lib/permissions";
import { podeGerirCoordenador, podeGerirSupervisor, podeVerCoordenador, sessaoDoCadastro } from "@/lib/permissions";
import { ErroConflito } from "@/services/erros";
import { hashSenha } from "@/lib/senha";
import { codigoConfere, gerarConviteUsuario, getUsuarioPorEmail, trocarPropriaSenha } from "@/services/usuariosService";
import type { Usuario } from "@/types";

const smtp = vi.hoisted(() => ({ ligado: true, falha: false }));
const enviados = vi.hoisted(() => [] as { para: string }[]);
vi.mock("@/lib/emailConfig", () => ({ emailConfigurado: () => smtp.ligado }));
vi.mock("@/lib/email", () => ({
  emailConfigurado: () => smtp.ligado,
  enviarEmail: async (args: { para: string }) => {
    if (smtp.falha) return { enviado: false, motivo: "smtp.interno:587 recusou" };
    enviados.push(args);
    return { enviado: true };
  },
}));

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { GET, POST } = await import("@/app/api/usuarios/route");
const { PUT, DELETE } = await import("@/app/api/usuarios/[id]/route");
const { POST: gerarCodigo } = await import("@/app/api/usuarios/[id]/codigo/route");

const A = "christus_dt";
const B = "christus_ald";
const C = "s-c";
const C1: SessaoUsuario = { id: "c1", nome: "Coord", email: "c1@x.com", perfil: "coordenador", sede_id: A, sedes: [A, B] };
const CG: SessaoUsuario = { id: "cg", nome: "Geral", email: "cg@x.com", perfil: "coordenador", sede_id: "geral", sedes: [] };
const ADM: SessaoUsuario = { id: "adm1", nome: "Adm", email: "adm@x.com", perfil: "administrador", sede_id: "geral", sedes: [] };

const corpo = (c: unknown, method = "POST") =>
  new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const editar = (id: string, c: unknown) => PUT(corpo(c, "PUT"), ctx(id));
const codigo = (id: string) => gerarCodigo(corpo({}), ctx(id));
const ler = async (id: string) => (await getDataSource()).obter("usuarios", id);
const novo = (extra: Record<string, unknown> = {}) => ({
  nome: "Sup Novo", email: "novo@x.com", perfil: "supervisor", sede_id: A, sedes_extra: "", ativo: true, ...extra,
});

async function conta(id: string, perfil: string, sede_id: string, extra: Partial<Usuario> = {}) {
  await (await getDataSource()).criar("usuarios", {
    id, nome: id, email: `${id}@x.com`, perfil: perfil as Usuario["perfil"], sede_id, sedes_extra: "", ativo: true,
    senha_hash: "salt:hash", convite_hash: "", convite_expira_em: "", versao_sessao: 3, criado_em: "", atualizado_em: "", ...extra,
  });
}

/** Faz a chamada e confere o status e que o alvo ficou igual, byte a byte. */
async function nega(id: string, chamada: () => Promise<Response>, ...status: number[]) {
  const antes = JSON.stringify(await ler(id));
  const r = await chamada();
  expect(status.length ? status : [403]).toContain(r.status);
  expect(JSON.stringify(await ler(id))).toBe(antes);
}

describe("coordenador cadastra supervisor", () => {
  beforeEach(async () => {
    reiniciarBanco();
    smtp.ligado = true;
    smtp.falha = false;
    enviados.length = 0;
    const d = await getDataSource();
    const sede = await d.obter("sedes", A);
    await d.criar("sedes", { ...sede!, id: C, nome_sede: "Sede C" });
    await conta("c1", "coordenador", A, { email: "c1@x.com", sedes_extra: B });
    await conta("cg", "coordenador", "geral", { email: "cg@x.com" });
    await conta("adm1", "administrador", "geral", { email: "adm@x.com" });
    await conta("coord2", "coordenador", C);
    await conta("vis1", "visualizador", "geral");
    await conta("sA", "supervisor", A);
    await conta("sAB", "supervisor", A, { sedes_extra: B });
    await conta("sC", "supervisor", C);
    await conta("sAC", "supervisor", A, { sedes_extra: C });
    await conta("legado", "supervisor", "geral");
    await conta("raro", "Supervisor", A);
    sessao = C1;
  });

  describe("regra pura", () => {
    it("nega lista vazia de sedes: [].every seria verdadeiro", () => {
      expect(podeGerirSupervisor(C1, { id: "x", perfil: "supervisor", sede_id: "geral" })).toBe(false);
      expect(podeGerirSupervisor(CG, { id: "x", perfil: "supervisor", sede_id: "geral" })).toBe(false);
    });
    it("uma sede fora basta para negar, e o perfil é comparação exata", () => {
      expect(podeGerirSupervisor(C1, { id: "x", perfil: "supervisor", sede_id: A, sedes_extra: B })).toBe(true);
      expect(podeGerirSupervisor(C1, { id: "x", perfil: "supervisor", sede_id: A, sedes_extra: C })).toBe(false);
      expect(podeGerirSupervisor(C1, { id: "x", perfil: "Supervisor", sede_id: A })).toBe(false);
    });
    it("sede adicional que não é texto no banco fica fora, sem derrubar a lista", async () => {
      expect(podeGerirSupervisor(C1, { id: "x", perfil: "supervisor", sede_id: A, sedes_extra: [B] as never })).toBe(false);
      await (await getDataSource()).atualizar("usuarios", "sA", { sedes_extra: [A] as never });
      const r = await GET();
      expect(r.status).toBe(200);
      expect((await r.json()).map((u: Usuario) => u.id)).toEqual(["sAB"]);
    });
    it("só coordenador: o administrador usa o caminho dele", () => {
      expect(podeGerirSupervisor(ADM, { id: "x", perfil: "supervisor", sede_id: A })).toBe(false);
    });
  });

  describe("quem entra", () => {
    it("sem sessão: 401 em tudo", async () => {
      sessao = null;
      expect((await GET()).status).toBe(401);
      expect((await POST(corpo(novo()))).status).toBe(401);
      expect((await editar("sA", { nome: "X" })).status).toBe(401);
      expect((await codigo("sA")).status).toBe(401);
    });

    it("gerência, supervisor e perfil desconhecido não gerenciam", async () => {
      for (const perfil of ["visualizador", "supervisor", "dono"]) {
        sessao = { ...C1, perfil: perfil as SessaoUsuario["perfil"] };
        expect((await GET()).status).toBe(403);
        expect((await POST(corpo(novo()))).status).toBe(403);
        await nega("sA", () => editar("sA", { nome: "X" }));
        await nega("sA", () => codigo("sA"));
      }
    });

    it("coordenador rebaixado no banco para de gerenciar antes de o cookie vencer", async () => {
      const d = await getDataSource();
      await d.atualizar("usuarios", "c1", { perfil: "visualizador" });
      await nega("sA", () => editar("sA", { nome: "X" }));
      await d.atualizar("usuarios", "c1", { perfil: "coordenador", ativo: false });
      await nega("sA", () => editar("sA", { nome: "X" }));
      await d.atualizar("usuarios", "c1", { ativo: true, sede_id: C, sedes_extra: "" });
      await nega("sA", () => editar("sA", { nome: "X" }));
    });
  });

  describe("administrador", () => {
    it("rebaixado no banco para de gerenciar antes de o cookie vencer: não cria outro administrador", async () => {
      sessao = ADM;
      await (await getDataSource()).atualizar("usuarios", "adm1", { perfil: "visualizador" });
      expect((await POST(corpo({ nome: "Novo Adm", email: "novoadm@x.com", perfil: "administrador", sede_id: "geral", ativo: true }))).status).toBe(403);
      expect((await GET()).status).toBe(403);
      await nega("sA", () => DELETE(corpo({}, "DELETE"), ctx("sA")));
      await nega("sA", () => codigo("sA"));
    });

    it("não inativa a si mesmo", async () => {
      sessao = ADM;
      await nega("adm1", () => editar("adm1", { ativo: false }), 400);
    });

    it("sede com nome reservado do Firestore é recusada antes do banco, para o geral também", async () => {
      sessao = CG;
      const obter = vi.spyOn(await getDataSource(), "obter");
      const r = await POST(corpo(novo({ sede_id: "__x__" })));
      expect(r.status).toBe(422);
      expect(await r.text()).toContain("Sede inválida");
      expect(obter.mock.calls.filter(([t]) => t === "sedes")).toEqual([]);
      obter.mockRestore();
    });
  });

  describe("o que não alcança", () => {
    it("não exclui", async () => {
      expect((await DELETE(corpo({}, "DELETE"), ctx("sA"))).status).toBe(403);
      expect(await ler("sA")).not.toBeNull();
    });

    it("não mexe em si mesmo nem gera código para si", async () => {
      await nega("c1", () => editar("c1", { nome: "X" }));
      await nega("c1", () => codigo("c1"));
    });

    it("não toca conta de outro perfil, nem para rebaixar", async () => {
      for (const id of ["adm1", "coord2", "vis1"]) await nega(id, () => editar(id, { nome: "X" }));
      await nega("coord2", () => editar("coord2", { perfil: "supervisor" }));
    });

    it("gerar código apaga a senha: é recusado antes, sem tocar em nada", async () => {
      for (const id of ["adm1", "coord2", "sC", "sAC"]) await nega(id, () => codigo(id));
    });

    it("supervisor antigo com 'geral' e perfil com caixa diferente ficam de fora, até do geral", async () => {
      for (const s of [C1, CG]) {
        sessao = s;
        await nega("legado", () => editar("legado", { nome: "X" }));
        await nega("raro", () => editar("raro", { nome: "X" }));
      }
    });

    it("não 'puxa para dentro' o supervisor com uma sede fora", async () => {
      await nega("sAC", () => editar("sAC", { sedes_extra: "" }));
    });

    it("fora do escopo e inexistente respondem igual: não revela quem existe", async () => {
      const [a, b] = [await editar("sC", { nome: "X" }), await editar("nao-existe", { nome: "X" })];
      expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
      const [c, d] = [await codigo("sC"), await codigo("nao-existe")];
      expect([c.status, await c.text()]).toEqual([d.status, await d.text()]);
    });

    it("só o administrador reativa", async () => {
      await (await getDataSource()).atualizar("usuarios", "sA", { ativo: false });
      await nega("sA", () => editar("sA", { ativo: true }));
      await nega("sA", () => editar("sA", { ...novo({ email: "sA@x.com", ativo: true }) }));
      sessao = ADM;
      expect((await editar("sA", { ativo: true })).status).toBe(200);
    });
  });

  describe("campos que não se escolhem", () => {
    it("a cadeia de escalada: id, e-mail, versão e senha do administrador", async () => {
      const adm = (await ler("adm1"))!;
      await nega("sA", () => editar("sA", { id: "adm1", email: adm.email, versao_sessao: adm.versao_sessao, senha_hash: "conhecido" }), 422);
      expect((await ler("adm1"))?.senha_hash).toBe(adm.senha_hash);
    });

    it("qualquer campo fora da lista é recusado, inclusive para o administrador", async () => {
      for (const extra of ["senha_hash", "convite_hash", "convite_expira_em", "versao_sessao", "id", "criado_em", "tutorial_estado", "qualquer"]) {
        sessao = C1;
        await nega("sA", () => editar("sA", { nome: "X", [extra]: "v" }), 422);
        expect((await POST(corpo(novo({ [extra]: "v" })))).status).toBe(422);
        sessao = ADM;
        await nega("sA", () => editar("sA", { nome: "X", [extra]: "v" }), 422);
      }
      sessao = C1;
      const proto = new Request("http://x/api", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"nome":"X","__proto__":{"perfil":"administrador"}}' });
      await nega("sA", () => PUT(proto, ctx("sA")), 422);
    });

    it("corpo que não é objeto não vira 500", async () => {
      for (const c of [null, [], "x", 1]) {
        await nega("sA", () => editar("sA", c), 422);
        expect((await POST(corpo(c))).status).toBe(422);
      }
    });

    it("perfil: só 'supervisor' ou 'coordenador' exatos", async () => {
      for (const perfil of ["administrador", "visualizador", "Supervisor", "supervisor ", "Coordenador", "coordenador ", ["supervisor"], ["coordenador"], null, "", 0]) {
        await nega("sA", () => editar("sA", { perfil }), 403, 422);
        expect([403, 422]).toContain((await POST(corpo(novo({ perfil })))).status);
      }
      expect(((await (await getDataSource()).listar("usuarios")).filter((u) => u.email === "novo@x.com"))).toEqual([]);
    });

    it("sede: nunca 'geral', nunca fora do escopo, sempre texto", async () => {
      for (const sede_id of ["geral", " geral", null, "", ["christus_dt"], {}, C, "christus_dt,s-c", "x/y", "__x__"]) {
        await nega("sA", () => editar("sA", { sede_id }), 403, 422);
        expect([403, 422]).toContain((await POST(corpo(novo({ sede_id })))).status);
      }
    });

    it("sedes adicionais: nunca fora, nunca 'geral', e array não vira 500", async () => {
      for (const sedes_extra of [C, `${A},${C}`, ` ${A} , ${C} `, "geral", `${A},geral`, [A], {}]) {
        await nega("sA", () => editar("sA", { sedes_extra }), 403, 422);
        expect([403, 422]).toContain((await POST(corpo(novo({ sedes_extra })))).status);
      }
    });

    it("ativo só booleano: a string 'false' é verdadeira num teste frouxo", async () => {
      for (const ativo of ["false", "true", 1, null]) await nega("sA", () => editar("sA", { ativo }), 422);
    });

    it("nome com controle ou vazio é recusado", async () => {
      for (const nome of ["", "   ", "a\r\nb", null, 1, "x".repeat(121)]) await nega("sA", () => editar("sA", { nome }), 422);
    });
  });

  describe("e-mail", () => {
    const lista = async () => (await getDataSource()).listar("usuarios");

    it("não reaproveita e-mail de ninguém, em qualquer caixa, nem de conta inativa", async () => {
      await (await getDataSource()).atualizar("usuarios", "vis1", { ativo: false });
      for (const email of ["adm@x.com", "ADM@X.COM", " adm@x.com ", "vis1@x.com", "sc@x.com"]) {
        const antes = (await lista()).length;
        const r = await POST(corpo(novo({ email })));
        expect(r.status).toBe(422);
        expect(await r.text()).not.toMatch(/administrador|coordenador|Sede/);
        expect((await lista()).length).toBe(antes);
      }
    });

    it("na edição também: não pega o e-mail de outra conta nem o do próprio coordenador", async () => {
      for (const email of ["adm@x.com", "coord2@x.com", "sC@x.com", "c1@x.com"]) await nega("sA", () => editar("sA", { email }), 422);
    });

    it("cadastro antigo com caixa diferente também segura o e-mail", async () => {
      const d = await getDataSource();
      await d.atualizar("usuarios", "vis1", { email: "Chefe@X.com" });
      await conta("inativa", "visualizador", "geral", { email: "chefe@x.com", ativo: false });
      expect((await POST(corpo(novo({ email: "chefe@x.com" })))).status).toBe(422);
    });

    it("formato: nada de quebra de linha, vírgula, unicode disfarçado ou não-texto", async () => {
      for (const email of ["a@x.com\r\nBcc: b@x.com", "a@x.com,b@x.com", "a@x.com;b@x.com", "Kelvin@x.com", "аdmin@x.com", "semarroba", null, 123, `${"a".repeat(250)}@x.com`]) {
        expect((await POST(corpo(novo({ email })))).status).toBe(422);
        await nega("sA", () => editar("sA", { email }), 422);
      }
      expect((await getUsuarioPorEmail("adm@x.com"))?.id).toBe("adm1");
    });

    it("grava em minúsculas, e reenviar o mesmo e-mail não é troca", async () => {
      const r = await POST(corpo(novo({ email: "  Novo@X.com " })));
      const criado = await r.json();
      expect((await ler(criado.id))?.email).toBe("novo@x.com");
      const d = await getDataSource();
      await d.atualizar("usuarios", "sA", { email: "Antigo@X.com" });
      expect((await editar("sA", { email: "antigo@x.com", nome: "Y" })).status).toBe(200);
      expect(await ler("sA")).toMatchObject({ email: "Antigo@X.com", versao_sessao: 3 });
    });

    it("login: duas contas ativas com o mesmo e-mail, ninguém entra", async () => {
      await conta("dup1", "supervisor", A, { email: "dup@x.com" });
      await conta("dup2", "administrador", "geral", { email: "dup@x.com" });
      expect(await getUsuarioPorEmail("dup@x.com")).toBeNull();
    });

    it("login: conta exata inativa não esconde a ativa de caixa antiga", async () => {
      await conta("velha", "supervisor", A, { email: "pessoa@x.com", ativo: false });
      await conta("atual", "supervisor", A, { email: "Pessoa@X.com" });
      expect((await getUsuarioPorEmail("pessoa@x.com"))?.id).toBe("atual");
    });

    it("login: duas contas ativas em caixas diferentes também não entram", async () => {
      await conta("dup1", "supervisor", A, { email: "mesma@x.com" });
      await conta("dup2", "administrador", "geral", { email: "Mesma@X.com" });
      expect(await getUsuarioPorEmail("mesma@x.com")).toBeNull();
      expect(await getUsuarioPorEmail("MESMA@x.com")).toBeNull();
    });

    it("login sobrevive a cadastro com e-mail nulo", async () => {
      await (await getDataSource()).atualizar("usuarios", "vis1", { email: null as never });
      expect(await getUsuarioPorEmail("ninguem@x.com")).toBeNull();
    });
  });

  describe("listagem", () => {
    it("só os supervisores inteiramente nas sedes dele; filtro na URL não muda nada", async () => {
      const ids = (await (await GET()).json()).map((u: Usuario) => u.id).sort();
      expect(ids).toEqual(["sA", "sAB"]);
    });

    it("o geral vê supervisores e coordenadores de todas as sedes, sem o legado e o de caixa diferente", async () => {
      sessao = CG;
      const ids = (await (await GET()).json()).map((u: Usuario) => u.id).sort();
      expect(ids).toEqual(["c1", "coord2", "sA", "sAB", "sAC", "sC"]);
    });

    it("nenhuma resposta carrega segredo, para nenhum perfil", async () => {
      await gerarConviteUsuario("sAB");
      for (const s of [C1, ADM]) {
        sessao = s;
        const listas = [await GET(), await editar("sA", { nome: "Y" }), await POST(corpo(novo({ email: `n${s.id}@x.com` })))];
        for (const r of listas) expect(await r.text()).not.toMatch(/senha_hash|convite_hash|convite_expira_em|tutorial_|versao_sessao|salt:hash/);
      }
    });
  });

  describe("efeitos de mudar a conta", () => {
    it("código guardado não sobrevive a promoção, troca de e-mail, de sede ou inativação", async () => {
      const casos: Array<[Record<string, unknown>, SessaoUsuario]> = [
        [{ perfil: "coordenador" }, ADM],
        [{ email: "outro@x.com" }, C1],
        [{ sede_id: B }, C1],
        [{ ativo: false }, C1],
      ];
      for (const [mudanca, s] of casos) {
        reiniciarBanco();
        await conta("c1", "coordenador", A, { email: "c1@x.com", sedes_extra: B });
        await conta("adm1", "administrador", "geral", { email: "adm@x.com" });
        await conta("sA", "supervisor", A);
        const { codigo: guardado } = await gerarConviteUsuario("sA");
        const versao = (await ler("sA"))?.versao_sessao ?? 0;
        expect(codigoConfere((await ler("sA"))!, guardado)).toBe(true);
        sessao = s;
        expect((await editar("sA", mudanca)).status).toBe(200);
        const depois = (await ler("sA"))!;
        expect(codigoConfere(depois, guardado)).toBe(false);
        expect(depois.versao_sessao).toBe(versao + 1);
      }
    });

    it("trocar só o nome não derruba a sessão nem o código", async () => {
      const { codigo: guardado } = await gerarConviteUsuario("sA");
      const versao = (await ler("sA"))?.versao_sessao;
      expect((await editar("sA", { nome: "Novo Nome" })).status).toBe(200);
      expect((await ler("sA"))?.versao_sessao).toBe(versao);
      expect(codigoConfere((await ler("sA"))!, guardado)).toBe(true);
    });

    it("conta inativa não recebe código, nem do administrador", async () => {
      await (await getDataSource()).atualizar("usuarios", "sA", { ativo: false });
      await nega("sA", () => codigo("sA"), 422);
      sessao = ADM;
      await nega("sA", () => codigo("sA"), 422);
    });

    it("o código não vai para o histórico, e a linha guarda só nomes de campo", async () => {
      const r = await codigo("sA");
      const { codigo: gerado } = await r.json();
      const hist = await (await getDataSource()).listar("historico");
      expect(JSON.stringify(hist)).not.toContain(gerado);
      expect(hist.some((h) => h.tabela === "usuarios" && h.registro_id === "sA" && String(h.resumo).includes("convite_hash"))).toBe(true);
    });

    it("o nome digitado não vira HTML no e-mail da empresa", () => {
      const { html } = conviteAcesso({ nome: '<a/href="http://mal">clique', codigo: "AAAA", expiraEm: "2026-12-01T00:00:00Z", url: "http://x" });
      expect(html).not.toContain('<a/href="http://mal"');
      expect(html).toContain("&#60;a/href");
    });

    it("a validade do e-mail é a de Fortaleza, seja qual for o fuso do servidor", () => {
      vi.stubEnv("TZ", "UTC"); // o da Vercel: sem o fuso fixo, sairia "21 de novembro"
      const { texto } = conviteAcesso({ nome: "A", codigo: "AAAA", expiraEm: "2026-11-21T01:00:00Z", url: "http://x" });
      vi.unstubAllEnvs();
      expect(texto).toContain("20 de novembro");
    });
  });

  describe("coordenador gerencia coordenador das sedes dele", () => {
    const criar = async (extra: Record<string, unknown> = {}) => {
      const r = await POST(corpo(novo({ perfil: "coordenador", email: "coord-novo@x.com", ...extra })));
      expect(r.status).toBe(201);
      return (await r.json()).id as string;
    };
    /** Coordenador da mesma sede, já com senha: o colega que não pode ser tomado. */
    const colega = async (extra: Partial<Usuario> = {}) => conta("par", "coordenador", A, { email: "par@x.com", ...extra });

    it("cria nas sedes dele, com a autoria da sessão, e a conta nova só alcança aquelas sedes", async () => {
      const id = await criar({ sedes_extra: B });
      expect(await ler(id)).toMatchObject({ perfil: "coordenador", sede_id: A, sedes_extra: B, criado_por_id: "c1", ativo: true });
      expect(sessaoDoCadastro((await ler(id))!)).toMatchObject({ perfil: "coordenador", sedes: [A, B] });
    });

    it("nunca fora das sedes dele, nem 'geral', nem por sede adicional", async () => {
      for (const extra of [{ sede_id: C }, { sedes_extra: C }, { sede_id: "geral" }, { sedes_extra: "geral" }, { sede_id: B, sedes_extra: C }])
        expect([403, 422], JSON.stringify(extra)).toContain((await POST(corpo(novo({ perfil: "coordenador", ...extra })))).status);
      sessao = CG;
      expect((await POST(corpo(novo({ perfil: "coordenador", sede_id: "geral" })))).status).toBe(403);
      expect(await getUsuarioPorEmail("novo@x.com")).toBeNull();
      expect((await POST(corpo(novo({ perfil: "coordenador", sede_id: C })))).status).toBe(201);
    });

    it("a cadeia não amplia: quem foi criado só com uma sede não cria com a outra", async () => {
      const id = await criar();
      sessao = sessaoDoCadastro((await ler(id))!);
      expect((await POST(corpo(novo({ perfil: "coordenador", email: "c3@x.com", sede_id: B })))).status).toBe(403);
      expect((await POST(corpo(novo({ perfil: "coordenador", email: "c3@x.com", sede_id: A })))).status).toBe(201);
    });

    it("não forja quem criou", async () => {
      expect((await POST(corpo(novo({ perfil: "coordenador", criado_por_id: "adm1" })))).status).toBe(422);
      await colega();
      await nega("par", () => editar("par", { criado_por_id: "c1" }), 422);
    });

    it("vê quem tem sede em comum, sem segredo; quem não tem nenhuma fica de fora", async () => {
      await colega();
      await conta("meio", "coordenador", A, { sedes_extra: C });
      const lista = await (await GET()).json();
      const ids = lista.map((u: Usuario) => u.id);
      expect(ids).toEqual(expect.arrayContaining(["par", "meio"]));
      expect(ids).not.toContain("coord2"); // só a sede C
      expect(ids).not.toContain("cg"); // "geral" não é sede em comum
      expect(ids).not.toContain("c1"); // ele mesmo
      expect(ids).not.toContain("adm1");
      expect(JSON.stringify(lista)).not.toMatch(/criado_por_id|senha_hash|convite_hash/u);
    });

    it("edita nome e sedes de quem está inteiro nas sedes dele, e inativa, mas não reativa nem exclui", async () => {
      await colega();
      expect((await editar("par", { nome: "Par Novo", sede_id: B, sedes_extra: A })).status).toBe(200);
      expect(await ler("par")).toMatchObject({ nome: "Par Novo", sede_id: B, sedes_extra: A, senha_hash: "salt:hash" });
      expect((await editar("par", { ativo: false })).status).toBe(200);
      await nega("par", () => editar("par", { ativo: true }));
      await nega("par", () => DELETE(corpo({}, "DELETE"), ctx("par")));
    });

    it("o que opera sede fora das dele, só vê: nem edita, nem gera código, nem puxa para dentro", async () => {
      await conta("meio", "coordenador", A, { sedes_extra: C });
      await nega("meio", () => editar("meio", { nome: "X" }));
      await nega("meio", () => editar("meio", { sedes_extra: "" }));
      await nega("meio", () => codigo("meio"));
    });

    it("não dá sede que ele não opera ao colega", async () => {
      await colega();
      await nega("par", () => editar("par", { sede_id: C }));
      await nega("par", () => editar("par", { sedes_extra: C }));
    });

    it("tomar a conta: o e-mail de um coordenador só o administrador troca", async () => {
      await colega();
      await nega("par", () => editar("par", { email: "c1-pessoal@x.com" }));
      await nega("par", () => editar("par", { email: "c1-pessoal@x.com", nome: "Par" }));
      // Reenviar o mesmo e-mail é o que o formulário faz: não é troca.
      expect((await editar("par", { nome: "Par 2", email: "PAR@x.com" })).status).toBe(200);
      expect((await ler("par"))?.email).toBe("par@x.com");
      sessao = ADM;
      expect((await editar("par", { email: "novo-par@x.com" })).status).toBe(200);
    });

    it("tomar a conta: rebaixar o colega abriria o código na tela, então é do administrador", async () => {
      await colega();
      for (const perfil of ["supervisor", "visualizador", "administrador"]) await nega("par", () => editar("par", { perfil }));
      expect(await (await editar("par", { perfil: "supervisor" })).json()).toMatchObject({ erro: "Só um administrador tira o perfil de coordenador." });
      sessao = ADM;
      expect((await editar("par", { perfil: "supervisor" })).status).toBe(200);
    });

    it("o código do coordenador nunca volta para quem pediu, e o e-mail é o único caminho", async () => {
      await colega();
      for (const id of ["par", await criar()]) {
        const r = await codigo(id);
        expect(r.status).toBe(200);
        const corpoR = await r.json();
        expect(corpoR).not.toHaveProperty("codigo");
        expect(JSON.stringify(corpoR)).not.toMatch(/[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}/u);
        expect(enviados.at(-1)).toMatchObject({ para: (await ler(id))?.email });
      }
      // A senha sai, e quem pediu não tem o código: só quem tem a caixa entra.
      expect((await ler("par"))?.senha_hash).toBe("");
    });

    it("sem e-mail configurado, recusa antes de apagar a senha do colega", async () => {
      await colega();
      smtp.ligado = false;
      await nega("par", () => codigo("par"), 422);
      expect(await (await codigo("par")).json()).toMatchObject({ erro: expect.stringContaining("administrador") });
    });

    it("e-mail que falha: nada muda na conta, a senha segue valendo, e o erro do SMTP não vaza", async () => {
      await colega();
      smtp.falha = true;
      const antes = JSON.stringify(await ler("par"));
      const r = await (await codigo("par")).json();
      expect(r).not.toHaveProperty("codigo");
      expect(r.email).toMatchObject({ enviado: false, destino: "par@x.com" });
      expect(JSON.stringify(r)).not.toContain("smtp.interno");
      expect(JSON.stringify(await ler("par"))).toBe(antes);
    });

    it("supervisor segue como era: o código volta para o coordenador", async () => {
      expect(await (await codigo("sA")).json()).toHaveProperty("codigo");
    });

    it("administrador segue vendo o código de quem for", async () => {
      await colega();
      sessao = ADM;
      expect(await (await codigo("par")).json()).toHaveProperty("codigo");
    });

    it("promover supervisor: vira coordenador e tem de provar a caixa de novo", async () => {
      const antes = (await ler("sA"))!;
      const r = await editar("sA", { perfil: "coordenador" });
      expect(r.status).toBe(200);
      const depois = (await ler("sA"))!;
      expect(depois).toMatchObject({ perfil: "coordenador", senha_hash: "", convite_hash: "" });
      expect(depois.versao_sessao).toBe((antes.versao_sessao ?? 0) + 1);
      // O caminho do ataque: criar supervisor, ver o código na tela, entrar e se promover.
      expect(await (await codigo("sA")).json()).not.toHaveProperty("codigo");
    });

    it("sem e-mail configurado, nem promove: a senha sairia sem ter como mandar o código", async () => {
      smtp.ligado = false;
      await nega("sA", () => editar("sA", { perfil: "coordenador" }), 422);
    });

    it("sair de supervisor apaga a senha para qualquer destino e qualquer autor: ela pode ser do colega", async () => {
      sessao = ADM;
      for (const [id, perfil] of [["sA", "coordenador"], ["sAB", "administrador"], ["sC", "visualizador"]]) {
        expect((await editar(id, { perfil })).status).toBe(200);
        expect((await ler(id))?.senha_hash, perfil).toBe("");
      }
      // O administrador vê o código, como sempre.
      expect(await (await codigo("sA")).json()).toHaveProperty("codigo");
    });

    it("rebaixar pelo administrador, o colega definir a senha, e devolver o perfil: a senha não volta", async () => {
      await colega();
      sessao = ADM;
      await editar("par", { perfil: "supervisor" });
      await (await getDataSource()).atualizar("usuarios", "par", { senha_hash: "senha-do-colega" });
      await editar("par", { perfil: "coordenador" });
      expect((await ler("par"))?.senha_hash).toBe("");
    });

    it("mudança que não tira de supervisor não mexe na senha", async () => {
      await colega();
      sessao = ADM;
      expect((await editar("par", { perfil: "administrador", sede_id: "geral" })).status).toBe(200);
      expect((await ler("par"))?.senha_hash).toBe("salt:hash");
      expect((await editar("sA", { sede_id: B })).status).toBe(200);
      expect((await ler("sA"))?.senha_hash).toBe("salt:hash");
    });

    it("promover e inativar no mesmo salvar é recusado: o código não sairia", async () => {
      await nega("sA", () => editar("sA", { perfil: "coordenador", ativo: false }), 422);
    });

    describe("corridas: a conta muda entre a leitura e a gravação, pelas rotas", () => {
      /** Roda `acao` na n-ésima leitura que casar: é o pedido do outro chegando no meio deste. */
      const intercalar = async (casa: (t: string, i: string) => boolean, nVezes: number, acao: () => Promise<unknown>) => {
        const d = await getDataSource();
        const orig = d.obter.bind(d);
        let n = 0;
        return vi.spyOn(d, "obter").mockImplementation((async (tab: string, id: string) => {
          if (casa(tab, id) && ++n === nVezes) await acao();
          return orig(tab as never, id);
        }) as never);
      };
      const comoAdm = (f: () => Promise<unknown>) => async () => {
        const s = sessao;
        sessao = ADM;
        expect(((await f()) as Response).status).toBe(200);
        sessao = s;
      };
      const naConta = (id: string) => (t: string, i: string) => t === "usuarios" && i === id;
      const naSede = (t: string) => t === "sedes";

      it("rota do código: promovida entre conferir e gravar, o código não sai nem é gravado", async () => {
        const spy = await intercalar(naConta("sA"), 2, comoAdm(() => editar("sA", { perfil: "coordenador" })));
        const r = await codigo("sA");
        spy.mockRestore();
        expect(r.status).toBe(409);
        expect(await r.json()).not.toHaveProperty("codigo");
        expect(await ler("sA")).toMatchObject({ perfil: "coordenador", convite_hash: "", senha_hash: "" });
      });

      it("rota do primeiro acesso: promovida entre conferir e gravar, a senha não é gravada", async () => {
        const { codigo: cod } = await gerarConviteUsuario("sA");
        const { POST: primeiro } = await import("@/app/api/auth/primeiro-acesso/route");
        const spy = await intercalar(naConta("sA"), 1, comoAdm(() => editar("sA", { perfil: "coordenador" })));
        const r = await primeiro(corpo({ email: "sA@x.com", senha_atual: cod, nova_senha: "Senha-Do-Colega-1!" }));
        spy.mockRestore();
        expect(r.status).toBe(409);
        expect(await ler("sA")).toMatchObject({ perfil: "coordenador", senha_hash: "" });
      });

      it("promoção: código gravado depois de ela ler a conta, a promoção recusa em vez de passar por cima", async () => {
        let visto = "";
        const spy = await intercalar(naSede, 1, async () => {
          visto = (await gerarConviteUsuario("sA")).codigo;
        });
        const r = await editar("sA", { perfil: "coordenador" });
        spy.mockRestore();
        expect(r.status).toBe(409);
        const g = (await ler("sA"))!;
        expect(g.perfil).toBe("supervisor");
        expect(codigoConfere(g, visto)).toBe(true);
      });

      it("trocar a própria senha: conta promovida no meio, a senha não é gravada", async () => {
        await (await getDataSource()).atualizar("usuarios", "sA", { senha_hash: hashSenha("Senha-Atual-1!x") });
        const spy = await intercalar(naConta("sA"), 2, comoAdm(() => editar("sA", { perfil: "coordenador" })));
        await expect(trocarPropriaSenha("sA", "Senha-Atual-1!x", "Senha-Nova-Certa-1!")).rejects.toBeInstanceOf(ErroConflito);
        spy.mockRestore();
        expect(await ler("sA")).toMatchObject({ perfil: "coordenador", senha_hash: "" });
      });

      it("edição comum não desfaz a inativação do administrador feita no meio", async () => {
        await colega();
        const spy = await intercalar(naSede, 1, comoAdm(() => editar("par", { ativo: false })));
        const r = await editar("par", { nome: "Renomeado", email: "par@x.com", perfil: "coordenador", sede_id: A, sedes_extra: "", ativo: true });
        spy.mockRestore();
        expect(r.status).toBe(409);
        expect(await ler("par")).toMatchObject({ ativo: false, nome: "par" });
      });

      it("renomear não devolve a sede que o administrador acabou de tirar, nem por acidente", async () => {
        await colega({ sedes_extra: B });
        const spy = await intercalar(naSede, 1, comoAdm(() => editar("par", { sedes_extra: "" })));
        const r = await editar("par", { nome: "Renomeado" });
        spy.mockRestore();
        expect(r.status).toBe(409);
        expect(await ler("par")).toMatchObject({ sedes_extra: "", nome: "par" });
      });

      it("edição comum não desfaz o rebaixamento do administrador feito no meio", async () => {
        await colega();
        const spy = await intercalar(naSede, 1, comoAdm(() => editar("par", { perfil: "supervisor" })));
        const r = await editar("par", { nome: "Renomeado", perfil: "coordenador" });
        spy.mockRestore();
        expect(r.status).toBe(409);
        expect((await ler("par"))?.perfil).toBe("supervisor");
      });

      it("código de colega: a conta muda depois do e-mail, 409 avisa que o e-mail pode chegar", async () => {
        await colega();
        const spy = await intercalar(naConta("par"), 2, comoAdm(() => editar("par", { nome: "Mudou", sedes_extra: B })));
        const r = await codigo("par");
        spy.mockRestore();
        expect(r.status).toBe(409);
        const corpoR = await r.json();
        expect(corpoR.erro).toContain("último envio");
        expect(corpoR).not.toHaveProperty("codigo");
        expect((await ler("par"))?.senha_hash).toBe("salt:hash");
      });

      it("reativar também derruba a sessão, como inativar", async () => {
        await conta("par", "coordenador", A, { ativo: false, versao_sessao: 7 });
        sessao = ADM;
        expect((await editar("par", { ativo: true })).status).toBe(200);
        expect((await ler("par"))?.versao_sessao).toBe(8);
      });

      it("a resposta de conflito é 409, para a tela pedir nova tentativa", async () => {
        const { comSessao } = await import("@/lib/api");
        const r = await comSessao(async () => {
          throw new ErroConflito("mudou");
        });
        expect(r.status).toBe(409);
      });
    });

    it("erro do SMTP no código de supervisor: o motivo cru é só do administrador", async () => {
      smtp.falha = true;
      expect(JSON.stringify(await (await codigo("sA")).json())).not.toContain("smtp.interno");
      sessao = ADM;
      expect(JSON.stringify(await (await codigo("sAB")).json())).toContain("smtp.interno");
    });

    it("não promove quem tem sede fora, e nunca a administrador", async () => {
      await nega("sAC", () => editar("sAC", { perfil: "coordenador" }));
      await nega("sA", () => editar("sA", { perfil: "coordenador", sede_id: C }));
      await nega("sA", () => editar("sA", { perfil: "administrador" }));
    });

    it("quem perdeu a sede ou o perfil deixa de ver e de editar", async () => {
      await colega();
      const d = await getDataSource();
      await d.atualizar("usuarios", "c1", { sede_id: C, sedes_extra: "" });
      expect((await (await GET()).json()).map((u: Usuario) => u.id)).not.toContain("par");
      await nega("par", () => editar("par", { nome: "X" }));
      await nega("par", () => codigo("par"));
      await d.atualizar("usuarios", "c1", { perfil: "visualizador", sede_id: A });
      expect((await POST(corpo(novo({ perfil: "coordenador", email: "z@x.com" })))).status).toBe(403);
    });

    it("não mexe em si mesmo e não cria administrador", async () => {
      await nega("c1", () => editar("c1", { nome: "X" }));
      await nega("c1", () => codigo("c1"));
      expect((await POST(corpo(novo({ perfil: "administrador", sede_id: A, email: "adm2@x.com" })))).status).toBe(403);
    });

    it("regra pura: perfil exato, sem lista vazia, e ver não é editar", () => {
      const alvo = { id: "x", perfil: "coordenador", sede_id: A };
      expect(podeGerirCoordenador(C1, alvo)).toBe(true);
      expect(podeGerirCoordenador(ADM, alvo)).toBe(false);
      expect(podeGerirCoordenador(C1, { ...alvo, perfil: "Coordenador" })).toBe(false);
      expect(podeGerirCoordenador(C1, { ...alvo, id: "c1" })).toBe(false);
      expect(podeGerirCoordenador(C1, { ...alvo, sede_id: "geral" })).toBe(false);
      expect(podeGerirCoordenador(C1, { ...alvo, sedes_extra: C })).toBe(false);
      expect(podeVerCoordenador(C1, { ...alvo, sedes_extra: C })).toBe(true);
      expect(podeVerCoordenador(C1, { ...alvo, sede_id: C })).toBe(false);
      expect(podeVerCoordenador(C1, { ...alvo, sede_id: "geral" })).toBe(false);
      expect(podeVerCoordenador(C1, { ...alvo, sedes_extra: [A] as never })).toBe(false);
    });
  });

  describe("o que tem de funcionar", () => {
    it("cria nas sedes dele, com sedes adicionais, e o código dá sessão de supervisor", async () => {
      const r = await POST(corpo(novo({ sedes_extra: B })));
      expect(r.status).toBe(201);
      const criado = await r.json();
      expect(await ler(criado.id)).toMatchObject({ perfil: "supervisor", sede_id: A, sedes_extra: B, ativo: true });
      const g = await codigo(criado.id);
      expect(g.status).toBe(200);
      expect(codigoConfere((await ler(criado.id))!, (await g.json()).codigo)).toBe(true);
    });

    it("edita com o corpo que o formulário manda", async () => {
      const form = { nome: "Sup A", email: "sA@x.com", perfil: "supervisor", sede_id: B, sedes_extra: "", ativo: true };
      expect((await editar("sA", form)).status).toBe(200);
      expect(await ler("sA")).toMatchObject({ nome: "Sup A", sede_id: B });
    });

    it("inativa", async () => {
      expect((await editar("sA", { ativo: false })).status).toBe(200);
      expect((await ler("sA"))?.ativo).toBe(false);
    });

    it("o geral cria em qualquer sede, mas nunca com 'geral'", async () => {
      sessao = CG;
      expect((await POST(corpo(novo({ sede_id: C })))).status).toBe(201);
      expect((await POST(corpo(novo({ sede_id: "geral", email: "g@x.com" })))).status).toBe(422);
    });

    it("o administrador continua com tudo", async () => {
      sessao = ADM;
      const ids = (await (await GET()).json()).map((u: Usuario) => u.id);
      expect(ids).toEqual(expect.arrayContaining(["adm1", "coord2", "sC", "sAC", "legado"]));
      expect((await POST(corpo({ nome: "Outro", email: "outro@x.com", perfil: "coordenador", sede_id: "geral", ativo: true }))).status).toBe(201);
      expect((await editar("coord2", { perfil: "visualizador" })).status).toBe(200);
      expect((await DELETE(corpo({}, "DELETE"), ctx("sC"))).status).toBe(200);
      expect(await ler("sC")).toBeNull();
    });
  });
});
