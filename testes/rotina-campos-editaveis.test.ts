/**
 * PUT de rotina só muda o que pode mudar (auditoria de segurança, 14/10/2026).
 *
 * O `Pick` de `updateRotina` só existia no TypeScript; o corpo do PUT ia inteiro
 * para o banco. Um supervisor da sede A mandava `{ sede_id: "<sede B>" }` e a
 * rotina passava a contar nos números da sede B — a rota conferia a sede ATUAL
 * da rotina, não a de destino.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import { createRotina, updateRotina } from "@/services/rotinasService";

/** Segunda-feira de uma semana à frente: longe dos blocos que o seed monta hoje. */
function proximaSegunda(): string {
  let d = somarDias(hojeISO(), 7);
  while (new Date(`${d}T12:00:00`).getDay() !== 1) d = somarDias(d, 1);
  return d;
}

async function umaRotina() {
  const { rotina } = await createRotina(
    {
      data: proximaSegunda(),
      funcionario_id: "christus_f1",
      tarefa_id: "christus_t1",
      local_id: "christus_l1",
      inicio_planejado: "07:00",
      supervisor_id: "u1",
    } as never,
    "t@t.com",
  );
  return rotina;
}

describe("updateRotina: lista de campos editáveis", () => {
  beforeEach(() => reiniciarBanco());

  it("recusa trocar a sede, e a rotina continua onde estava", async () => {
    const r = await umaRotina();
    await expect(updateRotina(r.id, { sede_id: "christus_ald" } as never)).rejects.toThrow(/sede_id/);
    const ds = await getDataSource();
    expect((await ds.obter("rotinas_planejadas", r.id))?.sede_id).toBe(r.sede_id);
  });

  it("recusa campos derivados ou de identidade mesmo junto de um campo válido", async () => {
    const r = await umaRotina();
    await expect(
      updateRotina(r.id, { observacao: "x", tarefa_id: "outra", blocos_ocupados: 99 } as never),
    ).rejects.toThrow(/tarefa_id, blocos_ocupados/);
    const ds = await getDataSource();
    expect((await ds.obter("rotinas_planejadas", r.id))?.observacao).not.toBe("x");
  });

  it("recusa valor inválido mesmo em campo permitido", async () => {
    const r = await umaRotina();
    await expect(updateRotina(r.id, { status: "aprovada-pelo-chefe" } as never)).rejects.toThrow(/inválido/);
    await expect(updateRotina(r.id, { inicio_planejado: "abc" })).rejects.toThrow(/inválido/);
    await expect(updateRotina(r.id, { tempo_previsto_min: "trinta" } as never)).rejects.toThrow(/inválido/);
  });

  it("bloco cancelado que volta ao dia confere conflito como se tivesse sido movido", async () => {
    const r = await umaRotina();
    await updateRotina(r.id, { status: "cancelada" });
    // Outro bloco ocupa o mesmo horário enquanto o primeiro está cancelado…
    await createRotina(
      { data: r.data, funcionario_id: r.funcionario_id, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "07:00", supervisor_id: "u1" } as never,
      "t@t.com",
    );
    // …e "descancelar" o primeiro passaria calado por cima dele.
    await expect(updateRotina(r.id, { status: "planejada" })).rejects.toThrow();
  });

  it("o que as telas mandam continua passando", async () => {
    const r = await umaRotina();
    const { rotina } = await updateRotina(r.id, { inicio_planejado: "08:00", tempo_previsto_min: 40, forcar: true });
    expect(rotina.inicio_planejado).toBe("08:00");
    expect(rotina.tempo_previsto_min).toBe(40);
  });
});
