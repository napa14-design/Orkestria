import { comSessao, ok } from "@/lib/api";
import { podeGerenciarUsuarios } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { resetarSenhaUsuario } from "@/services/usuariosService";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Admin reseta a senha de um usuário: ela é apagada e a pessoa volta ao
 * primeiro acesso, escolhendo a nova senha ela mesma.
 *
 * Não existe rota para o administrador **definir** a senha de alguém: isso o
 * obrigaria a conhecer e transmitir a senha da pessoa, e o resultado que
 * importa (recuperar o acesso) se alcança por aqui.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao("Apenas administradores resetam a senha de outros usuários.");
    const { id } = await ctx.params;
    await resetarSenhaUsuario(id);
    return ok({ ok: true });
  });
}
