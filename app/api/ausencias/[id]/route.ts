import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { deleteAusencia, updateAusencia } from "@/services/ausenciasService";
import { desfazerRemanejosSemFalta, remanejarCriticasDaAusencia } from "@/services/centralDiaService";

type Ctx = { params: Promise<{ id: string }> };

async function exigirAcesso(check: (sedeId: string) => boolean, id: string) {
  const ds = await getDataSource();
  const atual = await ds.obter("ausencias", id);
  if (!atual) throw new Error("Ausência não encontrada.");
  if (!check(atual.sede_id))
    throw new ErroPermissao("Coordenadores só alteram ausências das sedes que operam.");
  return atual;
}

/**
 * Nos dias que deixaram de ter falta, o remanejo automático das críticas da pessoa
 * volta sozinho (10/11/2026). Uma falha aqui não desfaz o que a pessoa salvou.
 */
async function desfazerOQueSobrou(antes: { funcionario_id: string; data_inicio: string; data_fim: string }) {
  try {
    await desfazerRemanejosSemFalta(antes.funcionario_id, antes.data_inicio, antes.data_fim);
  } catch (e) {
    console.error("Remanejo automático: falha ao desfazer depois da ausência", e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    const antes = await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    const mudancas = await req.json();
    if (mudancas.funcionario_id) {
      const ds = await getDataSource();
      const destino = await ds.obter("funcionarios", mudancas.funcionario_id);
      if (destino && !podeAlterarSede(sessao, destino.sede_id))
        throw new ErroPermissao("Coordenadores não podem mover ausências para outra sede.");
    }
    const ausencia = await updateAusencia(id, mudancas, sessao.email);
    // Encurtou ou trocou de pessoa: os dias que saíram voltam ao dono.
    await desfazerOQueSobrou(antes);
    const remanejos = await remanejarCriticasDaAusencia(ausencia, sessao);
    return ok({ ...ausencia, remanejos });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    const antes = await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    await deleteAusencia(id);
    await desfazerOQueSobrou(antes);
    return ok({ ok: true });
  });
}
