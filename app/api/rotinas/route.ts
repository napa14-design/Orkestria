import { comSessao, ok } from "@/lib/api";
import { limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  createRotina,
  getRotinasByData,
  getRotinasPeriodo,
} from "@/services/rotinasService";
import { getDataSource } from "@/lib/datasource";

/**
 * GET /api/rotinas?data=YYYY-MM-DD[&sede=X]      → rotinas de um dia
 * GET /api/rotinas?de=...&ate=...[&sede=X]       → rotinas de um período
 */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sede = limitarSedeConsulta(
      sessao,
      url.searchParams.get("sede") ?? undefined,
    );
    const data = url.searchParams.get("data");
    if (data) return ok(await getRotinasByData(data, sede));
    const de = url.searchParams.get("de");
    const ate = url.searchParams.get("ate");
    if (de && ate) return ok(await getRotinasPeriodo(de, ate, sede));
    return ok({ erro: "Informe ?data= ou ?de=&ate=." }, 400);
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    // A sede da rotina vem da tarefa; valida permissão contra ela.
    const ds = await getDataSource();
    const tarefa = await ds.obter("tarefas", dados.tarefa_id);
    if (tarefa && !podeAlterarSede(sessao, tarefa.sede_id))
      throw new ErroPermissao("Supervisores só montam rotinas da própria sede.");
    return ok(await createRotina(dados, sessao.id), 201);
  });
}
