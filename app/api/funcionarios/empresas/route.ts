/**
 * As sugestões de empresa do cadastro (13/11/2026): as já vistas em TODAS as sedes,
 * na forma padrão do Chromos. São sugestões — o campo aceita empresa nova, então a
 * lista uns minutos atrasada não trava ninguém. Só nomes de empresa (dado de negócio,
 * não pessoal) e só para quem cadastra. Guardada por 10 minutos: abrir o formulário
 * não lê o cadastro inteiro toda vez (Firestore cobra por leitura).
 */
import { comSessao, ok } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { empresasConhecidas } from "@/lib/empresas";
import { podeEscrever } from "@/lib/permissions";
import { ErroPermissao } from "@/services/erros";

const VALIDADE_MS = 10 * 60 * 1000;
let guardado: { lista: string[]; expira: number } | null = null;

export async function GET() {
  return comSessao(async (sessao) => {
    if (!podeEscrever(sessao)) throw new ErroPermissao();
    if (!guardado || guardado.expira < Date.now()) {
      const ds = await getDataSource();
      guardado = { lista: empresasConhecidas(await ds.listar("funcionarios")), expira: Date.now() + VALIDADE_MS };
    }
    return ok(guardado.lista);
  });
}
