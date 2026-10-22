import { comSessao, ok } from "@/lib/api";
import { podeRegistrarRealizado } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { registrarFeitaPor } from "@/services/execucoesService";

/** Id de documento: letras, números, _ e -. "a/b/c" apontaria para outra coleção no Firestore. */
const ID = /^[\w-]{1,200}$/u;

/**
 * POST /api/execucoes/feita-por { rotina_id, funcionario_id, declaro_epi? }
 *
 * A tarefa de quem está ausente foi feita por um colega: passa para ele e fica
 * como feita. Todo perfil que registra o realizado (supervisor, coordenador,
 * administrador), só nas sedes que opera — conferido também dentro do serviço,
 * onde moram as regras do caso.
 */
export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeRegistrarRealizado(sessao)) throw new ErroPermissao();
    // Corpo que não é JSON (ou é `null`) dava 500: é pedido malformado, 400.
    const corpo: unknown = await req.json().catch(() => null);
    const { rotina_id, funcionario_id, declaro_epi } = (corpo ?? {}) as {
      rotina_id?: unknown;
      funcionario_id?: unknown;
      declaro_epi?: unknown;
    };
    if (typeof rotina_id !== "string" || typeof funcionario_id !== "string" || !ID.test(rotina_id) || !ID.test(funcionario_id))
      return ok({ erro: "Informe rotina_id e funcionario_id válidos." }, 400);
    // Só `true` declara: "true" ou 1 não contam (os EPIs gravados vêm do cadastro).
    return ok(await registrarFeitaPor(rotina_id, funcionario_id, sessao, declaro_epi === true), 201);
  });
}
