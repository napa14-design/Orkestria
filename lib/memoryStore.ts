/**
 * DataSource em memória com dados de demonstração.
 *
 * Permite rodar o sistema imediatamente (DATA_SOURCE=memory), sem credenciais
 * do Google. Os dados vivem no processo do servidor — reiniciou, voltou ao
 * seed. Exclusivo para desenvolvimento/demonstração.
 */
import { type CondicaoConsulta, type DataSource, filtrarEmMemoria } from "./datasource";
import type { MapaTabelas, NomeTabela } from "./schema";
import { hojeISO } from "./dateUtils";

type Banco = { [K in NomeTabela]: MapaTabelas[K][] };

const AGORA = new Date().toISOString();
const aud = {
  criado_por: "seed",
  criado_em: AGORA,
  atualizado_por: "seed",
  atualizado_em: AGORA,
};

function seed(): Banco {
  const hoje = hojeISO();
  return {
    usuarios: [
      { id: "u1", nome: "Administrador", email: "admin@empresa.com", perfil: "administrador", sede_id: "geral", ativo: true, criado_em: AGORA, atualizado_em: AGORA },
      { id: "u2", nome: "Supervisora Aldeota", email: "supervisor.aldeota@empresa.com", perfil: "supervisor", sede_id: "sede_aldeota", ativo: true, criado_em: AGORA, atualizado_em: AGORA },
      { id: "u3", nome: "Gerência", email: "gerencia@empresa.com", perfil: "visualizador", sede_id: "geral", ativo: true, criado_em: AGORA, atualizado_em: AGORA },
    ],
    sedes: [
      { id: "sede_aldeota", nome_sede: "Sede Aldeota", cidade: "Fortaleza", endereco: "Av. Santos Dumont, 1000", ativo: true, ...aud },
      { id: "sede_dt", nome_sede: "Sede DT", cidade: "Fortaleza", endereco: "Rua Padre Valdevino, 200", ativo: true, ...aud },
      { id: "sede_centro", nome_sede: "Sede Centro", cidade: "Fortaleza", endereco: "Rua Major Facundo, 500", ativo: true, ...aud },
    ],
    funcionarios: [
      { id: "f1", nome: "Maria das Graças", genero: "feminino", sede_id: "sede_aldeota", turno: "manha", entrada: "07:00", saida: "16:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", escala: "seg_sab", entrada_sabado: "07:00", saida_sabado: "11:00", cargo: "ASG", ativo: true, observacoes: "Escala 44h: sáb 4h", ...aud },
      { id: "f2", nome: "José Ribamar", genero: "masculino", sede_id: "sede_aldeota", turno: "manha", entrada: "07:00", saida: "16:00", intervalo_min: 60, intervalo_inicio: "11:00", intervalo_fim: "12:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
      { id: "f3", nome: "Ana Cleide", genero: "feminino", sede_id: "sede_aldeota", turno: "tarde", entrada: "13:00", saida: "22:00", intervalo_min: 60, intervalo_inicio: "17:00", intervalo_fim: "18:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
      { id: "f4", nome: "Carlos Henrique", genero: "masculino", sede_id: "sede_dt", turno: "manha", entrada: "07:00", saida: "16:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
      { id: "f5", nome: "Francisca Souza", genero: "feminino", sede_id: "sede_dt", turno: "manha", entrada: "08:00", saida: "17:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
    ],
    locais: [
      { id: "l1", sede_id: "sede_aldeota", andar: "Térreo", nome_local: "Recepção", tipo_local: "recepcao", metragem: 80, ativo: true, observacoes: "", ...aud },
      { id: "l2", sede_id: "sede_aldeota", andar: "1º andar", nome_local: "Banheiro feminino", tipo_local: "banheiro", metragem: 25, ativo: true, observacoes: "", ...aud },
      { id: "l3", sede_id: "sede_aldeota", andar: "1º andar", nome_local: "Banheiro masculino", tipo_local: "banheiro", metragem: 25, ativo: true, observacoes: "", ...aud },
      { id: "l4", sede_id: "sede_aldeota", andar: "1º andar", nome_local: "Corredor", tipo_local: "corredor", metragem: 60, ativo: true, observacoes: "", ...aud },
      { id: "l5", sede_id: "sede_aldeota", andar: "Térreo", nome_local: "Copa", tipo_local: "copa", metragem: 20, ativo: true, observacoes: "", ...aud },
      { id: "l6", sede_id: "sede_aldeota", andar: "2º andar", nome_local: "Auditório", tipo_local: "auditorio", metragem: 150, ativo: true, observacoes: "", ...aud },
      { id: "l7", sede_id: "sede_dt", andar: "Térreo", nome_local: "Recepção", tipo_local: "recepcao", metragem: 45, ativo: true, observacoes: "", ...aud },
      { id: "l8", sede_id: "sede_dt", andar: "Térreo", nome_local: "Banheiro unissex", tipo_local: "banheiro", metragem: 18, ativo: true, observacoes: "", ...aud },
      { id: "l9", sede_id: "sede_dt", andar: "Externo", nome_local: "Área externa", tipo_local: "area_externa", metragem: 200, ativo: true, observacoes: "", ...aud },
    ],
    tarefas: [
      { id: "t1", nome_tarefa: "Limpeza concorrente", tipo_tarefa: "Limpeza concorrente", local_id: "l1", sede_id: "sede_aldeota", regra_calculo: "por_m2", tempo_base_min: 1, quantidade: 1, frequencia: "diaria", prioridade: "alta", ativo: true, observacoes: "1 min/m²", ...aud },
      { id: "t2", nome_tarefa: "Higienização de banheiro", tipo_tarefa: "Higienização", local_id: "l2", sede_id: "sede_aldeota", regra_calculo: "por_unidade", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", restricao_genero: "feminino", ativo: true, observacoes: "Banheiro feminino — apenas ASG mulheres", ...aud },
      { id: "t3", nome_tarefa: "Higienização de banheiro", tipo_tarefa: "Higienização", local_id: "l3", sede_id: "sede_aldeota", regra_calculo: "por_unidade", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", restricao_genero: "masculino", ativo: true, observacoes: "Banheiro masculino — apenas ASG homens", ...aud },
      { id: "t4", nome_tarefa: "Limpeza de corredor", tipo_tarefa: "Limpeza concorrente", local_id: "l4", sede_id: "sede_aldeota", regra_calculo: "por_m2", tempo_base_min: 0.5, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "0,5 min/m²", ...aud },
      { id: "t5", nome_tarefa: "Organização de copa", tipo_tarefa: "Organização", local_id: "l5", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", janela_inicio: "13:00", janela_fim: "16:00", ativo: true, observacoes: "Só após o almoço", ...aud },
      { id: "t6", nome_tarefa: "Limpeza terminal", tipo_tarefa: "Limpeza terminal", local_id: "l6", sede_id: "sede_aldeota", regra_calculo: "por_m2", tempo_base_min: 1.5, quantidade: 1, frequencia: "semanal", prioridade: "baixa", tempo_referencia: true, ativo: true, observacoes: "1,5 min/m² — tempo de referência", ...aud },
      { id: "t7", nome_tarefa: "Reposição de material", tipo_tarefa: "Reposição", local_id: "l2", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 15, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "t8", nome_tarefa: "Coleta de resíduos", tipo_tarefa: "Coleta", local_id: "l4", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", ativo: true, observacoes: "", ...aud },
      { id: "t12", nome_tarefa: "Limpeza de vidros", tipo_tarefa: "Limpeza terminal", local_id: "l1", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 40, quantidade: 1, frequencia: "semanal", prioridade: "media", dias_semana: "2,4", ativo: true, observacoes: "Toda terça e quinta", ...aud },
      { id: "t9", nome_tarefa: "Limpeza concorrente", tipo_tarefa: "Limpeza concorrente", local_id: "l7", sede_id: "sede_dt", regra_calculo: "por_m2", tempo_base_min: 1, quantidade: 1, frequencia: "diaria", prioridade: "alta", ativo: true, observacoes: "1 min/m²", ...aud },
      { id: "t10", nome_tarefa: "Higienização de banheiro", tipo_tarefa: "Higienização", local_id: "l8", sede_id: "sede_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", ativo: true, observacoes: "", ...aud },
      { id: "t11", nome_tarefa: "Limpeza de área externa", tipo_tarefa: "Limpeza externa", local_id: "l9", sede_id: "sede_dt", regra_calculo: "por_m2", tempo_base_min: 0.4, quantidade: 1, frequencia: "diaria", prioridade: "baixa", ativo: true, observacoes: "0,4 min/m²", ...aud },
    ],
    rotinas_planejadas: [
      { id: "r1", data: hoje, funcionario_id: "f1", sede_id: "sede_aldeota", tarefa_id: "t1", local_id: "l1", inicio_planejado: "07:00", fim_planejado: "08:30", tempo_previsto_min: 80, tempo_visual_min: 90, blocos_ocupados: 3, status: "planejada", observacao: "", supervisor_id: "u2", criado_em: AGORA, atualizado_em: AGORA },
      { id: "r2", data: hoje, funcionario_id: "f1", sede_id: "sede_aldeota", tarefa_id: "t2", local_id: "l2", inicio_planejado: "08:30", fim_planejado: "09:00", tempo_previsto_min: 20, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u2", criado_em: AGORA, atualizado_em: AGORA },
      { id: "r3", data: hoje, funcionario_id: "f2", sede_id: "sede_aldeota", tarefa_id: "t4", local_id: "l4", inicio_planejado: "07:00", fim_planejado: "07:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u2", criado_em: AGORA, atualizado_em: AGORA },
    ],
    execucoes_realizadas: [],
    modelos_rotina: [],
    historico: [],
    ausencias: [
      { id: "a1", funcionario_id: "f3", sede_id: "sede_aldeota", tipo: "atestado", data_inicio: hoje, data_fim: hoje, observacao: "Atestado médico — exemplo do modo demo", ...aud },
    ],
    parametros: [
      { id: "p1", chave: "bloco_agenda_min", valor: "30", tipo: "numero", descricao: "Tamanho do bloco da agenda em minutos", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p2", chave: "ocupacao_baixa", valor: "60", tipo: "percentual", descricao: "Limite para considerar funcionário subutilizado", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p3", chave: "ocupacao_adequada", valor: "85", tipo: "percentual", descricao: "Limite para considerar ocupação adequada", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p4", chave: "ocupacao_alta", valor: "100", tipo: "percentual", descricao: "Limite para alta ocupação/sobrecarga", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p5", chave: "desvio_justificativa_percentual", valor: "30", tipo: "percentual", descricao: "Percentual de desvio que exige justificativa", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p6", chave: "tolerancia_sobrecarga_min", valor: "0", tipo: "numero", descricao: "Tolerância em minutos antes de marcar sobrecarga", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p7", chave: "tempo_limpeza_m2_recepcao", valor: "1", tipo: "min_por_m2", descricao: "Tempo padrão por m² para limpeza de recepção", sede_id: "sede_aldeota", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p8", chave: "min_execucoes_ajuste", valor: "3", tipo: "numero", descricao: "Mínimo de execuções com tempo real para sugerir ajuste de tempo padrão", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p9", chave: "desvio_ajuste_percentual", valor: "15", tipo: "percentual", descricao: "Desvio mediano que dispara sugestão de ajuste do tempo base", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p10", chave: "folga_minima_percentual", valor: "10", tipo: "percentual", descricao: "Folga reservada da jornada (buffer p/ imprevistos) — ocupação-alvo = 100 − este valor", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
    ],
  };
}

// globalThis preserva o banco entre recompilações do dev server (HMR).
const globalComBanco = globalThis as typeof globalThis & { __orkestriaDb?: Banco };

function banco(): Banco {
  if (!globalComBanco.__orkestriaDb) globalComBanco.__orkestriaDb = seed();
  return globalComBanco.__orkestriaDb;
}

export class MemoryDataSource implements DataSource {
  async listar<K extends NomeTabela>(tabela: K): Promise<MapaTabelas[K][]> {
    return [...banco()[tabela]] as MapaTabelas[K][];
  }

  async consultar<K extends NomeTabela>(
    tabela: K,
    condicoes: CondicaoConsulta[],
  ): Promise<MapaTabelas[K][]> {
    return filtrarEmMemoria(
      banco()[tabela] as unknown as Array<Record<string, unknown>>,
      condicoes,
    ) as unknown as MapaTabelas[K][];
  }

  async obter<K extends NomeTabela>(tabela: K, id: string): Promise<MapaTabelas[K] | null> {
    const achado = (banco()[tabela] as Array<{ id: string }>).find((r) => r.id === id);
    return (achado as MapaTabelas[K] | undefined) ?? null;
  }

  async criar<K extends NomeTabela>(tabela: K, registro: MapaTabelas[K]): Promise<MapaTabelas[K]> {
    (banco()[tabela] as MapaTabelas[K][]).push(registro);
    return registro;
  }

  async atualizar<K extends NomeTabela>(
    tabela: K,
    id: string,
    mudancas: Partial<MapaTabelas[K]>,
  ): Promise<MapaTabelas[K]> {
    const lista = banco()[tabela] as Array<MapaTabelas[K] & { id: string }>;
    const i = lista.findIndex((r) => r.id === id);
    if (i === -1) throw new Error(`Registro ${id} não encontrado em ${tabela}.`);
    lista[i] = { ...lista[i], ...mudancas };
    return lista[i];
  }

  async excluir(tabela: NomeTabela, id: string): Promise<void> {
    const lista = banco()[tabela] as Array<{ id: string }>;
    const i = lista.findIndex((r) => r.id === id);
    if (i !== -1) lista.splice(i, 1);
  }
}
