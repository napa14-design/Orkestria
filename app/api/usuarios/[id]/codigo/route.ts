import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { conviteAcesso } from "@/lib/emails/conviteAcesso";
import { podeGerenciarUsuarios } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { gerarConviteUsuario } from "@/services/usuariosService";

type Ctx = { params: Promise<{ id: string }> };

/** Endereço do sistema para o corpo do e-mail. */
function urlDoSistema(req: Request): string {
  const configurada = process.env.APP_URL?.trim();
  if (configurada) return configurada.replace(/\/$/, "");
  // Sem APP_URL, deduz do próprio pedido — melhor que mandar link vazio.
  return new URL(req.url).origin;
}

/**
 * Gera o código de primeiro acesso de um usuário e devolve o texto puro — a
 * **única vez** em que ele existe fora do hash. Serve para dois momentos:
 * liberar quem acabou de ser cadastrado e destravar quem esqueceu a senha.
 *
 * Gerar apaga a senha atual, então a chamada é destrutiva de propósito: quem
 * esqueceu perde a senha antiga e cria outra. Não existe rota para o
 * administrador **definir** a senha de alguém — ele nunca precisa conhecê-la.
 *
 * Quando há SMTP configurado, o código também vai por e-mail. O envio é
 * **melhor esforço**: falhando, a resposta diz o motivo e o código continua na
 * tela para o administrador repassar por outro caminho.
 */
export async function POST(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao(
        "Apenas administradores geram código de primeiro acesso.",
      );
    const { id } = await ctx.params;
    const convite = await gerarConviteUsuario(id);

    const ds = await getDataSource();
    const usuario = await ds.obter("usuarios", id);
    const destino = usuario?.email ?? "";

    // Diz o motivo mesmo quando não há o que enviar: "não enviado" sem
    // explicação faz o administrador achar que algo quebrou.
    if (!emailConfigurado()) {
      return ok({
        ...convite,
        email: {
          enviado: false,
          destino,
          motivo: "o envio de e-mail ainda não foi configurado no sistema",
        },
      });
    }
    if (!destino) {
      return ok({
        ...convite,
        email: { enviado: false, destino, motivo: "este usuário não tem e-mail cadastrado" },
      });
    }

    const conteudo = conviteAcesso({
      nome: usuario?.nome ?? destino,
      codigo: convite.codigo,
      expiraEm: convite.expira_em,
      url: urlDoSistema(req),
    });
    const envio = await enviarEmail({ para: destino, ...conteudo });
    return ok({ ...convite, email: { ...envio, destino } });
  });
}
