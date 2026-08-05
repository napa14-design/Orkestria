import { comSessao, ok } from "@/lib/api";
import { podeGerenciarUsuarios } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { gerarConviteUsuario } from "@/services/usuariosService";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Gera o código de primeiro acesso de um usuário e devolve o texto puro — a
 * **única vez** em que ele existe fora do hash. Serve para dois momentos:
 * liberar quem acabou de ser cadastrado e destravar quem esqueceu a senha.
 *
 * Gerar apaga a senha atual, então a chamada é destrutiva de propósito: quem
 * esqueceu perde a senha antiga e cria outra. Não existe rota para o
 * administrador **definir** a senha de alguém — ele nunca precisa conhecê-la.
 */
export async function POST(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao(
        "Apenas administradores geram código de primeiro acesso.",
      );
    const { id } = await ctx.params;
    return ok(await gerarConviteUsuario(id));
  });
}
