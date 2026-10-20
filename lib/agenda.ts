/**
 * Lógica de exibição da agenda (pura, sem React) — testável isolada.
 */
import type { Local, RotinaPlanejada, StatusRotina, Tarefa } from "@/types";
import { hhmmParaMin } from "./dateUtils";

/**
 * Locais que o "+ Nova tarefa" da Rotina oferece: só os ATIVOS da sede da
 * agenda — logo após trocar de sede, a lista anterior ainda está em cache e a
 * tarefa herdaria a sede do local errado (auditoria, 20/10/2026) — mais o local
 * que acabou de nascer no próprio formulário, que a lista do pai ainda não tem.
 * Sem ele, uma falha na tarefa deixava o select em "Escolha…" e a pessoa criava
 * o local de novo.
 */
export function locaisDoFormulario(locais: Local[], sedeId: string, criadoAgora?: Local | null): Local[] {
  const daSede = locais.filter((l) => l.ativo && l.sede_id === sedeId);
  if (criadoAgora && criadoAgora.sede_id === sedeId && !daSede.some((l) => l.id === criadoAgora.id))
    daSede.push(criadoAgora);
  return daSede.sort((a, b) => a.nome_local.localeCompare(b.nome_local, "pt-BR"));
}

/**
 * O que a lista do supervisor mostra no Acompanhamento. O filtro de pessoa só
 * vale se ela tem blocos NESTE dia/sede: trocar a data com alguém de folga
 * filtrado deixava a lista vazia dizendo "Tudo marcado" com centenas de blocos
 * sem marcação (auditoria, 20/10/2026). Devolve também o filtro que de fato vale,
 * para o seletor mostrar a verdade.
 */
export function listaDoSupervisor<R extends { id: string; funcionario_id: string }>(
  linhas: R[],
  filtro: string,
  soFaltam: boolean,
  jaMarcada: (r: R) => boolean,
): { filtroEfetivo: string; visiveis: R[] } {
  const filtroEfetivo = linhas.some((r) => r.funcionario_id === filtro) ? filtro : "";
  const visiveis = linhas.filter(
    (r) => (!filtroEfetivo || r.funcionario_id === filtroEfetivo) && (!soFaltam || !jaMarcada(r)),
  );
  return { filtroEfetivo, visiveis };
}

/**
 * A busca da paleta casa com alguma tarefa — ativa ou não, com ou sem filtro?
 * O "+ Criar 'busca'" só aparece quando NÃO casa: um filtro de prioridade ou
 * andar esconder a tarefa não é motivo para criar outra igual.
 */
export function buscaCasaAlgumaTarefa(tarefas: Tarefa[], locais: Map<string, Local> | ReadonlyMap<string, Local>, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  return tarefas.some((t) => `${t.nome_tarefa} ${locais.get(t.local_id)?.nome_local ?? ""}`.toLowerCase().includes(q));
}

/**
 * Uma rotina só cobra confirmação depois do fim planejado. Dias passados
 * cobram tudo; dias futuros não cobram nada. A execução existente é filtrada
 * por quem chama, mantendo esta regra pura e reutilizável.
 */
export function rotinaAguardaConfirmacao(
  rotina: RotinaPlanejada,
  hoje: string,
  agoraMin: number,
): boolean {
  if (rotina.status === "cancelada") return false;
  if (rotina.data < hoje) return true;
  if (rotina.data > hoje) return false;
  return hhmmParaMin(rotina.fim_planejado) <= agoraMin;
}

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
