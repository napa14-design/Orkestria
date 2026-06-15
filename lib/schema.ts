/**
 * Schema lógico das tabelas — única fonte de verdade sobre nomes de abas/
 * coleções, colunas e tipos. Usado pelo datasource do Google Sheets
 * (serialização), pelo endpoint de setup (criação dos cabeçalhos) e pela
 * migração para o Firestore (nomes das coleções).
 */
import type {
  Ausencia,
  ExecucaoRealizada,
  Funcionario,
  Local,
  ModeloRotinaItem,
  Parametro,
  RegistroHistorico,
  RotinaPlanejada,
  Sede,
  Tarefa,
  Usuario,
} from "@/types";

export interface MapaTabelas {
  usuarios: Usuario;
  funcionarios: Funcionario;
  sedes: Sede;
  locais: Local;
  tarefas: Tarefa;
  rotinas_planejadas: RotinaPlanejada;
  execucoes_realizadas: ExecucaoRealizada;
  parametros: Parametro;
  modelos_rotina: ModeloRotinaItem;
  ausencias: Ausencia;
  historico: RegistroHistorico;
}

export type NomeTabela = keyof MapaTabelas;

type TipoColuna = "string" | "number" | "boolean";

export interface DefColuna {
  key: string;
  tipo: TipoColuna;
}

const col = (key: string, tipo: TipoColuna = "string"): DefColuna => ({ key, tipo });

const AUDITORIA: DefColuna[] = [
  col("criado_por"),
  col("criado_em"),
  col("atualizado_por"),
  col("atualizado_em"),
];

export const SCHEMA: Record<NomeTabela, DefColuna[]> = {
  usuarios: [
    col("id"),
    col("nome"),
    col("email"),
    col("perfil"),
    col("sede_id"),
    col("ativo", "boolean"),
    col("criado_em"),
    col("atualizado_em"),
  ],
  funcionarios: [
    col("id"),
    col("nome"),
    col("genero"),
    col("sede_id"),
    col("turno"),
    col("entrada"),
    col("saida"),
    col("intervalo_min", "number"),
    col("intervalo_inicio"),
    col("intervalo_fim"),
    col("escala"),
    col("entrada_sabado"),
    col("saida_sabado"),
    col("cargo"),
    col("ativo", "boolean"),
    col("observacoes"),
    ...AUDITORIA,
  ],
  sedes: [
    col("id"),
    col("nome_sede"),
    col("cidade"),
    col("endereco"),
    col("ativo", "boolean"),
    ...AUDITORIA,
  ],
  locais: [
    col("id"),
    col("sede_id"),
    col("andar"),
    col("nome_local"),
    col("tipo_local"),
    col("metragem", "number"),
    col("ativo", "boolean"),
    col("observacoes"),
    ...AUDITORIA,
  ],
  tarefas: [
    col("id"),
    col("nome_tarefa"),
    col("tipo_tarefa"),
    col("local_id"),
    col("sede_id"),
    col("regra_calculo"),
    col("tempo_base_min", "number"),
    col("quantidade", "number"),
    col("frequencia"),
    col("prioridade"),
    col("restricao_genero"),
    col("ativo", "boolean"),
    col("observacoes"),
    ...AUDITORIA,
  ],
  rotinas_planejadas: [
    col("id"),
    col("data"),
    col("funcionario_id"),
    col("sede_id"),
    col("tarefa_id"),
    col("local_id"),
    col("inicio_planejado"),
    col("fim_planejado"),
    col("tempo_previsto_min", "number"),
    col("tempo_visual_min", "number"),
    col("blocos_ocupados", "number"),
    col("status"),
    col("observacao"),
    col("supervisor_id"),
    col("criado_em"),
    col("atualizado_em"),
  ],
  execucoes_realizadas: [
    col("id"),
    col("rotina_id"),
    col("data_execucao"),
    col("status_realizado"),
    col("inicio_real"),
    col("fim_real"),
    col("tempo_real_min", "number"),
    col("justificativa"),
    col("observacao"),
    col("supervisor_id"),
    col("criado_em"),
    col("atualizado_em"),
  ],
  parametros: [
    col("id"),
    col("chave"),
    col("valor"),
    col("tipo"),
    col("descricao"),
    col("sede_id"),
    col("editavel_por_supervisor", "boolean"),
    col("ativo", "boolean"),
    ...AUDITORIA,
  ],
  modelos_rotina: [
    col("id"),
    col("nome_modelo"),
    col("sede_id"),
    col("funcionario_id"),
    col("tarefa_id"),
    col("local_id"),
    col("inicio_planejado"),
    col("criado_por"),
    col("criado_em"),
  ],
  ausencias: [
    col("id"),
    col("funcionario_id"),
    col("sede_id"),
    col("tipo"),
    col("data_inicio"),
    col("data_fim"),
    col("observacao"),
    ...AUDITORIA,
  ],
  historico: [
    col("id"),
    col("tabela"),
    col("registro_id"),
    col("acao"),
    col("resumo"),
    col("usuario"),
    col("criado_em"),
  ],
};

/** Converte uma linha crua do Sheets (strings) no objeto tipado da tabela. */
export function linhaParaObjeto<K extends NomeTabela>(
  tabela: K,
  cabecalho: string[],
  linha: string[],
): MapaTabelas[K] {
  const defs = new Map(SCHEMA[tabela].map((c) => [c.key, c]));
  const obj: Record<string, unknown> = {};
  cabecalho.forEach((nomeColuna, i) => {
    const def = defs.get(nomeColuna);
    if (!def) return;
    const bruto = linha[i] ?? "";
    if (def.tipo === "number") obj[nomeColuna] = bruto === "" ? 0 : Number(bruto);
    else if (def.tipo === "boolean")
      obj[nomeColuna] = String(bruto).toLowerCase() === "true";
    else obj[nomeColuna] = String(bruto);
  });
  // Garante todas as colunas mesmo se a planilha estiver com cabeçalho parcial.
  for (const def of SCHEMA[tabela]) {
    if (!(def.key in obj))
      obj[def.key] = def.tipo === "number" ? 0 : def.tipo === "boolean" ? false : "";
  }
  return obj as unknown as MapaTabelas[K];
}

/** Converte o objeto tipado em linha de células na ordem do schema. */
export function objetoParaLinha<K extends NomeTabela>(
  tabela: K,
  obj: MapaTabelas[K],
): string[] {
  return SCHEMA[tabela].map((def) => {
    const v = (obj as unknown as Record<string, unknown>)[def.key];
    if (v === undefined || v === null) return "";
    if (def.tipo === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  });
}

export function cabecalho(tabela: NomeTabela): string[] {
  return SCHEMA[tabela].map((c) => c.key);
}
