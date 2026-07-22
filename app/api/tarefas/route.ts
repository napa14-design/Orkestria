import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createTarefa, getTarefas } from "@/services/tarefasService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const solicitada = new URL(req.url).searchParams.get("sede") ?? undefined;
    const sedeId = limitarSedeConsulta(sessao, solicitada);
    return ok(await getTarefas(sedeId));
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    // A sede é herdada do local; valida a permissão contra a sede do local.
    const ds = await getDataSource();
    const local = dados.local_id ? await ds.obter("locais", dados.local_id) : null;
    if (local && !podeAlterarSede(sessao, local.sede_id))
      throw new ErroPermissao("Supervisores só cadastram tarefas da própria sede.");
    return ok(await createTarefa(dados, sessao.email), 201);
  });
}
