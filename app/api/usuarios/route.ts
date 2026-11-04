import { comSessao, ok } from "@/lib/api";
import { createUsuario, getUsuarios, usuarioPublico } from "@/services/usuariosService";

// Quem pode o quê é conferido no serviço: o administrador gerencia todos, o
// coordenador só os supervisores das sedes dele (`podeGerirSupervisor`), e cria
// coordenadores nelas, sem editá-los depois (`podeCriarCoordenador`).
export async function GET() {
  return comSessao(async (sessao) => ok(await getUsuarios(sessao)));
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => ok(usuarioPublico(await createUsuario(await req.json().catch(() => null), sessao)), 201));
}
