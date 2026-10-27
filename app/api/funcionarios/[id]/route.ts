import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { hojeISO } from "@/lib/dateUtils";
import { assumirPostoNaEdicao, deleteFuncionario, updateFuncionario } from "@/services/funcionariosService";

type Ctx = { params: Promise<{ id: string }> };

async function exigirAcesso(sessaoSedeCheck: (sedeId: string) => boolean, id: string) {
  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  if (!sessaoSedeCheck(atual.sede_id))
    throw new ErroPermissao("Coordenadores só alteram funcionários das sedes que operam.");
}

export async function PUT(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    // `substitui`/`substitui_desde` não são colunas (ver o POST): o formulário os
    // manda também na edição, e iam para o cadastro como campo morto. O `id` do
    // corpo também sai — quem manda é o da URL.
    const { substitui, substitui_desde, id: _doCorpo, ...mudancas } = await req.json();
    if (mudancas.sede_id && !podeAlterarSede(sessao, mudancas.sede_id))
      throw new ErroPermissao("Coordenadores não podem mover funcionários para outra sede.");
    const atualizado = await updateFuncionario(id, mudancas, sessao.email);
    if (!substitui) return ok(atualizado);
    // "Assume o posto de" depois do cadastro (27/10/2026): a pessoa foi
    // cadastrada antes de se saber de quem é o posto. Se ela já tem rota, a rota
    // é trocada pela do posto — ver `assumirPostoNaEdicao`.
    const substituicao = await assumirPostoNaEdicao(id, String(substitui), String(substitui_desde || hojeISO()), sessao.email);
    return ok({ ...atualizado, substituicao });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const { id } = await ctx.params;
    await exigirAcesso((s) => podeAlterarSede(sessao, s), id);
    await deleteFuncionario(id);
    return ok({ ok: true });
  });
}
