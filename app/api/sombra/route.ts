import { comSessao, ok } from "@/lib/api";
import { ErroPermissao, ErroValidacao } from "@/services/erros";
import { projetarSombraDoDia } from "@/services/modelosService";

/**
 * GET /api/sombra?data=AAAA-MM-DD[&sede_id=…] — **geração sombra**.
 *
 * Calcula o que a geração automática produziria e confronta com o dia que existe,
 * **sem escrever nada**. Instrumento de medição, não feature: não tem tela, não
 * aparece no menu e o supervisor nunca é levado até aqui. É admin-only pelo mesmo
 * motivo de `migrar-firebase` — pertence à implantação, não à operação diária.
 *
 * Serve para responder com número, ao longo das primeiras semanas de operação
 * real, se a rota padrão sobrevive ao contato com o dia: quantos blocos o
 * supervisor move, acrescenta ou não usa. Sem esse dado, ligar um cron para
 * escrever o dia sozinho é aposta.
 */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    if (sessao.perfil !== "administrador")
      throw new ErroPermissao("A geração sombra é ferramenta de implantação (admin).");

    const url = new URL(req.url);
    const data = url.searchParams.get("data") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(data))
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "DATA_INVALIDA",
          mensagem: "Informe ?data=AAAA-MM-DD.",
        },
      ]);
    const sedeId = url.searchParams.get("sede_id") ?? undefined;

    const relatorios = await projetarSombraDoDia(data, sedeId);
    return ok({
      data,
      sedes: relatorios.length,
      // Somatório para acompanhar a curva dia a dia sem reler o detalhe.
      total: relatorios.reduce(
        (acc, r) => ({
          itens_na_rota: acc.itens_na_rota + r.itens_na_rota,
          blocos_no_dia: acc.blocos_no_dia + r.blocos_no_dia,
          materializaria: acc.materializaria + r.materializaria,
          preservados: acc.preservados + r.preservados,
          movidos: acc.movidos + r.divergencia.movidos,
          so_na_rota: acc.so_na_rota + r.divergencia.so_na_rota,
          so_no_dia: acc.so_no_dia + r.divergencia.so_no_dia,
        }),
        {
          itens_na_rota: 0,
          blocos_no_dia: 0,
          materializaria: 0,
          preservados: 0,
          movidos: 0,
          so_na_rota: 0,
          so_no_dia: 0,
        },
      ),
      relatorios,
    });
  });
}
