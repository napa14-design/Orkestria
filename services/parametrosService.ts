import { PARAMETROS_PADRAO } from "@/lib/calculations";
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Parametro, ParametrosResolvidos } from "@/types";

export async function getParametros(): Promise<Parametro[]> {
  const ds = await getDataSource();
  return ds.listar("parametros");
}

/**
 * Resolve os parâmetros operacionais para uma sede:
 * padrão do sistema ← sobrescrito por "geral" ← sobrescrito pela sede.
 */
export async function resolverParametros(sedeId?: string): Promise<ParametrosResolvidos> {
  const todos = (await getParametros()).filter((p) => p.ativo);
  const resolvidos: ParametrosResolvidos = { ...PARAMETROS_PADRAO };
  const aplicar = (escopo: string) => {
    for (const p of todos.filter((x) => x.sede_id === escopo)) {
      if (p.chave in resolvidos) {
        const n = Number(p.valor);
        if (!Number.isNaN(n))
          (resolvidos as unknown as Record<string, number>)[p.chave] = n;
      }
    }
  };
  aplicar("geral");
  if (sedeId && sedeId !== "geral") aplicar(sedeId);
  return resolvidos;
}

export async function createParametro(
  dados: Omit<Parametro, "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em">,
  autor: string,
): Promise<Parametro> {
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("parametros", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

/** Registra quem alterou e quando (exigência da regra de auditoria). */
export async function updateParametro(
  id: string,
  mudancas: Partial<Pick<Parametro, "valor" | "descricao" | "editavel_por_supervisor" | "ativo" | "sede_id">>,
  autor: string,
): Promise<Parametro> {
  const ds = await getDataSource();
  return ds.atualizar("parametros", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function getParametroPorId(id: string): Promise<Parametro | null> {
  const ds = await getDataSource();
  return ds.obter("parametros", id);
}
