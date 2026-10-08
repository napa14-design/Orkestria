/**
 * Leitura do resumo executivo do Chromos. A conta mora em `lib/resumoExecutivo.ts`
 * (pura, testada sem banco); aqui só se busca o que ela precisa.
 */
import { getDataSource } from "@/lib/datasource";
import { limitesDeDatas, montarResumo } from "@/lib/resumoExecutivo";
import { resolverParametros } from "./parametrosService";

type Resumo = ReturnType<typeof montarResumo>;

// ~5 min por período, como no Serv3: cada geração relê o período inteiro de
// todas as sedes, e quem chama é um painel que pode recarregar à vontade.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { corpo: Resumo; expiraEm: number }>();

export async function resumoExecutivo(de: string, ate: string, agora = new Date()): Promise<Resumo> {
  const chave = `${de}..${ate}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.expiraEm > agora.getTime()) return guardado.corpo;

  const ds = await getDataSource();
  const { inicio, fim } = limitesDeDatas(de, ate);
  const [sedes, funcionarios, rotinas, execucoes, params] = await Promise.all([
    ds.listar("sedes"),
    ds.listar("funcionarios"),
    ds.consultar("rotinas_planejadas", [
      { campo: "data", op: ">=", valor: inicio },
      { campo: "data", op: "<=", valor: fim },
    ]),
    ds.consultar("execucoes_realizadas", [
      { campo: "data_execucao", op: ">=", valor: inicio },
      { campo: "data_execucao", op: "<=", valor: fim },
    ]),
    // Sem sede: os limites de ocupação são globais e só o administrador muda.
    resolverParametros(),
  ]);

  const corpo = montarResumo({ sedes, funcionarios, rotinas, execucoes, params, de, ate, agora });
  // Com período, as chaves possíveis se multiplicam: o vencido sai ao guardar.
  for (const [k, v] of cache) if (v.expiraEm <= agora.getTime()) cache.delete(k);
  cache.set(chave, { corpo, expiraEm: agora.getTime() + CACHE_MS });
  return corpo;
}
