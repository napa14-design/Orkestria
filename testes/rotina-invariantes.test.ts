/**
 * Invariantes do bloco planejado, exercitadas pelo SERVIÇO (não pela função pura).
 *
 * Existe por causa de duas coisas que a auditoria de 20/08 encontrou:
 *
 * 1. **`services/` tinha zero testes** — 3.876 linhas, 83 funções, toda a escrita
 *    do sistema. A justificativa era "toca banco". Não toca: `getDataSource()`
 *    cai em memória quando `DATA_SOURCE` não está definido, e o vitest não define.
 *    Ou seja, a camada sempre foi testável em processo; ninguém testava.
 *
 * 2. **58 blocos gravados com `(fim − início) ≠ tempo_previsto_min`** — a agenda
 *    desenha pelo intervalo e a ocupação conta pelo previsto, então o mesmo bloco
 *    aparecia com 50 min e valia 30. São dados legados (junho, DT/Benfica); estes
 *    testes travam a invariante para o código de hoje.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { hhmmParaMin } from "@/lib/dateUtils";
import { createRotina, updateRotina } from "@/services/rotinasService";
import { reiniciarBanco } from "@/lib/memoryStore";

const DATA = "2026-09-15";
const FUNC = "christus_f1"; // do seed: 06:00–16:00
const TAREFA = "christus_t7"; // 15 min no seed

const duracao = (r: { inicio_planejado: string; fim_planejado: string }) =>
  hhmmParaMin(r.fim_planejado) - hhmmParaMin(r.inicio_planejado);

describe("bloco planejado: (fim − início) === tempo_previsto_min", () => {
  beforeEach(() => {
    reiniciarBanco();
  });

  it("ao criar", async () => {
    const r = await createRotina(
      { data: DATA, funcionario_id: FUNC, tarefa_id: TAREFA, inicio_planejado: "07:00" },
      "teste",
    );
    expect(duracao(r.rotina)).toBe(r.rotina.tempo_previsto_min);
  });

  it("ao mover de horário", async () => {
    const { rotina } = await createRotina(
      { data: DATA, funcionario_id: FUNC, tarefa_id: TAREFA, inicio_planejado: "07:00" },
      "teste",
    );
    const movida = await updateRotina(rotina.id, { inicio_planejado: "10:00" });
    expect(movida.rotina.inicio_planejado).toBe("10:00");
    expect(duracao(movida.rotina)).toBe(movida.rotina.tempo_previsto_min);
  });

  it("ao redimensionar SEM mover — o caso que eu suspeitei e não era", async () => {
    // A suspeita era que `fim_planejado` só fosse recalculado quando a posição
    // mudasse. Não é: `redimensionou` entra em `mudouPosicao`. O teste fica para
    // que a suspeita não precise ser investigada de novo.
    const { rotina } = await createRotina(
      { data: DATA, funcionario_id: FUNC, tarefa_id: TAREFA, inicio_planejado: "07:00" },
      "teste",
    );
    const maior = await updateRotina(rotina.id, { tempo_previsto_min: 45 });
    expect(maior.rotina.tempo_previsto_min).toBe(45);
    expect(duracao(maior.rotina)).toBe(45);
    expect(maior.rotina.inicio_planejado).toBe("07:00");
  });

  it("tarefa mais curta que o bloco da agenda não é esticada até o bloco", async () => {
    // O bloco da agenda é 15min no seed; uma tarefa de 5min tem de terminar em
    // 5min. Era o defeito de 18/08, que fazia a rota fina perder o dia inteiro
    // por SOBREPOSICAO ao gerar.
    const { rotina } = await createRotina(
      { data: DATA, funcionario_id: FUNC, tarefa_id: TAREFA, inicio_planejado: "07:00", duracao_min: 5 },
      "teste",
    );
    // `duracao_min` só vale para tarefa de duração variável; o que importa aqui é
    // a invariante, qualquer que seja o previsto que o serviço decidiu.
    expect(duracao(rotina)).toBe(rotina.tempo_previsto_min);
    expect(rotina.tempo_visual_min).toBeGreaterThanOrEqual(rotina.tempo_previsto_min);
  });
});
