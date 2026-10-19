import { comSessao, ok } from "@/lib/api";
import { hojeISO } from "@/lib/dateUtils";
import { leituraCompleta, limitarSedeConsulta, podeAlterarSede, podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";
import {
  createFuncionario,
  getFuncionarios,
  substituirNoPosto,
} from "@/services/funcionariosService";

export async function GET(req: Request) {
  return comSessao(async (sessao) => {
    const solicitada = new URL(req.url).searchParams.get("sede") ?? undefined;
    const sedeId = limitarSedeConsulta(sessao, solicitada);
    const lista = await getFuncionarios(sedeId);
    // Mínimo necessário (LGPD): o supervisor não recebe o motivo do desligamento
    // — nem nas observações, onde o Desligar também o escreve (revisão, 19/10/2026).
    return ok(
      leituraCompleta(sessao)
        ? lista
        : lista.map((f) => ({ ...f, motivo_desligamento: "", observacoes: "" })),
    );
  });
}

export async function POST(req: Request) {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    // `substitui`/`substitui_desde` não são colunas do funcionário: são a
    // intenção "esta pessoa assume o posto daquela". Saem do corpo antes de
    // gravar, senão viravam campo morto no cadastro.
    const { substitui, substitui_desde, ...dados } = await req.json();
    if (!podeAlterarSede(sessao, dados.sede_id))
      throw new ErroPermissao("Coordenadores só cadastram funcionários das sedes que operam.");
    const criado = await createFuncionario(dados, sessao.email);
    if (!substitui) return ok(criado, 201);
    // A substituição roda DEPOIS de criar: se ela falhar, o cadastro novo
    // permanece e a pessoa tenta de novo pela tela, em vez de perder o que
    // digitou.
    const resumo = await substituirNoPosto(
      criado.id,
      substitui,
      substitui_desde || hojeISO(),
      sessao.email,
    );
    return ok({ ...criado, substituicao: resumo }, 201);
  });
}
