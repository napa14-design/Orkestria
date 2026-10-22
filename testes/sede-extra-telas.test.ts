/**
 * Telas com filtro de sede numa sede EXTRA do coordenador, pelas rotas reais.
 *
 * Produtividade e Painel filtravam a sede no cliente e pediam cadastros (e, na
 * Produtividade, também rotinas e execuções) sem `?sede=`. Para o coordenador,
 * `limitarSedeConsulta` responde isso com a sede PRINCIPAL — então, numa sede
 * de `sedes_extra`, o cruzamento saía vazio, sem erro (achado de 20/10/2026).
 *
 * `consultas` espelha as URLs das páginas: elas não podem exportar nada além
 * do componente, e o defeito está justamente na junção URL da tela × escopo
 * da rota.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import type { ExecucaoRealizada, Funcionario, Local, RotinaPlanejada, Tarefa } from "@/types";
import { funcionario, local, rotina, tarefa } from "./fixtures";

let sessao: SessaoUsuario | null = null;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => {},
}));

const { GET: getFuncionarios } = await import("@/app/api/funcionarios/route");
const { GET: getLocais } = await import("@/app/api/locais/route");
const { GET: getTarefas } = await import("@/app/api/tarefas/route");
const { GET: getRotinas } = await import("@/app/api/rotinas/route");
const { GET: getExecucoes } = await import("@/app/api/execucoes/route");

const COORD: SessaoUsuario = {
  id: "c1", nome: "Coord", email: "coord@x.com", perfil: "coordenador",
  sede_id: "christus_dt", sedes: ["christus_dt", "christus_ald"],
};
const DIA = "2026-10-15";

const ler = async <T>(rota: (req: Request) => Promise<Response>, url: string): Promise<T> =>
  (await rota(new Request(`http://x${url}`))).json();

/** As consultas das telas, na forma que elas as montam (`q` = "sede=…" ou ""). */
async function consultas(q: string) {
  return {
    funcionarios: await ler<Funcionario[]>(getFuncionarios, `/api/funcionarios${q ? `?${q}` : ""}`),
    locais: await ler<Local[]>(getLocais, `/api/locais${q ? `?${q}` : ""}`),
    tarefas: await ler<Tarefa[]>(getTarefas, `/api/tarefas${q ? `?${q}` : ""}`),
    rotinas: await ler<RotinaPlanejada[]>(getRotinas, `/api/rotinas?de=${DIA}&ate=${DIA}${q ? `&${q}` : ""}`),
    execucoes: await ler<ExecucaoRealizada[]>(getExecucoes, `/api/execucoes?de=${DIA}&ate=${DIA}${q ? `&${q}` : ""}`),
  };
}

describe("sede extra do coordenador nas telas com filtro de sede", () => {
  beforeEach(async () => {
    reiniciarBanco();
    sessao = COORD;
    const ds = await getDataSource();
    await ds.criar("funcionarios", funcionario({ id: "f-ald", sede_id: "christus_ald" }));
    await ds.criar("locais", local({ id: "l-ald", sede_id: "christus_ald" }));
    await ds.criar("tarefas", tarefa({ id: "t-ald", sede_id: "christus_ald", local_id: "l-ald" }));
    await ds.criar("rotinas_planejadas", rotina({
      id: "r-ald", data: DIA, funcionario_id: "f-ald", sede_id: "christus_ald", tarefa_id: "t-ald", local_id: "l-ald",
    }));
    await ds.criar("execucoes_realizadas", {
      id: "e-ald", rotina_id: "r-ald", sede_id: "christus_ald", data_execucao: DIA,
      status_realizado: "conforme_planejado", inicio_real: "08:00", fim_real: "08:30", tempo_real_min: 30,
      justificativa: "", epis_confirmados: "", observacao: "", supervisor_id: "c1", criado_em: "", atualizado_em: "",
    });
  });

  it("sem ?sede= (como as telas pediam), nada da sede extra volta", async () => {
    const r = await consultas("");
    expect(r.funcionarios.map((f) => f.id)).not.toContain("f-ald");
    expect(r.locais.map((l) => l.id)).not.toContain("l-ald");
    expect(r.tarefas.map((t) => t.id)).not.toContain("t-ald");
    expect(r.rotinas.map((x) => x.id)).not.toContain("r-ald");
    expect(r.execucoes.map((e) => e.id)).not.toContain("e-ald");
  });

  it("Produtividade: com a sede em todas as consultas, execução → rotina → funcionário/tarefa fecha", async () => {
    const r = await consultas("sede=christus_ald");
    const e = r.execucoes.find((x) => x.id === "e-ald")!;
    const rot = r.rotinas.find((x) => x.id === e.rotina_id)!;
    expect(r.funcionarios.map((f) => f.id)).toEqual(["f-ald"]);
    expect(rot.funcionario_id).toBe("f-ald");
    expect(r.tarefas.find((t) => t.id === rot.tarefa_id)?.id).toBe("t-ald");
  });

  it("Painel: rotinas da sede extra acham o funcionário (ocupação) e o local (nome, intensidade)", async () => {
    const r = await consultas("sede=christus_ald");
    const rot = r.rotinas.find((x) => x.id === "r-ald")!;
    expect(r.funcionarios.find((f) => f.id === rot.funcionario_id)?.id).toBe("f-ald");
    expect(r.locais.find((l) => l.id === rot.local_id)?.id).toBe("l-ald");
  });
});
