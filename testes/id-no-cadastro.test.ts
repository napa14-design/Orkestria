/**
 * Cadastro com `id` no corpo não sobrescreve registro alheio (revisão de
 * segurança, 14/10/2026).
 *
 * Os `create*` montavam `{ id: novoId(), ...dados }`: o `id` vindo do POST ganhava,
 * e o `criar` substitui o documento inteiro. Um supervisor da sede A mandava o id
 * de alguém da sede B com `sede_id` da A — a rota só confere a sede de DESTINO — e
 * o cadastro da B virava dele. Provado contra o banco de memória: "antes:
 * christus_dt Aurilene | depois: christus_ald SEQUESTRADO".
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { createFuncionario } from "@/services/funcionariosService";
import { createLocal } from "@/services/locaisService";
import { createRotina } from "@/services/rotinasService";
import { somarDias } from "@/lib/dateUtils";

const ALVO = "christus_f1"; // Aurilene, do seed — sede christus_dt

describe("create* ignora o id do corpo", () => {
  beforeEach(() => reiniciarBanco());

  it("funcionário: o cadastro de outra sede fica intacto e o novo ganha id próprio", async () => {
    const ds = await getDataSource();
    const antes = await ds.obter("funcionarios", ALVO);
    const novo = await createFuncionario(
      { id: ALVO, nome: "SEQUESTRADO", sede_id: "christus_ald", turno: "integral", entrada: "07:00", saida: "16:00" } as never,
      "atacante@x.com",
    );
    expect(novo.id).not.toBe(ALVO);
    expect(await ds.obter("funcionarios", ALVO)).toEqual(antes);
  });

  it("rotina: `idFixo` no corpo do POST é ignorado — não sobrescreve bloco alheio", async () => {
    const ds = await getDataSource();
    const alvo = (await ds.listar("rotinas_planejadas"))[0]; // bloco do seed (hoje)
    const { rotina } = await createRotina(
      {
        data: somarDias(alvo.data, 14),
        funcionario_id: "christus_f1",
        tarefa_id: "christus_t1",
        local_id: "christus_l1",
        inicio_planejado: "07:00",
        idFixo: alvo.id,
      } as never,
      "atacante",
    );
    expect(rotina.id).not.toBe(alvo.id);
    expect(await ds.obter("rotinas_planejadas", alvo.id)).toEqual(alvo);
  });

  it("local: mesmo padrão nos outros cadastros", async () => {
    const ds = await getDataSource();
    const alvo = (await ds.listar("locais"))[0];
    const novo = await createLocal({ ...alvo, nome_local: "Sequestrado", sede_id: "christus_ald" } as never, "atacante@x.com");
    expect(novo.id).not.toBe(alvo.id);
    expect((await ds.obter("locais", alvo.id))?.nome_local).toBe(alvo.nome_local);
  });
});
