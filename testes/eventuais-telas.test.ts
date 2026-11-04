/**
 * A fiação do eventual nas telas. As contas têm teste próprio; aqui é o que faltava à
 * auditoria de 04/11/2026: tirar `ausencias` de uma tela ou deixar de pedir o feriado
 * não quebrava nenhum teste. Monta a página de verdade, com o SWR respondendo por rota,
 * e lê o texto como a pessoa lê.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorSessao } from "@/components/SessaoContexto";
import { PARAMETROS_PADRAO } from "@/lib/calculations";
import type { SessaoUsuario } from "@/lib/permissions";
import type { Ausencia, Feriado, Funcionario, RotinaPlanejada, Sede, ServicoEventual } from "@/types";

const swr = vi.hoisted(() => ({ pedidos: [] as string[], respostas: {} as Record<string, unknown> }));
vi.mock("swr", () => {
  const mutate = async () => {};
  const useSWR = (chave: string | false | null) => {
    if (!chave) return { data: undefined, mutate };
    swr.pedidos.push(chave);
    if (chave.includes("sedes=")) return { data: undefined, mutate };
    if (chave.includes("ultimo-dia")) return { data: null, mutate };
    return { data: swr.respostas[chave.split("?")[0].replace("/api/", "")] ?? [], mutate };
  };
  return { default: useSWR, useSWRConfig: () => ({ mutate }) };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useRouter: () => ({ push() {}, replace() {} }),
}));

const { default: Dashboard } = await import("@/app/(app)/dashboard/page");
const { default: Panorama } = await import("@/app/(app)/panorama/page");
const { default: Rotinas } = await import("@/app/(app)/rotinas/page");

const QUA = "2026-11-04";
const SEG = "2026-11-02";
const TER = "2026-11-03";
const admin = { id: "a", nome: "Admin", email: "a@x.com", perfil: "administrador", sede_id: "", sedes: [] } as unknown as SessaoUsuario;
const sede = { id: "dt", nome_sede: "Dionísio", codigo: "DT", grupo: "RDT", tipo: "colegio", ativo: true } as unknown as Sede;
const ana = { id: "f", nome: "Ana", sede_id: "dt", entrada: "07:00", saida: "16:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", escala: "seg_sex", turno: "manha", ativo: true } as unknown as Funcionario;
const bloco = (data: string, inicio: string, fim: string, min: number) =>
  ({ id: `${data}-${inicio}`, data, funcionario_id: "f", sede_id: "dt", tarefa_id: "t", local_id: "l", inicio_planejado: inicio, fim_planejado: fim, tempo_previsto_min: min, tempo_visual_min: min, blocos_ocupados: 1, status: "planejada" }) as unknown as RotinaPlanejada;
const eventual = (data: string, inicio: string, fim: string, tempo_min: number) =>
  ({ id: `${data}-${inicio}`, sede_id: "dt", funcionario_id: "f", data, inicio, fim, tempo_min, tipo: "eventual", descricao: "Provas" }) as unknown as ServicoEventual;
const ausenteQua = { id: "x", funcionario_id: "f", sede_id: "dt", tipo: "falta", data_inicio: QUA, data_fim: QUA } as unknown as Ausencia;
const feriadoQua = { id: "h", sede_id: "", nome: "Feriado", data_inicio: QUA, data_fim: QUA, ativo: true } as unknown as Feriado;

function tela(pagina: () => React.ReactNode, sessao: SessaoUsuario = admin) {
  const html = renderToStaticMarkup(createElement(ProvedorSessao, { sessao, children: createElement(pagina) }));
  return { html, texto: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${QUA}T12:00:00-03:00`));
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  swr.pedidos.length = 0;
  swr.respostas = { sedes: [sede], funcionarios: [ana], parametros: PARAMETROS_PADRAO };
});

describe("Painel", () => {
  const comDados = (extra: Record<string, unknown> = {}) => {
    swr.respostas = {
      ...swr.respostas,
      rotinas: [bloco(SEG, "07:00", "15:00", 480)],
      // 1 h fora do bloco na segunda, 1 h na terça, 3 h na quarta.
      "servicos-eventuais": [eventual(SEG, "14:00", "16:00", 120), eventual(TER, "09:00", "10:00", 60), eventual(QUA, "09:00", "12:00", 180)],
      ...extra,
    };
  };

  it("o tempo planejado soma o eventual fora das tarefas, e o gráfico por sede dá o mesmo", () => {
    comDados();
    const { texto } = tela(Dashboard);
    expect(texto).toMatch(/Tempo planejado 13h/u);
    expect(texto).toMatch(/Dionísio 13h/u);
  });

  it("em dia ausente, o eventual sai do tempo e do gráfico por sede", () => {
    comDados({ ausencias: [ausenteQua] });
    const { texto } = tela(Dashboard);
    expect(texto).toMatch(/Tempo planejado 10h/u);
    expect(texto).toMatch(/Dionísio 10h/u);
    expect(swr.pedidos.some((p) => p.startsWith("/api/ausencias?de=") && p.includes(`ate=${QUA}`))).toBe(true);
  });

  it("só com eventual, dá para imprimir; o CSV é das tarefas e segue desligado sem elas", () => {
    swr.respostas["servicos-eventuais"] = [eventual(TER, "09:00", "10:00", 60)];
    const { html } = tela(Dashboard);
    expect(html).toMatch(/<button class="btn"[^>]*>🖨/u);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>🖨/u);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>⬇/u);
  });

  it("sem nada no período, não há o que imprimir", () => {
    expect(tela(Dashboard).html).toMatch(/<button[^>]*disabled[^>]*>🖨/u);
  });
});

describe("Panorama", () => {
  it("usa o eventual fora das tarefas e tira o de dia ausente", () => {
    swr.respostas.rotinas = [bloco(SEG, "07:00", "15:00", 480)];
    swr.respostas["servicos-eventuais"] = [eventual(TER, "09:00", "10:00", 60), eventual(QUA, "09:00", "12:00", 180)];
    expect(tela(Panorama).texto).toContain("50%"); // 720 min em 3 jornadas de 8 h
    swr.respostas.ausencias = [ausenteQua];
    expect(tela(Panorama).texto).toContain("56%"); // 540 min em 2 jornadas
    expect(swr.pedidos.some((p) => p.startsWith("/api/ausencias?de="))).toBe(true);
  });
});

describe("Rotina do dia", () => {
  it("o mostrador recebe o eventual e pede o feriado também no modo Dia", () => {
    swr.respostas["servicos-eventuais"] = [eventual(QUA, "09:00", "10:00", 60)];
    const { texto } = tela(Rotinas);
    expect(swr.pedidos).toContain(`/api/servicos-eventuais?de=${QUA}&ate=${QUA}&sede=dt`);
    expect(swr.pedidos).toContain("/api/feriados?sede=dt");
    expect(texto).toContain("Equipe — ocupação Ana 13%"); // 60 de 480
  });

  it("no feriado, só eventual mostra as horas; a lista da equipe não inventa percentual", () => {
    swr.respostas["servicos-eventuais"] = [eventual(QUA, "09:00", "10:00", 60)];
    swr.respostas.feriados = [feriadoQua];
    expect(tela(Rotinas).texto).toContain("Equipe — ocupação Ana 1h");
  });

  it("no dia ausente, o eventual não entra no mostrador", () => {
    swr.respostas.rotinas = [bloco(QUA, "07:00", "08:00", 60)];
    swr.respostas["servicos-eventuais"] = [eventual(QUA, "09:00", "10:00", 60)];
    expect(tela(Rotinas).texto).toContain("Equipe — ocupação Ana 25%");
    swr.respostas.ausencias = [ausenteQua];
    expect(tela(Rotinas).texto).toContain("Equipe — ocupação Ana 13%");
    expect(swr.pedidos).toContain(`/api/ausencias?data=${QUA}&sede=dt`);
  });
});
