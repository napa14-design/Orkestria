/**
 * "Inativar em vez de excluir" (23/11/2026): a tela manda inativar local e tarefa com histórico,
 * e a geração não olhava `ativo` — a tarefa inativa seguia nascendo no dia. Pelo "Gerar o dia"
 * de verdade, com a rota padrão salva a partir do dia do seed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import { gerarDiaDaRotaPadrao, salvarModelo } from "@/services/modelosService";

const SEDE = "christus_dt";

describe("Gerar o dia não cria bloco de tarefa ou local inativo", () => {
  let alvo = "";
  beforeEach(async () => {
    reiniciarBanco();
    await salvarModelo("Rota padrão", hojeISO(), SEDE, "c@x.com", { padrao: true, comDuracao: true });
    alvo = somarDias(hojeISO(), 7); // mesmo dia da semana: a rota vale
  });

  const doDia = async () => (await getDataSource()).consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: alvo }]);

  it("tarefa inativa fica de fora, e o resumo diz por quê", async () => {
    const ds = await getDataSource();
    const umaTarefa = (await ds.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: hojeISO() }]))[0].tarefa_id;
    await ds.atualizar("tarefas", umaTarefa, { ativo: false });
    const res = await gerarDiaDaRotaPadrao(SEDE, alvo, "c1");
    expect((await doDia()).some((r) => r.tarefa_id === umaTarefa)).toBe(false);
    expect((await doDia()).length).toBeGreaterThan(0);
    expect(res.detalhes.join(" ")).toMatch(/inativo — fora da geração/);
  });

  it("local inativo: nenhuma tarefa dele nasce", async () => {
    const ds = await getDataSource();
    const umLocal = (await ds.consultar("rotinas_planejadas", [{ campo: "data", op: "==", valor: hojeISO() }]))[0].local_id;
    await ds.atualizar("locais", umLocal, { ativo: false });
    await gerarDiaDaRotaPadrao(SEDE, alvo, "c1");
    expect((await doDia()).some((r) => r.local_id === umLocal)).toBe(false);
  });
});
