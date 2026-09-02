/**
 * Gerar a semana a partir da rota padrão — uma rota por dia da semana.
 *
 * Pergunta do dono em 02/09/2026: *"se eu gravar uma rota para cada dia da
 * semana, tem como gerar a semana de uma vez igual o dia?"*. A resolução por
 * dia da semana já existia (`projetarDiaDaRota` olha a data); o que faltava era
 * fazer isso em várias datas de uma vez.
 *
 * O que estes testes protegem é justamente a diferença que motivou tudo:
 * **gerar o período NÃO é aplicar um modelo no período**. Aplicar joga a MESMA
 * rota em todos os dias; gerar resolve cada data pela camada que vale nela. Se
 * alguém "simplificar" isto para uma chamada de `aplicarModelo`, a segunda-feira
 * aparece na terça e ninguém percebe até o supervisor abrir o dia.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { reiniciarBanco } from "@/lib/memoryStore";
import { getDataSource } from "@/lib/datasource";
import { gerarPeriodoDaRotaPadrao, salvarModelo } from "@/services/modelosService";
import { createRotina, getRotinasByData } from "@/services/rotinasService";

const SEDE = "christus_dt";
// Aurilene (o funcionário do seed) trabalha 06:00–16:00 e tem intervalos às
// 09:00, 11:30–13:00 e 15:00 — os horários abaixo caem fora deles de propósito,
// senão o teste falha por conflito com o intervalo e não pela regra em exame.
// 2026-08-10 é SEGUNDA; a semana vai até domingo 2026-08-16.
const SEGUNDA = "2026-08-10";
const TERCA = "2026-08-11";
const QUARTA = "2026-08-12";
const SEMANA = [SEGUNDA, TERCA, QUARTA];

/** Monta um dia com uma tarefa e o salva como camada da rota padrão. */
async function ensinar(nome: string, data: string, hora: string, diasSemana: string) {
  await createRotina(
    {
      data,
      funcionario_id: "christus_f1",
      tarefa_id: "christus_t1",
      local_id: "christus_l1",
      inicio_planejado: hora,
      supervisor_id: "u1",
    } as never,
    "t@t.com",
  );
  await salvarModelo(nome, data, SEDE, "t@t.com", {
    padrao: true,
    comDuracao: true,
    diasSemana,
    substitui: false,
  });
  // O dia de origem some para não confundir a contagem do que foi GERADO.
  const ds = await getDataSource();
  for (const r of await getRotinasByData(data, SEDE)) {
    await ds.excluir("rotinas_planejadas", r.id);
  }
}

const horasDe = async (data: string) =>
  (await getRotinasByData(data, SEDE)).map((r) => r.inicio_planejado).sort();

describe("gerarPeriodoDaRotaPadrao", () => {
  beforeEach(() => reiniciarBanco());

  it("cada dia recebe a rota do SEU dia da semana, não a mesma para todos", async () => {
    // Uma camada só de segunda (07:00) e outra só de terça (09:00).
    await ensinar("Rota de segunda", "2026-08-03", "07:00", "1");
    await ensinar("Rota de terça", "2026-08-04", "10:00", "2");

    const r = await gerarPeriodoDaRotaPadrao(SEDE, SEMANA, "t@t.com");

    expect(await horasDe(SEGUNDA)).toEqual(["07:00"]);
    expect(await horasDe(TERCA)).toEqual(["10:00"]);
    // Quarta não tem camada: nada é gerado, e isso não é erro.
    expect(await horasDe(QUARTA)).toEqual([]);
    expect(r.geradas).toBe(2);
    expect(r.diasGerados).toBe(2);
  });

  it("a camada sem dia declarado entra em todos os dias", async () => {
    await ensinar("Rota de todo dia", "2026-08-03", "06:00", "");
    await gerarPeriodoDaRotaPadrao(SEDE, SEMANA, "t@t.com");
    for (const d of SEMANA) expect(await horasDe(d)).toEqual(["06:00"]);
  });

  it("soma a camada de todo dia com a do dia específico", async () => {
    await ensinar("Rota de todo dia", "2026-08-03", "06:00", "");
    await ensinar("Extra de segunda", "2026-08-03", "14:00", "1");
    await gerarPeriodoDaRotaPadrao(SEDE, SEMANA, "t@t.com");
    expect(await horasDe(SEGUNDA)).toEqual(["06:00", "14:00"]);
    expect(await horasDe(TERCA)).toEqual(["06:00"]);
  });

  it("rodar duas vezes não duplica nada (idempotente)", async () => {
    await ensinar("Rota de todo dia", "2026-08-03", "06:00", "");
    const primeira = await gerarPeriodoDaRotaPadrao(SEDE, SEMANA, "t@t.com");
    const segunda = await gerarPeriodoDaRotaPadrao(SEDE, SEMANA, "t@t.com");
    expect(primeira.geradas).toBe(3);
    expect(segunda.geradas).toBe(0);
    expect(segunda.puladas).toBeGreaterThan(0);
    for (const d of SEMANA) expect(await horasDe(d)).toEqual(["06:00"]);
  });

  it("sede sem rota padrão responde UMA vez, em vez de repetir por dia", async () => {
    const r = await gerarPeriodoDaRotaPadrao(SEDE, SEMANA, "t@t.com");
    expect(r.semRota).toBe(true);
    expect(r.geradas).toBe(0);
  });

  it("o relatório carrega a data em cada detalhe — sem ela, 7 dias viram ruído", async () => {
    await ensinar("Rota de todo dia", "2026-08-03", "06:00", "");
    const r = await gerarPeriodoDaRotaPadrao(SEDE, SEMANA, "t@t.com");
    for (const d of r.detalhes) expect(d).toMatch(/^\d{2}\/\d{2}: /u);
  });
});
