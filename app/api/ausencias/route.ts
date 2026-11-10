import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { leituraCompleta, limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import { createAusencia, getAusencias } from "@/services/ausenciasService";
import { remanejarCriticasDaAusencia } from "@/services/centralDiaService";

/** GET /api/ausencias?data=YYYY-MM-DD | ?de=&ate= [&sede=] */
export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const url = new URL(req.url);
    const sedeId = limitarSedeConsulta(
      sessao,
      url.searchParams.get("sede") ?? undefined,
    );
    const ausencias = await getAusencias({
      data: url.searchParams.get("data") ?? undefined,
      de: url.searchParams.get("de") ?? undefined,
      ate: url.searchParams.get("ate") ?? undefined,
      sedeId,
    });
    // Mínimo necessário (LGPD): o supervisor precisa saber QUEM está ausente, não
    // se foi atestado nem o que diz a observação (revisão, 19/10/2026).
    return ok(
      leituraCompleta(sessao)
        ? ausencias
        : ausencias.map((a) => ({ ...a, tipo: "outro" as const, observacao: "" })),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    const dados = await req.json();
    // A sede vem do funcionário; valida permissão contra ela.
    const ds = await getDataSource();
    const funcionario = dados.funcionario_id
      ? await ds.obter("funcionarios", dados.funcionario_id)
      : null;
    if (funcionario && !podeAlterarSede(sessao, funcionario.sede_id))
      throw new ErroPermissao("Coordenadores só registram ausências das sedes que operam.");
    const ausencia = await createAusencia(dados, sessao.email);
    // A crítica de quem faltou passa sozinha para outra pessoa (10/11/2026); a
    // tela mostra o que foi feito, e a Central e a Agenda avisam com "desfazer".
    const remanejos = await remanejarCriticasDaAusencia(ausencia, sessao);
    return ok({ ...ausencia, remanejos }, 201);
  });
}
