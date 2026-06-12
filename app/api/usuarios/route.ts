import { comSessao, ok } from "@/lib/api";
import { podeGerenciarUsuarios } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createUsuario, getUsuarios } from "@/services/usuariosService";

export async function GET() {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam usuários.");
    return ok(await getUsuarios());
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeGerenciarUsuarios(sessao))
      throw new ErroPermissao("Apenas administradores gerenciam usuários.");
    return ok(await createUsuario(await req.json()), 201);
  });
}
