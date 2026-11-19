/**
 * "Repetir o dia" grava a cópia com id fixo (`m_<data>_<pessoa>_<tarefa>_<início>`).
 * Auditoria de 19/11/2026: a checagem de "já existe no destino" ignorava o bloco
 * cancelado, e a gravação era um `set`. Repetir de novo depois de cancelar um bloco no
 * destino devolvia a rotina a "planejada" com a execução ainda "cancelada": o
 * cancelamento se perdia e o bloco voltava a contar na ocupação. O mesmo `set` levava
 * de volta ao horário antigo o bloco copiado que alguém tinha movido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { registrarExecucao } from "@/services/execucoesService";
import { duplicarDia } from "@/services/rotinasService";
import type { RotinaPlanejada } from "@/types";

const SEDE = "christus_dt";
const ORIGEM = "2026-08-18";
const DESTINO = "2026-08-19";
const aud = { criado_em: "2026-01-01T00:00:00.000Z", atualizado_em: "2026-01-01T00:00:00.000Z" };

async function copiaNoDestino(): Promise<RotinaPlanejada> {
  const ds = await getDataSource();
  const copias = await ds.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: DESTINO }]);
  expect(copias).toHaveLength(1);
  expect(copias[0].id.startsWith("m_")).toBe(true);
  return copias[0];
}

describe("Repetir o dia não grava por cima do que já está no destino", () => {
  beforeEach(async () => {
    reiniciarBanco();
    const ds = await getDataSource();
    for (const r of await ds.listar("rotinas_planejadas")) await ds.excluir("rotinas_planejadas", r.id);
    await ds.criar("tarefas", {
      id: "t-sem", nome_tarefa: "Sem EPI", tipo_tarefa: "Rota", local_id: "christus_l1", sede_id: SEDE,
      regra_calculo: "fixo", tempo_base_min: 10, quantidade: 1, frequencia: "diaria",
      prioridade: "media", requisitos: "", ativo: true, observacoes: "",
      criado_por: "t", atualizado_por: "t", ...aud,
    } as never);
    await ds.criar("rotinas_planejadas", {
      id: "o1", data: ORIGEM, funcionario_id: "christus_f1", sede_id: SEDE, tarefa_id: "t-sem", local_id: "christus_l1",
      inicio_planejado: "07:00", fim_planejado: "07:10", tempo_previsto_min: 10, tempo_visual_min: 15, blocos_ocupados: 1,
      status: "planejada", observacao: "", supervisor_id: "sup", ...aud,
    } as RotinaPlanejada);
    await duplicarDia(ORIGEM, [DESTINO], SEDE, "c1");
  });

  it("o bloco cancelado no destino continua cancelado ao repetir de novo", async () => {
    const ds = await getDataSource();
    const copia = await copiaNoDestino();
    await registrarExecucao(
      {
        rotina_id: copia.id, data_execucao: DESTINO, status_realizado: "cancelada", inicio_real: "", fim_real: "",
        tempo_real_min: 0, justificativa: "evento", observacao: "", supervisor_id: "c1", epis_confirmados: "",
      },
      { perfil: "coordenador" },
    );
    expect((await ds.obter("rotinas_planejadas", copia.id))?.status).toBe("cancelada");

    const res = await duplicarDia(ORIGEM, [DESTINO], SEDE, "c1");

    expect(res).toMatchObject({ copiadas: 0, puladas: 1 });
    expect((await ds.obter("rotinas_planejadas", copia.id))?.status).toBe("cancelada");
    const exec = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: copia.id }]);
    expect(exec.map((e) => e.status_realizado)).toEqual(["cancelada"]);
    await copiaNoDestino(); // e não nasceu outro bloco ao lado
  });

  it("o bloco copiado e movido no destino fica no horário novo", async () => {
    const ds = await getDataSource();
    const copia = await copiaNoDestino();
    await ds.atualizar("rotinas_planejadas", copia.id, { inicio_planejado: "09:00", fim_planejado: "09:10" });

    const res = await duplicarDia(ORIGEM, [DESTINO], SEDE, "c1");

    expect(res).toMatchObject({ copiadas: 0, puladas: 1 });
    expect(await ds.obter("rotinas_planejadas", copia.id)).toMatchObject({ inicio_planejado: "09:00", fim_planejado: "09:10" });
    await copiaNoDestino();
  });

  it("se o bloco aparece no destino entre a leitura e a gravação, recusa em vez de gravar por cima", async () => {
    const ds = await getDataSource();
    const copia = await copiaNoDestino();
    await ds.atualizar("rotinas_planejadas", copia.id, { status: "cancelada" });
    // Outra aba repetiu e alguém cancelou enquanto esta lia: simula escondendo o destino da leitura.
    const consultarOriginal = ds.consultar.bind(ds);
    const espiaLeitura = vi.spyOn(ds, "consultar").mockImplementation((async (tabela: string, cond: never, opc: never) => {
      const r = await consultarOriginal(tabela as never, cond, opc);
      return tabela === "rotinas_planejadas" ? r.filter((x) => (x as { data?: string }).data !== DESTINO) : r;
    }) as never);
    try {
      await expect(duplicarDia(ORIGEM, [DESTINO], SEDE, "c1")).rejects.toThrow(/atualize a tela/i);
    } finally {
      espiaLeitura.mockRestore();
    }
    expect((await ds.obter("rotinas_planejadas", copia.id))?.status).toBe("cancelada");
  });
});
