/**
 * O formulário de Usuários, visto pelo coordenador. Com "Supervisor" já marcado, quem
 * queria um coordenador salvava supervisor sem perceber (relato de 06/11/2026). Lê os campos que a página entrega ao CrudManager.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorSessao } from "@/components/SessaoContexto";
import type { SessaoUsuario } from "@/lib/permissions";

type Campo = { key: string; padrao?: unknown; opcoes?: (f: Record<string, unknown>) => { valor: string }[]; ajuda?: (f: Record<string, unknown>) => string };
const capturado = vi.hoisted(() => ({ campos: [] as unknown[], aoEditar: null as null | ((s: unknown, a: unknown) => void) }));
vi.mock("swr", () => ({ default: () => ({ data: [], mutate: async () => {} }), useSWRConfig: () => ({ mutate: async () => {} }) }));
vi.mock("@/components/CrudManager", () => ({
  default: (props: { campos: unknown[]; aoEditar: (s: unknown, a: unknown) => void }) => {
    capturado.campos = props.campos;
    capturado.aoEditar = props.aoEditar;
    return null;
  },
}));

const { default: Usuarios } = await import("@/app/(app)/usuarios/page");

function perfil(perfilDaSessao: string) {
  const sessao = { id: "eu", nome: "Eu", email: "eu@x.com", perfil: perfilDaSessao, sede_id: "dt", sedes: ["dt"] } as unknown as SessaoUsuario;
  renderToStaticMarkup(createElement(ProvedorSessao, { sessao, children: createElement(Usuarios) }));
  const campo = (capturado.campos as Campo[]).find((c) => c.key === "perfil")!;
  return { padrao: campo.padrao, ajuda: campo.ajuda!, valores: (f: Record<string, unknown>) => campo.opcoes!(f).map((o) => o.valor) };
}

describe("campo Perfil", () => {
  it("coordenador, ao criar: escolhe entre supervisor e coordenador, sem nada marcado", () => {
    const p = perfil("coordenador");
    expect(p.padrao).toBeUndefined();
    expect(p.valores({ __novo: true })).toEqual(["coordenador", "supervisor"]);
  });

  it("coordenador, ao editar supervisor: pode promover, e escolher não desfaz a opção de voltar", () => {
    const p = perfil("coordenador");
    const antes = { perfil: "supervisor" };
    expect(p.valores({ __antes: antes, perfil: "supervisor" })).toEqual(["coordenador", "supervisor"]);
    expect(p.valores({ __antes: antes, perfil: "coordenador" })).toEqual(["coordenador", "supervisor"]);
  });

  it("coordenador, ao editar coordenador: rebaixar nem aparece, porque o servidor recusa", () => {
    expect(perfil("coordenador").valores({ __antes: { perfil: "coordenador" }, perfil: "coordenador" })).toEqual(["coordenador"]);
  });

  it("avisa que a senha cai só quando está mesmo saindo de supervisor", () => {
    const { ajuda } = perfil("administrador");
    expect(ajuda({ __antes: { perfil: "supervisor" }, perfil: "coordenador" })).toContain("senha");
    expect(ajuda({ __antes: { perfil: "supervisor" }, perfil: "supervisor" })).toBe("");
    expect(ajuda({ __antes: { perfil: "coordenador" }, perfil: "administrador" })).toBe("");
    expect(ajuda({ __novo: true, perfil: "coordenador" })).toBe("");
  });

  it("administrador segue com todos os perfis, ao criar e ao editar", () => {
    const todos = ["administrador", "coordenador", "supervisor", "visualizador"];
    const p = perfil("administrador");
    expect(p.valores({ __novo: true })).toEqual(todos);
    expect(p.valores({ perfil: "supervisor" })).toEqual(todos);
  });
});

describe("depois de salvar uma edição", () => {
  const pedidos = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
  const conta = (perfilConta: string, extra = {}) => ({ id: "x", nome: "X", email: "x@x.com", perfil: perfilConta, ativo: true, ...extra });
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ email: { enviado: true, destino: "x@x.com" } }), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saiu de supervisor: a tela já pede o código, porque a senha caiu", () => {
    for (const quem of ["coordenador", "administrador"]) {
      vi.mocked(fetch).mockClear();
      perfil(quem);
      capturado.aoEditar!(conta("coordenador"), conta("supervisor"));
      expect(pedidos()).toEqual(["/api/usuarios/x/codigo"]);
    }
  });

  it("edição comum não apaga a senha de ninguém nem dispara e-mail", () => {
    perfil("coordenador");
    capturado.aoEditar!(conta("coordenador"), conta("coordenador"));
    capturado.aoEditar!(conta("supervisor"), conta("supervisor"));
    expect(pedidos()).toEqual([]);
  });

  it("conta inativa não pede código: seria recusado", () => {
    perfil("coordenador");
    capturado.aoEditar!(conta("coordenador", { ativo: false }), conta("supervisor"));
    expect(pedidos()).toEqual([]);
  });
});
