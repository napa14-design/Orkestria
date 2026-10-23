/**
 * Leitura do resumo executivo do Chromos. A conta mora em `lib/resumoExecutivo.ts`
 * (pura, testada sem banco); aqui só se busca o que ela precisa.
 */
import { CATEGORIA_APOIO_OUTRO_SETOR, CATEGORIA_APOIO_PEDAGOGICO } from "@/lib/calculations";
import { getDataSource } from "@/lib/datasource";
import { limitesDeDatas, mesCorrenteEmFortaleza, montarResumo } from "@/lib/resumoExecutivo";
import { resolverParametros } from "./parametrosService";

type Resumo = ReturnType<typeof montarResumo>;

// ~5 min por período, como no Serv3: cada geração relê o período inteiro de
// todas as sedes, e quem chama é um painel que pode recarregar à vontade.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { corpo: Resumo; expiraEm: number }>();

/**
 * O cache em memória não passa de uma instância da Vercel para outra: cada
 * período trocado no painel do Chromos voltava a ler o mês inteiro de todas as
 * sedes (~9,5 mil leituras em outubro; os picos de 40 mil numa hora de 21/10).
 * No banco (`cache_resumo`), a releitura custa UMA leitura. Período que já
 * fechou quase não muda (só realizado lançado atrasado): guarda por um dia.
 */
const CACHE_BANCO_MS = 30 * 60 * 1000;
const CACHE_BANCO_FECHADO_MS = 24 * 60 * 60 * 1000;

function lembrar(chave: string, corpo: Resumo, agora: Date) {
  // Com período, as chaves possíveis se multiplicam: o vencido sai ao guardar.
  for (const [k, v] of cache) if (v.expiraEm <= agora.getTime()) cache.delete(k);
  cache.set(chave, { corpo, expiraEm: agora.getTime() + CACHE_MS });
}

export async function resumoExecutivo(de: string, ate: string, agora = new Date()): Promise<Resumo> {
  const chave = `${de}..${ate}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.expiraEm > agora.getTime()) return guardado.corpo;

  const ds = await getDataSource();
  // A versão no id invalida o que foi guardado antes de o formato mudar
  // (v2, 23/10/2026: apoio pedagógico no total e à parte). Mudou o corpo? Suba.
  const idBanco = `v2_${de}_${ate}`;
  // Cache ilegível ou banco instável não derruba o resumo: segue para o cálculo.
  try {
    const noBanco = await ds.obter("cache_resumo", idBanco);
    if (noBanco && Date.parse(noBanco.expira_em) > agora.getTime()) {
      const corpo = JSON.parse(noBanco.corpo) as Resumo;
      lembrar(chave, corpo, agora);
      return corpo;
    }
  } catch (e) {
    console.warn("[resumo] cache do banco não serviu", e);
  }

  const { inicio, fim } = limitesDeDatas(de, ate);
  const [sedes, funcionarios, rotinas, execucoes, params, tarefasDeApoio, tarefasPedagogicas] = await Promise.all([
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
    // Só as tarefas da categoria — dezenas de leituras, não as 1.200.
    ds.consultar("tarefas", [{ campo: "categoria_id", op: "==", valor: CATEGORIA_APOIO_OUTRO_SETOR }]),
    ds.consultar("tarefas", [{ campo: "categoria_id", op: "==", valor: CATEGORIA_APOIO_PEDAGOGICO }]),
  ]);

  const corpo = montarResumo({
    sedes,
    funcionarios,
    rotinas,
    execucoes,
    params,
    de,
    ate,
    agora,
    tarefasDeApoio: new Set(tarefasDeApoio.map((t) => t.id)),
    tarefasPedagogicas: new Set(tarefasPedagogicas.map((t) => t.id)),
  });
  const fechado = ate < mesCorrenteEmFortaleza(agora);
  try {
    await ds.criar("cache_resumo", {
      id: idBanco,
      corpo: JSON.stringify(corpo),
      expira_em: new Date(agora.getTime() + (fechado ? CACHE_BANCO_FECHADO_MS : CACHE_BANCO_MS)).toISOString(),
      criado_em: agora.toISOString(),
    });
  } catch (e) {
    console.warn("[resumo] não consegui guardar o cache no banco", e);
  }
  lembrar(chave, corpo, agora);
  return corpo;
}
