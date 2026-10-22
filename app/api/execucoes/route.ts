import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { MAX_DIAS_PERIODO, diasDoPeriodo } from "@/lib/dateUtils";
import { leituraCompleta, limitarSedeConsulta, podeAlterarSede, podeRegistrarRealizado } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { getExecucoes, registrarExecucao } from "@/services/execucoesService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sede = limitarSedeConsulta(
      sessao,
      url.searchParams.get("sede") ?? undefined,
    );
    // Período obrigatório e com teto, como em /api/rotinas: sem `de`/`ate` a
    // consulta caía em `listar` — a coleção inteira (revisão de segurança, 22/10/2026).
    const de = url.searchParams.get("de") ?? "";
    const ate = url.searchParams.get("ate") ?? "";
    if (!diasDoPeriodo(de, ate, MAX_DIAS_PERIODO))
      return ok({ erro: `Período inválido: use datas reais, com "de" antes de "até" e no máximo ${MAX_DIAS_PERIODO} dias.` }, 400);
    const lista = await getExecucoes(de, ate, sede);
    // Mínimo necessário (LGPD): justificativa e observação são texto livre — o
    // coordenador pode ter escrito "atestado" ali. O supervisor vê só as dele.
    return ok(
      leituraCompleta(sessao)
        ? lista
        : lista.map((e) => (e.supervisor_id === sessao.id ? e : { ...e, justificativa: "", observacao: "" })),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    // Registrar o realizado é o que o supervisor (perfil de chão) pode fazer.
    if (!podeRegistrarRealizado(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    const ds = await getDataSource();
    const rotina = dados.rotina_id
      ? await ds.obter("rotinas_planejadas", dados.rotina_id)
      : null;
    if (rotina && !podeAlterarSede(sessao, rotina.sede_id))
      throw new ErroPermissao("Só se registra execução das sedes que você opera.");
    return ok(
      await registrarExecucao(
        { ...dados, supervisor_id: sessao.id },
        // Supervisor: feita ou não. Cancelar/remanejar some com a tarefa da medição.
        { perfil: sessao.perfil },
      ),
      201,
    );
  });
}
