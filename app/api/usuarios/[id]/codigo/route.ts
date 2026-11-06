import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { conviteAcesso } from "@/lib/emails/conviteAcesso";
import { ErroConflito } from "@/services/erros";
import { conferirConvite, gerarConviteUsuario, gravarConvite, prepararConvite } from "@/services/usuariosService";

type Ctx = { params: Promise<{ id: string }> };

/** Endereço do sistema para o corpo do e-mail. */
function urlDoSistema(req: Request): string {
  const configurada = process.env.APP_URL?.trim();
  if (configurada) return configurada.replace(/\/$/, "");
  // Sem APP_URL, deduz do próprio pedido — melhor que mandar link vazio.
  return new URL(req.url).origin;
}

/**
 * Gera o código de primeiro acesso de um usuário. Serve para dois momentos:
 * liberar quem acabou de ser cadastrado e destravar quem esqueceu a senha.
 *
 * Gerar apaga a senha atual, então a chamada é destrutiva de propósito: quem
 * esqueceu perde a senha antiga e cria outra. Não existe rota para o
 * administrador **definir** a senha de alguém — ele nunca precisa conhecê-la.
 *
 * Dois caminhos:
 *  - Administrador e código de supervisor: a resposta traz o texto puro, a **única
 *    vez** em que ele existe fora do hash, e o e-mail é melhor esforço: falhando, a
 *    resposta diz o motivo e o código segue na tela para repassar por outro caminho.
 *  - Coordenador pedindo o de outro coordenador (`soPorEmail`): o código só existe na
 *    caixa da pessoa. Envia ANTES de gravar: se o envio falhar, a senha dela continua
 *    valendo, em vez de ela ficar sem senha e sem código.
 */
export async function POST(req: Request, ctx: Ctx) {
  return comSessao(async (sessao) => {
    const { id } = await ctx.params;
    const { soPorEmail, versao } = await conferirConvite(id, sessao);

    const ds = await getDataSource();
    if (soPorEmail) {
      const convite = prepararConvite();
      const usuario = await ds.obter("usuarios", id);
      const destino = usuario?.email ?? "";
      const envio = await enviarEmail({
        para: destino,
        ...conviteAcesso({ nome: usuario?.nome ?? destino, codigo: convite.codigo, expiraEm: convite.expira_em, url: urlDoSistema(req) }),
      });
      if (!envio.enviado) {
        // O erro do SMTP fica no log (`enviarEmail`): pode trazer host e porta.
        return ok({ email: { enviado: false, destino, motivo: "o servidor de e-mail não aceitou o envio" } });
      }
      try {
        await gravarConvite(id, versao, convite);
      } catch (e) {
        // O e-mail já saiu com um código que não vale: a tela precisa dizer.
        if (e instanceof ErroConflito) throw new ErroConflito("Esta conta acabou de mudar. Tente de novo: se chegar um e-mail, vale só o do último envio.");
        throw e;
      }
      return ok({ expira_em: convite.expira_em, email: { enviado: true, destino } });
    }

    const convite = await gerarConviteUsuario(id, versao);
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
    // O erro do SMTP pode trazer host e porta: o motivo cru é só do administrador.
    const motivo = envio.enviado || sessao.perfil === "administrador" ? envio.motivo : "o servidor de e-mail não aceitou o envio";
    return ok({ ...convite, email: { ...envio, motivo, destino } });
  });
}
