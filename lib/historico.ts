/**
 * Decorator de histórico: envolve qualquer DataSource e registra toda
 * escrita (criar/atualizar/excluir) na tabela `historico`, com o usuário da
 * requisição atual (lib/contextoUsuario.ts).
 *
 * Ponto único de auditoria — nenhum serviço ou rota precisa logar nada.
 * DECISÃO DE ARQUITETURA: o log é aguardado e tentado novamente em falhas
 * transitórias. Isso acrescenta uma escrita ao caminho crítico, inclusive nos
 * lotes, mas evita perder auditoria quando uma requisição serverless termina.
 * A otimização futura correta é batch/BulkWriter com dado + log, não voltar a
 * fire-and-forget. Fontes que não oferecem transação conjunta ainda não têm
 * atomicidade perfeita, mas a requisição não termina antes da auditoria.
 */
import { usuarioAtual } from "./contextoUsuario";
import { hojeISO } from "./dateUtils";
import { limiteDoExpurgo } from "./eventosQuadro";
import type { CondicaoConsulta, DataSource, OperacaoLote, OpcoesConsulta } from "./datasource";
import { TABELAS_SO_DE_INCLUSAO, type MapaTabelas, type NomeTabela } from "./schema";

/**
 * Tabelas que NÃO entram no histórico: o próprio histórico (recursão) e dado
 * derivado que o sistema regrava sozinho — o cache do resumo do Chromos
 * encheria o log de linhas que ninguém fez (22/10/2026). `uso_telas` é coleta
 * temporária e precisa sumir inteira: no log imutável, sobreviveria ao apagamento,
 * com o e-mail de quem abriu a tela.
 */
const SEM_HISTORICO: ReadonlySet<NomeTabela> = new Set<NomeTabela>([
  "historico",
  "cache_resumo",
  "uso_telas",
  // O evento do Quadro já é um registro imutável com autor e instante; repeti-lo aqui
  // copiaria o nome completo para outro log que também não se apaga.
  "eventos_quadro",
]);

/** A recusa de toda escrita que não seja inclusão nova numa tabela só de inclusão. */
function soInclusao(tabela: NomeTabela, acao: string): never {
  throw new Error(`${tabela} é só de inclusão: ${acao} não é permitido.`);
}

/** Campos usados como "nome" do registro no resumo, na ordem de preferência. */
const CAMPOS_NOME = [
  "nome",
  "nome_tarefa",
  "nome_local",
  "nome_sede",
  "nome_modelo",
  "chave",
  "email",
] as const;

