/**
 * Cadastro de usuário e os perfis de 19/10/2026: "coordenador" (o antigo
 * supervisor) e "supervisor" (perfil de chão, só nas sedes dele).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { reiniciarBanco } from "@/lib/memoryStore";
import { createUsuario, updateUsuario } from "@/services/usuariosService";

const dados = (extra: Record<string, unknown> = {}) =>
  ({ nome: "Fulana", email: `f${Math.random()}@x.com`, perfil: "supervisor", sede_id: "christus_dt", ativo: true, ...extra }) as never;

describe("perfis no cadastro de usuário", () => {
  beforeEach(() => reiniciarBanco());

  it("supervisor precisa de sede de verdade — 'todas as sedes' é recusado", async () => {
    await expect(createUsuario(dados({ sede_id: "geral" }))).rejects.toThrow(/sede principal/);
    const u = await createUsuario(dados());
    await expect(updateUsuario(u.id, { sede_id: "geral" } as never)).rejects.toThrow(/sede principal/);
  });

  it("perfil inexistente é recusado (o corpo chega cru do formulário)", async () => {
    await expect(createUsuario(dados({ perfil: "dono-de-tudo" }))).rejects.toThrow(/Perfil inválido/);
  });

  it("coordenador e supervisor guardam as sedes adicionais; gerência não", async () => {
    const coord = await createUsuario(dados({ perfil: "coordenador", sedes_extra: "christus_ald" }));
    const sup = await createUsuario(dados({ perfil: "supervisor", sedes_extra: "christus_ald" }));
    const ger = await createUsuario(dados({ perfil: "visualizador", sede_id: "geral", sedes_extra: "christus_ald" }));
    expect(coord.sedes_extra).toBe("christus_ald");
    expect(sup.sedes_extra).toBe("christus_ald");
    expect(ger.sedes_extra).toBe("");
  });
});
