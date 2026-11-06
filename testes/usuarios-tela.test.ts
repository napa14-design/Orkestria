/**
 * A tela de Usuários não oferece ao coordenador o que o servidor recusaria: de outro
 * coordenador, edita e pede código só se ele está inteiro nas sedes dele, e nunca exclui.
 * Monta a página e lê os botões de cada linha.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorSessao } from "@/components/SessaoContexto";
import type { SessaoUsuario } from "@/lib/permissions";
import type { UsuarioListado } from "@/types";

const swr = vi.hoisted(() => ({ usuarios: [] as unknown[] }));
vi.mock("swr", () => ({
  default: (chave: string | null) => ({
    data: chave?.startsWith("/api/usuarios") ? swr.usuarios : [],
    mutate: async () => {},
    isLoading: false,
  }),
  useSWRConfig: () => ({ mutate: async () => {} }),
  mutate: async () => {},
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/usuarios",
  useRouter: () => ({ push() {}, replace() {} }),
}));

const { default: Usuarios } = await import("@/app/(app)/usuarios/page");

const pessoa = (id: string, perfil: string, senha_definida: boolean) =>
  ({ id, nome: id, email: `${id}@x.com`, perfil, sede_id: "dt", sedes_extra: "", ativo: true, criado_em: "", atualizado_em: "", senha_definida, convite_valido: false, convite_expirado: false }) as UsuarioListado;

function linhas(perfil: string) {
  const sessao = { id: "eu", nome: "Eu", email: "eu@x.com", perfil, sede_id: "dt", sedes: ["dt"] } as unknown as SessaoUsuario;
  const html = renderToStaticMarkup(createElement(ProvedorSessao, { sessao, children: createElement(Usuarios) }));
  const texto = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return Object.fromEntries(
    html.split("<tr").slice(1).map((l) => texto(`<tr${l}`)).filter((l) => /@x\.com/u.test(l)).map((l) => [l.trim().split(" ")[0], l]),
  ) as Record<string, string>;
}

beforeEach(() => {
  swr.usuarios = [pessoa("sup", "supervisor", true), pessoa("novo", "coordenador", false), pessoa("entrou", "coordenador", true)];
});

describe("Usuários, visto pelo coordenador", () => {
  it("supervisor: edita e gera código, não exclui", () => {
    const sup = linhas("coordenador").sup;
    expect(sup).toContain("Editar");
    expect(sup).toContain("Novo código");
    expect(sup).not.toContain("Excluir");
  });

  it("coordenador das sedes dele: edita e pede código, não exclui", () => {
    const { novo, entrou } = linhas("coordenador");
    for (const l of [novo, entrou]) {
      expect(l).toContain("Editar");
      expect(l).not.toContain("Excluir");
    }
    expect(novo).toContain("Enviar código");
    expect(entrou).toContain("Enviar código");
    expect(entrou).not.toContain("Novo código"); // o rótulo de quem vê o código na tela
  });

  it("coordenador que também opera sede de fora: só aparece, sem nenhuma ação", () => {
    swr.usuarios = [{ ...pessoa("meio", "coordenador", true), sedes_extra: "fora" }];
    const { meio } = linhas("coordenador");
    expect(meio).not.toContain("Editar");
    expect(meio).not.toContain("Excluir");
    expect(meio).not.toContain("código");
    expect(meio).toContain("só consulta");
    expect(meio).not.toContain("compartilhado");
  });
});

describe("Usuários, visto pelo administrador", () => {
  it("segue com tudo, inclusive sobre coordenador", () => {
    const { entrou } = linhas("administrador");
    expect(entrou).toContain("Editar");
    expect(entrou).toContain("Excluir");
    expect(entrou).toContain("Novo código");
  });
});
