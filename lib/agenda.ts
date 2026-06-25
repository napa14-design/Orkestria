/**
 * Lógica de exibição da agenda (pura, sem React) — testável isolada.
 */
import type { RotinaPlanejada, StatusRotina } from "@/types";

/**
 * Um "run" é um grupo de rotinas iguais e contíguas (mesma tarefa, fim de uma =
 * início da próxima), renderizado como UM card só. As rotinas-membro seguem
 * individuais por baixo (leitura OMR/realizado intactas).
 */
export type Run = {
  id: string;
  tarefa_id: string;
  local_id: string;
  status: StatusRotina;
  inicio: string;
  fim: string;
  membros: RotinaPlanejada[];
};

/** Agrupa as rotinas de um funcionário em runs (ver {@link Run}). */
export function agruparRuns(rotinas: RotinaPlanejada[]): Run[] {
  const ordenadas = [...rotinas].sort((a, b) =>
    a.inicio_planejado.localeCompare(b.inicio_planejado),
  );
  const runs: Run[] = [];
  for (const r of ordenadas) {
    const ult = runs[runs.length - 1];
    if (ult && ult.tarefa_id === r.tarefa_id && ult.fim === r.inicio_planejado) {
      ult.fim = r.fim_planejado;
      ult.membros.push(r);
    } else {
      runs.push({
        id: r.id,
        tarefa_id: r.tarefa_id,
        local_id: r.local_id,
        status: r.status,
        inicio: r.inicio_planejado,
        fim: r.fim_planejado,
        membros: [r],
      });
    }
  }
  return runs;
}