function nomeDoRegistro(registro: Record<string, unknown>): string {
  for (const campo of CAMPOS_NOME) {
    const v = registro[campo];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

export class HistoricoDataSource implements DataSource {
  constructor(private interno: DataSource) {}

  listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]> {
    return this.interno.listar(tabela);
  }

  consultar<K extends NomeTabela>(
    tabela: K,
    condicoes: CondicaoConsulta[],
    opcoes?: OpcoesConsulta,
  ): Promise<MapaTabelas[K][]> {
    return this.interno.consultar(tabela, condicoes, opcoes);
  }

  contar(tabela: NomeTabela, condicoes: CondicaoConsulta[]): Promise<number> {
    return this.interno.contar(tabela, condicoes);
  }

  obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null> {
    return this.interno.obter(tabela, id);
  }

  async criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]> {
    if (TABELAS_SO_DE_INCLUSAO.has(tabela) && (await this.interno.obter(tabela, (registro as { id: string }).id)))
      soInclusao(tabela, "regravar um registro que já existe");
    const resultado = await this.interno.criar(tabela, registro);
    await this.logar(
      tabela,
      (registro as { id: string }).id,
      "criar",
      nomeDoRegistro(registro as unknown as Record<string, unknown>),
    );
    return resultado;
  }

  async atualizar<K extends NomeTabela>(
    tabela: K,
    id: string,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K]> {
    if (TABELAS_SO_DE_INCLUSAO.has(tabela)) soInclusao(tabela, "atualizar");
    const resultado = await this.interno.atualizar(tabela, id, mudancas);
    const campos = Object.keys(mudancas)
      .filter((c) => !["atualizado_por", "atualizado_em"].includes(c))
      .join(", ");
    await this.logar(tabela, id, "atualizar", campos);
    return resultado;
  }

  async atualizarSe<K extends NomeTabela>(
    tabela: K,
    id: string,
    condicao: (atual: MapaTabelas[K]) => boolean,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K] | null> {
    if (TABELAS_SO_DE_INCLUSAO.has(tabela)) soInclusao(tabela, "atualizar");
    const resultado = await this.interno.atualizarSe(tabela, id, condicao, mudancas);
    if (!resultado) return null; // Não gravou: não há o que registrar.
    const campos = Object.keys(mudancas)
      .filter((c) => !["atualizado_por", "atualizado_em"].includes(c))
      .join(", ");
    await this.logar(tabela, id, "atualizar", campos);
    return resultado;
  }

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    if (TABELAS_SO_DE_INCLUSAO.has(tabela)) soInclusao(tabela, "excluir");
    await this.interno.excluir(tabela, id);
    await this.logar(tabela, id, "excluir", "");
  }

  /**
   * O ponto alto do decorator: os registros de auditoria entram **no mesmo
   * lote** que o dado. Antes, cada escrita gerava um log separado — se o log
   * falhasse, o dado ficava sem rastro; se o dado falhasse no meio, os logs já
   * gravados descreviam escritas que não aconteceram.
   *
   * É exatamente a "otimização futura correta" que o comentário do topo deste
   * arquivo previa: batch com dado + log, em vez de voltar a fire-and-forget.
   */
  async gravarLote(operacoes: OperacaoLote[]): Promise<void> {
    // Só de inclusão, ANTES de gravar qualquer coisa do lote. O id repetido é conferido
    // aqui para todo banco (o Sheets não tem `create`); no Firestore e na memória o
    // próprio lote também recusa, fechando a corrida entre esta leitura e o commit.
    const novosSoInclusao = new Set<string>();
    for (const op of operacoes) {
      const soInclusaoAqui = TABELAS_SO_DE_INCLUSAO.has(op.tabela);
      if (!soInclusaoAqui && !(op.tipo === "criar" && op.exigirNovo)) continue;
      if (op.tipo !== "criar") soInclusao(op.tabela, op.tipo);
      const id = (op.registro as { id: string }).id;
      if (novosSoInclusao.has(`${op.tabela}/${id}`) || (await this.interno.obter(op.tabela, id))) {
        if (soInclusaoAqui) soInclusao(op.tabela, "regravar um registro que já existe");
        throw new Error(`Registro ${id} já existe em ${op.tabela}.`);
      }
      novosSoInclusao.add(`${op.tabela}/${id}`);
    }
    const agora = new Date().toISOString();
    const usuario = usuarioAtual();
    const logs: OperacaoLote[] = [];
    for (const op of operacoes) {
      if (SEM_HISTORICO.has(op.tabela)) continue; // sem recursão, sem dado derivado
      const registroId = op.tipo === "criar" ? (op.registro as { id: string }).id : op.id;
      const resumo =
        op.tipo === "criar"
          ? nomeDoRegistro(op.registro as unknown as Record<string, unknown>)
          : op.tipo === "atualizar"
            ? Object.keys(op.mudancas)
                .filter((c) => !["atualizado_por", "atualizado_em"].includes(c))
                .join(", ")
            : "";
      logs.push({
        tipo: "criar",
        tabela: "historico",
        registro: {
          id: crypto.randomUUID(),
          tabela: op.tabela,
          registro_id: registroId,
          acao: op.tipo,
          resumo,
          usuario,
          criado_em: agora,
        } as MapaTabelas["historico"],
      });
    }
    await this.interno.gravarLote([...operacoes, ...logs]);
  }

  /**
   * O ÚNICO caminho que apaga evento do Quadro (retenção de 90 dias, decisão do dono,
   * 16/11/2026), chamado só pelo feed do Chromos, uma vez por dia (`expurgarUmaVezPorDia`).
   * Só lê os vencidos (`registradoEm <= limite`). O limite é calculado AQUI, de hoje em
   * Fortaleza — quem chama não escolhe a data, então não há como apagar evento novo. As
   * exclusões e o registro do expurgo no histórico vão num lote só. Devolve quantos saíram.
   */
  async expurgarEventosQuadroAntigos(): Promise<number> {
    const limite = limiteDoExpurgo(hojeISO());
    const velhos = (
      await this.interno.consultar("eventos_quadro", [{ campo: "registradoEm", op: "<=", valor: limite }])
    ).filter((e) => typeof e.registradoEm === "string" && e.registradoEm < limite);
    if (!velhos.length) return 0;
    await this.interno.gravarLote([
      ...velhos.map((e) => ({ tipo: "excluir" as const, tabela: "eventos_quadro" as const, id: e.id })),
      {
        tipo: "criar",
        tabela: "historico",
        registro: {
          id: crypto.randomUUID(),
          tabela: "eventos_quadro",
          registro_id: "expurgo",
          acao: "excluir",
          resumo: `expurgo de ${velhos.length} evento(s) registrados antes de ${limite}`,
          usuario: usuarioAtual(),
          criado_em: new Date().toISOString(),
        } as MapaTabelas["historico"],
      },
    ]);
    return velhos.length;
  }

  private async logar(
    tabela: NomeTabela,
    registroId: string,
    acao: "criar" | "atualizar" | "excluir",
    resumo: string,
  ): Promise<void> {
    if (SEM_HISTORICO.has(tabela)) return; // sem recursão, sem dado derivado
    const registro = {
      id: crypto.randomUUID(),
      tabela,
      registro_id: registroId,
      acao,
      resumo,
      usuario: usuarioAtual(),
      criado_em: new Date().toISOString(),
    };
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        await this.interno.criar("historico", registro);
        return;
      } catch (erro) {
        if (tentativa === 3) {
          console.error("[historico] falhou após 3 tentativas", erro);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, tentativa * 40));
      }
    }
  }
}
