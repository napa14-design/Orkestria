/**
 * Cadastro de empresas (lista fechada, decisão do dono, 13/11/2026) — ver
 * `services/empresasService.ts`.
 *
 *  - GET: quem cadastra funcionário (`podeEscrever`) recebe os NOMES das ativas
 *    (`string[]`), para o campo empresa. O administrador, com `?todas=1`, recebe
 *    `{ id, nome, ativo }[]` com as inativas — a tela de Empresas.
 *  - POST { nome }: só administrador. 201 com `{ id, nome, ativo }`.
 *  - PUT { id, ativo }: só administrador. Só ativa/desativa; nome diferente é recusado.
 *  - Sem DELETE: empresa não se exclui.
 */
import { comSessao, ok } from "@/lib/api";
import { podeEscrever, type SessaoUsuario } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createEmpresa, getEmpresas, getNomesAtivos, updateEmpresa } from "@/services/empresasService";
import type { Empresa } from "@/types";

const ehAdministrador = (s: SessaoUsuario) => s.perfil === "administrador";
const publica = (e: Empresa) => ({ id: e.id, nome: e.nome, ativo: e.ativo });

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    if (new URL(req.url).searchParams.get("todas") === "1") {
      if (!ehAdministrador(sessao)) throw new ErroPermissao("Só o administrador vê o cadastro inteiro de empresas.");
      return ok((await getEmpresas()).map(publica));
    }
    return ok(await getNomesAtivos());
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!ehAdministrador(sessao)) throw new ErroPermissao("Só o administrador cadastra empresas.");
    const corpo = (await req.json().catch(() => ({}))) ?? {};
    return ok(publica(await createEmpresa({ nome: corpo.nome }, sessao.email)), 201);
  });
}

export async function PUT(req: Request) {
  return comSessao(async (sessao) => {
    if (!ehAdministrador(sessao)) throw new ErroPermissao("Só o administrador altera empresas.");
    const corpo = (await req.json().catch(() => ({}))) ?? {};
    return ok(publica(await updateEmpresa({ id: corpo.id, nome: corpo.nome, ativo: corpo.ativo }, sessao.email)));
  });
}
