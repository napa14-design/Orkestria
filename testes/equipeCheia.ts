/**
 * Equipe a 100%, como na vida real: ocupa com uma tarefa CRÍTICA (nunca cedida)
 * todo buraco do expediente das pessoas indicadas, fora os intervalos.
 *
 * Existe desde 26/10/2026, quando a Central passou a procurar alguém livre em
 * QUALQUER horário antes de propor a troca por prioridade: os cenários da troca
 * deixavam as pessoas livres no resto do dia e viravam todos "livre às 10:30".
 * `livres` abre os buracos que um teste quer de propósito.
 */
import { ocupaHorario } from "@/lib/calculations";
import { getDataSource } from "@/lib/datasource";
import { hhmmParaMin, minParaHHMM } from "@/lib/dateUtils";
import { csvDoTrio, listarIntervalos } from "@/lib/intervalos";

export async function ocuparResto(a: {
  sede_id: string;
  data: string;
  funcionarios: string[];
  /** Tarefa crítica da sede, para o enchimento. */
  tarefa_id: string;
  local_id: string;
  livres?: Record<string, [string, string][]>;
}) {
  const ds = await getDataSource();
  for (const fid of a.funcionarios) {
    const f = await ds.obter("funcionarios", fid);
    if (!f) continue;
    const doDia = (await ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: fid }])).filter(
      (r) => r.data === a.data && ocupaHorario(r),
    );
    const faixa = (i: string, fm: string): [number, number] => [hhmmParaMin(i), hhmmParaMin(fm)];
    const tomados = [
      ...doDia.map((r) => faixa(r.inicio_planejado, r.fim_planejado)),
      ...listarIntervalos(csvDoTrio(f)).map((iv) => faixa(iv.inicio, iv.fim)),
      ...(a.livres?.[fid] ?? []).map(([i, fm]) => faixa(i, fm)),
    ].sort((x, y) => x[0] - y[0]);
    const fimDoDia = hhmmParaMin(f.saida);
    const encher = async (ini: number, fim: number) => {
      if (fim <= ini) return;
      await ds.criar("rotinas_planejadas", {
        id: `ocupa-${fid}-${minParaHHMM(ini)}`, data: a.data, funcionario_id: fid, sede_id: a.sede_id, tarefa_id: a.tarefa_id,
        local_id: a.local_id, inicio_planejado: minParaHHMM(ini), fim_planejado: minParaHHMM(fim), tempo_previsto_min: fim - ini,
        tempo_visual_min: fim - ini, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1",
        criado_em: "", atualizado_em: "",
      });
    };
    let cursor = hhmmParaMin(f.entrada);
    for (const [ini, fim] of tomados) {
      await encher(cursor, Math.min(ini, fimDoDia));
      cursor = Math.max(cursor, fim);
    }
    await encher(cursor, fimDoDia);
  }
}
