import { getDataSource } from "@/lib/datasource";
import { hojeISO } from "@/lib/dateUtils";
import { podeAlterarSede, type SessaoUsuario } from "@/lib/permissions";
import { coletaAtiva } from "@/lib/usoTelas";

/**
 * Anota que a tela foi aberta hoje naquela sede, se a coleta valer para este caso.
 * Fora disso não grava nada e não reclama: quem chamou não tem o que fazer com a
 * resposta. Só coordenador e supervisor interessam, e a sede tem de ser dele e
 * existir de verdade — cair na sede principal gravaria um dado falso.
 */
export async function registrarUso(sessao: SessaoUsuario, tela: string, sedeId: unknown): Promise<void> {
  const dia = hojeISO();
  if (!coletaAtiva(dia)) return;
  if (sessao.perfil !== "coordenador" && sessao.perfil !== "supervisor") return;
  // O supervisor não tem Central: abri-la só o redireciona.
  if (sessao.perfil === "supervisor" && tela === "central") return;
  // A barra criaria uma subcoleção no Firestore, e `__x__` é nome reservado lá.
  if (typeof sedeId !== "string" || !/^(?!__.*__$)[\w-]{1,64}$/u.test(sedeId) || !podeAlterarSede(sessao, sedeId)) return;
  const ds = await getDataSource();
  const id = `${dia}__${sessao.perfil}__${sedeId}__${tela}`;
  // Ler antes porque gravar de novo seria uma escrita paga a cada abertura.
  if (await ds.obter("uso_telas", id)) return;
  if (!(await ds.obter("sedes", sedeId))) return;
  await ds.criar("uso_telas", { id, dia, perfil: sessao.perfil, sede_id: sedeId, tela });
}
