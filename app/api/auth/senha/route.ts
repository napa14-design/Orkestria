import { NextResponse } from "next/server";
import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { sessaoDoCadastro, type SessaoUsuario } from "@/lib/permissions";
import { gravarSessao, limparSessao, type MetaSessao } from "@/lib/session";
import { trocarPropriaSenha } from "@/services/usuariosService";

/**
 * Usuário define/troca a própria senha (usa o id da sessão). Quem já tem senha
 * manda a atual junto — ver `trocarPropriaSenha`.
 *
 * A troca sobe a versão de sessão, o que derruba os outros aparelhos; o cookie
 * DESTE aparelho é regravado com a versão nova (e o mesmo teto do login), senão
 * quem trocou a própria senha cairia na próxima reconferência.
 *
 * ⚠️ Regravar zera o relógio da reconferência, então o cookie novo sai do
 * CADASTRO relido, nunca do cookie da requisição: com a sessão do cookie, quem
 * foi desativado trocava a senha a cada 50 min e ficava dentro até o teto,
 * com o perfil e as sedes antigos (revisão de segurança, 22/10/2026).
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    const { senha, senhaAtual } = (await req.json()) as { senha?: string; senhaAtual?: string };
    const meta = sessao as SessaoUsuario & Partial<MetaSessao>;
    // ⚠️ A versão de sessão ANTES de qualquer escrita: depois do "esqueci a
    // senha" (código novo, `senha_hash` vazio), um cookie copiado ainda não
    // reconferido definia senha sem saber a atual e ficava com a conta — e o
    // código entregue à dona deixava de valer (revisão de segurança, 22/10/2026).
    const usuario = await (await getDataSource()).obter("usuarios", sessao.id);
    const nova =
      usuario && usuario.email === sessao.email && (usuario.versao_sessao ?? 0) === meta.sv
        ? sessaoDoCadastro(usuario)
        : null;
    if (!nova) {
      await limparSessao();
      return NextResponse.json({ erro: "Sua sessão terminou. Entre de novo." }, { status: 401 });
    }
    const sv = await trocarPropriaSenha(sessao.id, senhaAtual ?? "", senha ?? "", meta.sv);
    await gravarSessao(nova, { sv, auth_em: meta.auth_em });
    return ok({ ok: true });
  });
}
