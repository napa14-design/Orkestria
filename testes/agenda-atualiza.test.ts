/**
 * A Agenda de quem deixou a aba aberta não via o dia que um colega gerou depois (relato de
 * 09/11/2026). Os blocos e o realizado voltam a ser buscados ao retomar a aba, no máximo uma
 * vez por minuto; o resto da tela segue sem isso, para não multiplicar leituras.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProvedorSessao } from "@/components/SessaoContexto";
import type { SessaoUsuario } from "@/lib/permissions";

const pedidos = vi.hoisted(() => [] as { chave: string; opcoes?: Record<string, unknown> }[]);
vi.mock("swr", () => {
  const mutate = async () => {};
  const useSWR = (chave: string | null, _f: unknown, opcoes?: Record<string, unknown>) => {
    if (chave) pedidos.push({ chave, opcoes });
    if (chave === "/api/sedes") return { data: [{ id: "dt", nome_sede: "DT", ativo: true }], mutate };
    return { data: undefined, mutate };
  };
  return { default: useSWR, useSWRConfig: () => ({ mutate }) };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/rotinas",
  useRouter: () => ({ push() {}, replace() {} }),
}));

const { default: Rotinas } = await import("@/app/(app)/rotinas/page");
const sessao = { id: "c", nome: "C", email: "c@x.com", perfil: "coordenador", sede_id: "dt", sedes: ["dt"] } as unknown as SessaoUsuario;

describe("Agenda: o que se atualiza ao voltar para a aba", () => {
  it("os blocos do dia e o realizado se atualizam, no máximo uma vez por minuto", () => {
    pedidos.length = 0;
    renderToStaticMarkup(createElement(ProvedorSessao, { sessao, children: createElement(Rotinas) }));
    const com = (prefixo: string) => pedidos.filter((p) => p.chave.startsWith(prefixo));
    for (const p of [...com("/api/rotinas?data="), ...com("/api/execucoes?de=")])
      expect(p.opcoes, p.chave).toMatchObject({ revalidateOnFocus: true, focusThrottleInterval: 60_000 });
    expect(com("/api/rotinas?data=")).toHaveLength(1);
    expect(com("/api/execucoes?de=")).toHaveLength(1);
  });

  it("cadastros e o resto da tela não se atualizam a cada volta: seria leitura sem motivo", () => {
    pedidos.length = 0;
    renderToStaticMarkup(createElement(ProvedorSessao, { sessao, children: createElement(Rotinas) }));
    const outros = pedidos.filter((p) => !p.chave.startsWith("/api/rotinas?") && !p.chave.startsWith("/api/execucoes?"));
    expect(outros.length).toBeGreaterThan(5);
    expect(outros.filter((p) => p.opcoes?.revalidateOnFocus)).toEqual([]);
  });
});
