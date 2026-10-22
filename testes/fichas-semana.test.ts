/**
 * Fichas da semana num PDF só (pedido do dono, 22/10/2026: imprimir a semana
 * de uma vez, em vez de dia por dia). Ordem por DIA — o maço de cada manhã —,
 * sem folha para dia vazio nem para quem está ausente naquele dia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { montarEntradas } from "@/services/fichaPdf";
import type { RotinaPlanejada } from "@/types";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({ obterSessao: async () => sessao }));
const { GET } = await import("@/app/api/fichas/pdf/route");

const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: "christus_dt", sedes: ["christus_dt"] };
const SEG = "2099-01-05";
const TER = "2099-01-06";
const QUA = "2099-01-07";

async function bloco(data: string, funcionario_id: string, inicio = "08:00", fim = "08:20") {
  const ds = await getDataSource();
  await ds.criar("rotinas_planejadas", {
    id: `r-${data}-${funcionario_id}-${inicio}`, data, funcionario_id, sede_id: "christus_dt", tarefa_id: "christus_t2",
    local_id: "christus_l1", inicio_planejado: inicio, fim_planejado: fim, tempo_previsto_min: 20, tempo_visual_min: 30,
    blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "",
  } as RotinaPlanejada);
}
/** Data e funcionário de cada folha, lidos do QR (ORK3|sede|data|func|…). */
const folhas = (entradas: Awaited<ReturnType<typeof montarEntradas>>) =>
  entradas.map((e) => {
    const [, , data, func] = e.qr.split("|");
    return `${data} ${func}`;
  });
const pedir = (q: string) => GET(new Request(`http://x/api/fichas/pdf?${q}`));

describe("fichas da semana", () => {
  beforeEach(() => {
    reiniciarBanco();
    sessao = COORD;
  });

  it("sai por dia, na ordem dos dias, e dia vazio não gera folha", async () => {
    await bloco(QUA, "christus_f1");
    await bloco(SEG, "christus_f2");
    await bloco(SEG, "christus_f1");
    // TER fica vazio
    const f = folhas(await montarEntradas("christus_dt", [SEG, TER, QUA]));
    expect(f.map((x) => x.split(" ")[0])).toEqual([SEG, SEG, QUA]);
    expect(f).toContain(`${SEG} christus_f1`);
    expect(f).toContain(`${SEG} christus_f2`);
  });

  it("quem está ausente num dia não ganha a folha DAQUELE dia, mas ganha a dos outros", async () => {
    const ds = await getDataSource();
    await bloco(SEG, "christus_f1");
    await bloco(TER, "christus_f1");
    await ds.criar("ausencias", {
      id: "a1", funcionario_id: "christus_f1", sede_id: "christus_dt", tipo: "falta", data_inicio: TER, data_fim: TER,
      observacao: "", criado_por: "t", criado_em: "", atualizado_por: "t", atualizado_em: "",
    } as never);
    expect(folhas(await montarEntradas("christus_dt", [SEG, TER]))).toEqual([`${SEG} christus_f1`]);
  });

  it("não mistura sede: bloco de outra sede no período fica de fora", async () => {
    const ds = await getDataSource();
    await bloco(SEG, "christus_f1");
    await ds.criar("rotinas_planejadas", {
      id: "r-outra", data: SEG, funcionario_id: "christus_f1", sede_id: "christus_ald", tarefa_id: "christus_t2",
      local_id: "christus_l1", inicio_planejado: "09:00", fim_planejado: "09:20", tempo_previsto_min: 20, tempo_visual_min: 30,
      blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: "", atualizado_em: "",
    } as RotinaPlanejada);
    const [unica] = await montarEntradas("christus_dt", [SEG]);
    expect(unica.tarefas).toHaveLength(1);
  });

  it("rota: de/até devolve um PDF; o dia sozinho continua funcionando", async () => {
    await bloco(SEG, "christus_f1");
    await bloco(TER, "christus_f1");
    const semana = await pedir(`de=${SEG}&ate=${QUA}&sede=christus_dt`);
    expect(semana.status).toBe(200);
    expect(semana.headers.get("Content-Type")).toBe("application/pdf");
    expect(semana.headers.get("Content-Disposition")).toContain(`fichas-${SEG}_a_${QUA}.pdf`);
    const dia = await pedir(`data=${SEG}&sede=christus_dt`);
    expect(dia.status).toBe(200);
    expect(dia.headers.get("Content-Disposition")).toContain(`fichas-${SEG}.pdf`);
  });

  it("rota recusa período de mais de 7 dias, invertido ou com data torta", async () => {
    for (const q of [
      `de=2099-01-05&ate=2099-01-12&sede=christus_dt`, // 8 dias
      `de=${QUA}&ate=${SEG}&sede=christus_dt`,
      `de=amanha&ate=${SEG}&sede=christus_dt`,
      `data=2099-01-05"&sede=christus_dt`,
      `de=${SEG}&ate=${QUA}`,
      // a virada do ano 9999 ordenava "10000-01-01" antes e lia o histórico inteiro
      `de=9999-12-28&ate=9999-12-31&sede=christus_dt`,
      `data=2099-02-30&sede=christus_dt`,
      `data=2099-13-01&sede=christus_dt`,
    ])
      expect((await pedir(q)).status, q).toBe(400);
    expect((await pedir(`de=2099-01-05&ate=2099-01-11&sede=christus_dt`)).status).toBe(200); // 7 dias
  });

  it("supervisor não imprime ficha, nem da semana", async () => {
    sessao = { ...COORD, perfil: "supervisor" };
    expect((await pedir(`de=${SEG}&ate=${QUA}&sede=christus_dt`)).status).toBe(403);
  });
});
