import { NextResponse } from "next/server";
import { comSessao, ok } from "@/lib/api";
import { podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { QuadroIndisponivel, vincularAoQuadro } from "@/services/quadroInfraService";

/**
 * POST /api/quadro-infra/vincular { funcionario_id, quadro_id } — grava no
 * funcionário a matrícula e a empresa da pessoa do Quadro. Só ids no corpo: a
 * matrícula sai do Quadro, nunca do cliente.
 */
export const dynamic = "force-dynamic";

const id = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200;

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const corpo = (await req.json().catch(() => null)) as { funcionario_id?: unknown; quadro_id?: unknown } | null;
    if (!corpo || !id(corpo.funcionario_id) || !id(corpo.quadro_id))
      throw new ErroValidacao([{ nivel: "erro", codigo: "QUADRO_PEDIDO", mensagem: "Pedido incompleto." }]);
    try {
      return ok(
        await vincularAoQuadro(
          corpo.funcionario_id as string,
          corpo.quadro_id as string,
          (s) => podeAlterarSede(sessao, s),
          sessao.email,
        ),
      );
    } catch (e) {
      if (e instanceof QuadroIndisponivel) return NextResponse.json({ erro: e.message }, { status: 503 });
      throw e;
    }
  });
}
