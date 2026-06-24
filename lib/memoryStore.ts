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
      { id: "sede_aldeota", nome_sede: "Sede Aldeota", cidade: "Fortaleza", endereco: "Av. Santos Dumont, 1000", tipo_sede: "faculdade", grupo: "Centro", ativo: true, ...aud },
      { id: "sede_dt", nome_sede: "Sede DT", cidade: "Fortaleza", endereco: "Rua Padre Valdevino, 200", tipo_sede: "escola", grupo: "Sul", ativo: true, ...aud },
      { id: "sede_centro", nome_sede: "Sede Centro", cidade: "Fortaleza", endereco: "Rua Major Facundo, 500", tipo_sede: "educacao_infantil", grupo: "Centro", ativo: true, ...aud },
      { id: "christus_dt", nome_sede: "Christus — Dionísio Torres", cidade: "Fortaleza", endereco: "R. Israel Bezerra, 630 - Dionísio Torres", tipo_sede: "escola", grupo: "Christus", ativo: true, ...aud },
    ],
    funcionarios: [
      { id: "f1", nome: "Maria das Graças", genero: "feminino", sede_id: "sede_aldeota", turno: "manha", entrada: "07:00", saida: "16:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", escala: "seg_sab", entrada_sabado: "07:00", saida_sabado: "11:00", cargo: "ASG", ativo: true, observacoes: "Escala 44h: sáb 4h", ...aud },
      { id: "f2", nome: "José Ribamar", genero: "masculino", sede_id: "sede_aldeota", turno: "manha", entrada: "07:00", saida: "16:00", intervalo_min: 60, intervalo_inicio: "11:00", intervalo_fim: "12:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
      { id: "f3", nome: "Ana Cleide", genero: "feminino", sede_id: "sede_aldeota", turno: "tarde", entrada: "13:00", saida: "22:00", intervalo_min: 60, intervalo_inicio: "17:00", intervalo_fim: "18:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
      { id: "f4", nome: "Carlos Henrique", genero: "masculino", sede_id: "sede_dt", turno: "manha", entrada: "07:00", saida: "16:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
      { id: "f5", nome: "Francisca Souza", genero: "feminino", sede_id: "sede_dt", turno: "manha", entrada: "08:00", saida: "17:00", intervalo_min: 60, intervalo_inicio: "12:00", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "", ...aud },
      { id: "christus_f1", nome: "Aurilene", genero: "feminino", sede_id: "christus_dt", turno: "manha", entrada: "06:00", saida: "16:00", intervalo_min: 90, intervalo_inicio: "11:30", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "Rota real Christus DT — FINANCEIRO / LOJINHA", ...aud },
      { id: "christus_f2", nome: "Naiane", genero: "feminino", sede_id: "christus_dt", turno: "manha", entrada: "07:00", saida: "17:00", intervalo_min: 90, intervalo_inicio: "11:30", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "Rota real Christus DT — PEDAGOGIA ED. INF.", ...aud },
      { id: "christus_f3", nome: "Do Vale", genero: "masculino", sede_id: "christus_dt", turno: "manha", entrada: "06:00", saida: "16:00", intervalo_min: 90, intervalo_inicio: "11:30", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "Rota real Christus DT — COLETA RESIDUOS", ...aud },
      { id: "christus_f4", nome: "Orlando", genero: "masculino", sede_id: "christus_dt", turno: "manha", entrada: "07:00", saida: "17:00", intervalo_min: 90, intervalo_inicio: "11:30", intervalo_fim: "13:00", cargo: "ASG", ativo: true, observacoes: "Rota real Christus DT — PINTURA", ...aud },
    ],
    locais: [
      { id: "l1", sede_id: "sede_aldeota", andar: "Térreo", nome_local: "Recepção", tipo_local: "recepcao", metragem: 80, ativo: true, observacoes: "", ...aud },
      { id: "l2", sede_id: "sede_aldeota", andar: "1º andar", nome_local: "Banheiro feminino", tipo_local: "banheiro", metragem: 25, fator_intensidade: 1.5, ativo: true, observacoes: "Ambiente denso (banheiro)", ...aud },
      { id: "l3", sede_id: "sede_aldeota", andar: "1º andar", nome_local: "Banheiro masculino", tipo_local: "banheiro", metragem: 25, fator_intensidade: 1.5, ativo: true, observacoes: "Ambiente denso (banheiro)", ...aud },
      { id: "l4", sede_id: "sede_aldeota", andar: "1º andar", nome_local: "Corredor", tipo_local: "corredor", metragem: 60, ativo: true, observacoes: "", ...aud },
      { id: "l5", sede_id: "sede_aldeota", andar: "Térreo", nome_local: "Copa", tipo_local: "copa", metragem: 20, fator_intensidade: 1.3, ativo: true, observacoes: "Ambiente denso (copa)", ...aud },
      { id: "l6", sede_id: "sede_aldeota", andar: "2º andar", nome_local: "Auditório", tipo_local: "auditorio", metragem: 150, ativo: true, observacoes: "", ...aud },
      { id: "l7", sede_id: "sede_dt", andar: "Térreo", nome_local: "Recepção", tipo_local: "recepcao", metragem: 45, ativo: true, observacoes: "", ...aud },
      { id: "l8", sede_id: "sede_dt", andar: "Térreo", nome_local: "Banheiro unissex", tipo_local: "banheiro", metragem: 18, fator_intensidade: 1.5, ativo: true, observacoes: "Ambiente denso (banheiro)", ...aud },
      { id: "l9", sede_id: "sede_dt", andar: "Externo", nome_local: "Área externa", tipo_local: "area_externa", metragem: 200, fator_intensidade: 0.8, ativo: true, observacoes: "Ambiente aberto (leve)", ...aud },
      { id: "christus_l1", sede_id: "christus_dt", andar: "—", nome_local: "Financeiro / Lojinha", tipo_local: "outros", metragem: 50, ativo: true, observacoes: "Setor Christus DT", ...aud },
      { id: "christus_l2", sede_id: "christus_dt", andar: "—", nome_local: "Pedagogia Ed. Inf.", tipo_local: "outros", metragem: 50, ativo: true, observacoes: "Setor Christus DT", ...aud },
      { id: "christus_l3", sede_id: "christus_dt", andar: "—", nome_local: "Coleta Residuos", tipo_local: "outros", metragem: 50, ativo: true, observacoes: "Setor Christus DT", ...aud },
      { id: "christus_l4", sede_id: "christus_dt", andar: "—", nome_local: "Pintura", tipo_local: "outros", metragem: 50, ativo: true, observacoes: "Setor Christus DT", ...aud },
    ],
    categorias: [
      { id: "c1", nome: "Limpeza concorrente", descricao: "Manutenção do dia a dia (rápida, recorrente).", cor: "#2f6f4f", fator_intensidade: 1, ativo: true, ...aud },
      { id: "c2", nome: "Higienização", descricao: "Sanitização de banheiros e áreas críticas.", cor: "#9C0D38", fator_intensidade: 1, ativo: true, ...aud },
      { id: "c3", nome: "Coleta", descricao: "Recolhimento e descarte de resíduos.", cor: "#b8860b", fator_intensidade: 1, ativo: true, ...aud },
      { id: "c4", nome: "Organização", descricao: "Arrumação e ordenação de ambientes.", cor: "#3a6ea5", fator_intensidade: 1, ativo: true, ...aud },
      { id: "c5", nome: "Reposição", descricao: "Abastecimento de materiais e insumos.", cor: "#6b4f8a", fator_intensidade: 1, ativo: true, ...aud },
      { id: "c6", nome: "Limpeza terminal", descricao: "Limpeza profunda/periódica de maior duração.", cor: "#555555", fator_intensidade: 1, ativo: true, ...aud },
      { id: "c7", nome: "Limpeza externa", descricao: "Áreas externas e fachadas.", cor: "#8a6d3b", fator_intensidade: 1, ativo: true, ...aud },
      { id: "c8", nome: "Apoio operacional", descricao: "Atividades que não são limpeza: café, recolhimento, aguação, montagem.", cor: "#5a7a8a", fator_intensidade: 1, ativo: true, ...aud },
    ],
    requisitos: [
      { id: "rq1", nome: "Manuseio de produtos químicos", tipo: "treinamento", descricao: "Capacitação para uso de saneantes/desinfetantes.", ativo: true, ...aud },
      { id: "rq2", nome: "NR-35 (trabalho em altura)", tipo: "aptidao", descricao: "Apto a trabalho em altura.", ativo: true, ...aud },
      { id: "rq3", nome: "Luvas nitrílicas", tipo: "epi", descricao: "EPI obrigatório para higienização.", ativo: true, ...aud },
      { id: "rq4", nome: "Máscara descartável (PFF2)", tipo: "epi", descricao: "Proteção respiratória.", ativo: true, ...aud },
      { id: "rq5", nome: "Botas de borracha antiderrapante", tipo: "epi", descricao: "Proteção dos pés em piso molhado.", ativo: true, ...aud },
      { id: "rq6", nome: "Avental impermeável", tipo: "epi", descricao: "Proteção do tronco contra respingos.", ativo: true, ...aud },
      { id: "rq7", nome: "Óculos de proteção", tipo: "epi", descricao: "Proteção ocular contra respingos químicos.", ativo: true, ...aud },
      { id: "rq8", nome: "Touca descartável", tipo: "epi", descricao: "Proteção/higiene capilar.", ativo: true, ...aud },
      { id: "rq9", nome: "Luvas de raspa (carga)", tipo: "epi", descricao: "Proteção das mãos em descarga/transporte.", ativo: true, ...aud },
      { id: "rq10", nome: "Protetor auricular", tipo: "epi", descricao: "Proteção auditiva em áreas ruidosas.", ativo: true, ...aud },
    ],
    tarefas: [
      { id: "t1", nome_tarefa: "Limpeza concorrente", tipo_tarefa: "Limpeza concorrente", categoria_id: "c1", local_id: "l1", sede_id: "sede_aldeota", regra_calculo: "por_m2", tempo_base_min: 1, quantidade: 1, frequencia: "diaria", prioridade: "alta", requisitos: "rq3,rq4,rq5,rq8", ativo: true, observacoes: "1 min/m²", ...aud },
      { id: "t2", nome_tarefa: "Higienização de banheiro", tipo_tarefa: "Higienização", categoria_id: "c2", local_id: "l2", sede_id: "sede_aldeota", regra_calculo: "por_unidade", tipo_servico: "pesada", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", restricao_genero: "feminino", critica: true, requisitos: "rq1,rq3,rq4,rq6,rq7,rq9,rq10", ativo: true, observacoes: "Banheiro feminino — apenas ASG mulheres", ...aud },
      { id: "t3", nome_tarefa: "Higienização de banheiro", tipo_tarefa: "Higienização", categoria_id: "c2", local_id: "l3", sede_id: "sede_aldeota", regra_calculo: "por_unidade", tipo_servico: "pesada", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", restricao_genero: "masculino", ativo: true, observacoes: "Banheiro masculino — apenas ASG homens", ...aud },
      { id: "t4", nome_tarefa: "Limpeza de corredor", tipo_tarefa: "Limpeza concorrente", categoria_id: "c1", local_id: "l4", sede_id: "sede_aldeota", regra_calculo: "por_m2", tempo_base_min: 0.5, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "0,5 min/m²", ...aud },
      { id: "t5", nome_tarefa: "Organização de copa", tipo_tarefa: "Organização", categoria_id: "c4", local_id: "l5", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", janela_inicio: "13:00", janela_fim: "16:00", ativo: true, observacoes: "Só após o almoço", ...aud },
      { id: "t6", nome_tarefa: "Limpeza terminal", tipo_tarefa: "Limpeza terminal", categoria_id: "c6", local_id: "l6", sede_id: "sede_aldeota", regra_calculo: "por_m2", tipo_servico: "pesada", tempo_base_min: 1.5, quantidade: 1, frequencia: "semanal", prioridade: "baixa", tempo_referencia: true, depende_calendario: true, ativo: true, observacoes: "1,5 min/m² — tempo de referência; só em período letivo", ...aud },
      { id: "t7", nome_tarefa: "Reposição de material", tipo_tarefa: "Reposição", categoria_id: "c5", local_id: "l2", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 15, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "t8", nome_tarefa: "Coleta de resíduos", tipo_tarefa: "Coleta", categoria_id: "c3", local_id: "l4", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", critica: true, ativo: true, observacoes: "", ...aud },
      { id: "t12", nome_tarefa: "Limpeza de vidros", tipo_tarefa: "Limpeza terminal", categoria_id: "c6", local_id: "l1", sede_id: "sede_aldeota", regra_calculo: "fixo", tipo_servico: "desincrustante", tempo_base_min: 40, quantidade: 1, frequencia: "semanal", prioridade: "media", dias_semana: "2,4", requisitos: "rq2", ativo: true, observacoes: "Toda terça e quinta", ...aud },
      { id: "t13", nome_tarefa: "Acompanhamento de pátio", tipo_tarefa: "Presença", categoria_id: "", local_id: "l4", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 60, quantidade: 1, frequencia: "diaria", prioridade: "media", presenca: true, ativo: true, observacoes: "Plantão — tempo de permanência, não cobra desvio", ...aud },
      { id: "t9", nome_tarefa: "Limpeza concorrente", tipo_tarefa: "Limpeza concorrente", categoria_id: "c1", local_id: "l7", sede_id: "sede_dt", regra_calculo: "por_m2", tempo_base_min: 1, quantidade: 1, frequencia: "diaria", prioridade: "alta", ativo: true, observacoes: "1 min/m²", ...aud },
      { id: "t10", nome_tarefa: "Higienização de banheiro", tipo_tarefa: "Higienização", categoria_id: "c2", local_id: "l8", sede_id: "sede_dt", regra_calculo: "fixo", tipo_servico: "pesada", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "alta", ativo: true, observacoes: "", ...aud },
      { id: "t11", nome_tarefa: "Limpeza de área externa", tipo_tarefa: "Limpeza externa", categoria_id: "c7", local_id: "l9", sede_id: "sede_dt", regra_calculo: "por_m2", tempo_base_min: 0.4, quantidade: 1, frequencia: "diaria", prioridade: "baixa", ativo: true, observacoes: "0,4 min/m²", ...aud },
      { id: "t14", nome_tarefa: "Café da sede", tipo_tarefa: "Apoio", categoria_id: "c8", local_id: "l5", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 60, quantidade: 1, frequencia: "diaria", prioridade: "alta", critica: true, ativo: true, observacoes: "Não-limpeza: preparar café para toda a sede (tempo fixo, sem fator de ambiente)", ...aud },
      { id: "t15", nome_tarefa: "Recolhimento de materiais", tipo_tarefa: "Apoio", categoria_id: "c8", local_id: "l4", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "Não-limpeza: recolher/repor materiais pelos andares", ...aud },
      { id: "t16", nome_tarefa: "Aguação de plantas", tipo_tarefa: "Apoio", categoria_id: "c8", local_id: "l1", sede_id: "sede_aldeota", regra_calculo: "fixo", tempo_base_min: 15, quantidade: 1, frequencia: "diaria", prioridade: "baixa", ativo: true, observacoes: "Não-limpeza: regar plantas da recepção/entrada", ...aud },
      { id: "christus_t1", nome_tarefa: "Varrer a frente da escola entrada da portaria 013na frente da capela.", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 55, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t2", nome_tarefa: "Recolher café do CPA (Financeiro/Lojinha)", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t3", nome_tarefa: "Varrer corredor (Idiomas: Finaceiro/Lojinha)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t4", nome_tarefa: "Lavar os banheiros Masc e Fem do corredor (Idiomas: Finaceiro/Lojinha)", tipo_tarefa: "Rota", categoria_id: "c2", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", tipo_servico: "pesada", requisitos: "rq3,rq4,rq5", ativo: true, observacoes: "", ...aud },
      { id: "christus_t5", nome_tarefa: "Limpeza do vestuário (Lojinha)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t6", nome_tarefa: "Limpeza dos estoques (Lojinha)", tipo_tarefa: "Rota", categoria_id: "c4", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t7", nome_tarefa: "Limpeza do WC (Lojinha)", tipo_tarefa: "Rota", categoria_id: "c2", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 15, quantidade: 1, frequencia: "diaria", prioridade: "media", tipo_servico: "pesada", requisitos: "rq3,rq4,rq5", ativo: true, observacoes: "", ...aud },
      { id: "christus_t8", nome_tarefa: "Limpeza da copa (Lojinha) (Lavar louça)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 25, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3,rq4,rq5", ativo: true, observacoes: "", ...aud },
      { id: "christus_t9", nome_tarefa: "Limpeza da sala de atendimento (Lojinha)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t10", nome_tarefa: "Limpeza (Financeiro)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t11", nome_tarefa: "Limpeza da copa (Financeiro) (Lavar louça)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3,rq4,rq5", ativo: true, observacoes: "", ...aud },
      { id: "christus_t12", nome_tarefa: "Recolhimento geral das lixeiras externas", tipo_tarefa: "Rota", categoria_id: "c3", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq9,rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t13", nome_tarefa: "Recolher garrafas de café para CPA", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 15, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t14", nome_tarefa: "Varrer a frente da escola", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l1", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 60, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t15", nome_tarefa: "Recolher café do CPA (Pedagógico)", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t16", nome_tarefa: "Limpeza do setor pedagógico da Ed. Infantil", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t17", nome_tarefa: "Limpeza da sala da Raquel Rocha", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 15, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t18", nome_tarefa: "Limpeza dos WCs (Pedagógico)", tipo_tarefa: "Rota", categoria_id: "c2", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", tipo_servico: "pesada", requisitos: "rq3,rq4,rq5", ativo: true, observacoes: "", ...aud },
      { id: "christus_t19", nome_tarefa: "Limpeza dos corredores", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t20", nome_tarefa: "Limpeza das salas de aula (06 salas)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 60, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t21", nome_tarefa: "Limpeza da Capela", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 75, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t22", nome_tarefa: "Acompanhamento dos alunos do Infantil para o Idiomas", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 15, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t23", nome_tarefa: "Recolher garrafas de café para CPA", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t24", nome_tarefa: "Apoio refeitorio do integral DT2", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 55, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t25", nome_tarefa: "Revisar setor pedagógico da Ed. Infantil", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 20, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t26", nome_tarefa: "Revisar WCs (Pedagógico)", tipo_tarefa: "Rota", categoria_id: "c2", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", tipo_servico: "pesada", requisitos: "rq3,rq4,rq5", ativo: true, observacoes: "", ...aud },
      { id: "christus_t27", nome_tarefa: "Limpeza das salas de aula (03 salas)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 45, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t28", nome_tarefa: "Limpeza do Hall e Calçada (Idiomas)", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l2", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t29", nome_tarefa: "Coleta residuos da área interna do colegio", tipo_tarefa: "Rota", categoria_id: "c3", local_id: "christus_l3", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 175, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq9,rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t30", nome_tarefa: "Limpeza da área do gerador", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l3", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 30, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t31", nome_tarefa: "Recolhe os residuos do lumen e da lojinha", tipo_tarefa: "Rota", categoria_id: "c3", local_id: "christus_l3", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 60, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq9,rq3", ativo: true, observacoes: "", ...aud },
      { id: "christus_t32", nome_tarefa: "Retirada da vegetação do estacionamento dos funcionários", tipo_tarefa: "Rota", categoria_id: "c1", local_id: "christus_l3", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 45, quantidade: 1, frequencia: "diaria", prioridade: "media", ativo: true, observacoes: "", ...aud },
      { id: "christus_t33", nome_tarefa: "Disponivel para o serviço de pintura/limpeza de calhas", tipo_tarefa: "Rota", categoria_id: "c8", local_id: "christus_l4", sede_id: "christus_dt", regra_calculo: "fixo", tempo_base_min: 105, quantidade: 1, frequencia: "diaria", prioridade: "media", requisitos: "rq3", presenca: true, ativo: true, observacoes: "", ...aud },
    ],
    rotinas_planejadas: [
      { id: "r1", data: hoje, funcionario_id: "f1", sede_id: "sede_aldeota", tarefa_id: "t1", local_id: "l1", inicio_planejado: "07:00", fim_planejado: "08:30", tempo_previsto_min: 80, tempo_visual_min: 90, blocos_ocupados: 6, status: "planejada", observacao: "", supervisor_id: "u2", criado_em: AGORA, atualizado_em: AGORA },
      { id: "r2", data: hoje, funcionario_id: "f1", sede_id: "sede_aldeota", tarefa_id: "t2", local_id: "l2", inicio_planejado: "08:30", fim_planejado: "09:15", tempo_previsto_min: 45, tempo_visual_min: 45, blocos_ocupados: 3, status: "planejada", observacao: "", supervisor_id: "u2", criado_em: AGORA, atualizado_em: AGORA },
      { id: "r3", data: hoje, funcionario_id: "f2", sede_id: "sede_aldeota", tarefa_id: "t4", local_id: "l4", inicio_planejado: "07:00", fim_planejado: "07:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u2", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r1", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: "06:05", fim_planejado: "07:00", tempo_previsto_min: 55, tempo_visual_min: 55, blocos_ocupados: 4, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r2", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t2", local_id: "christus_l1", inicio_planejado: "07:00", fim_planejado: "07:20", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r3", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t3", local_id: "christus_l1", inicio_planejado: "07:20", fim_planejado: "07:40", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r4", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t4", local_id: "christus_l1", inicio_planejado: "07:40", fim_planejado: "08:10", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r5", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t5", local_id: "christus_l1", inicio_planejado: "08:10", fim_planejado: "08:30", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r6", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t6", local_id: "christus_l1", inicio_planejado: "08:30", fim_planejado: "08:50", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r7", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t7", local_id: "christus_l1", inicio_planejado: "09:15", fim_planejado: "09:30", tempo_previsto_min: 15, tempo_visual_min: 15, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r8", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t8", local_id: "christus_l1", inicio_planejado: "09:30", fim_planejado: "09:55", tempo_previsto_min: 25, tempo_visual_min: 25, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r9", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t9", local_id: "christus_l1", inicio_planejado: "09:55", fim_planejado: "10:15", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r10", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t10", local_id: "christus_l1", inicio_planejado: "10:15", fim_planejado: "10:35", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r11", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t11", local_id: "christus_l1", inicio_planejado: "10:35", fim_planejado: "10:55", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r12", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t12", local_id: "christus_l1", inicio_planejado: "10:55", fim_planejado: "11:15", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r13", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t13", local_id: "christus_l1", inicio_planejado: "11:15", fim_planejado: "11:30", tempo_previsto_min: 15, tempo_visual_min: 15, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r14", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t14", local_id: "christus_l1", inicio_planejado: "13:00", fim_planejado: "14:00", tempo_previsto_min: 60, tempo_visual_min: 60, blocos_ocupados: 4, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r15", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t2", local_id: "christus_l1", inicio_planejado: "14:00", fim_planejado: "14:20", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r16", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t4", local_id: "christus_l1", inicio_planejado: "14:20", fim_planejado: "14:50", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r17", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t7", local_id: "christus_l1", inicio_planejado: "15:15", fim_planejado: "15:30", tempo_previsto_min: 15, tempo_visual_min: 15, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r18", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t12", local_id: "christus_l1", inicio_planejado: "15:30", fim_planejado: "15:50", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r19", data: hoje, funcionario_id: "christus_f1", sede_id: "christus_dt", tarefa_id: "christus_t13", local_id: "christus_l1", inicio_planejado: "15:50", fim_planejado: "16:00", tempo_previsto_min: 10, tempo_visual_min: 10, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r20", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t15", local_id: "christus_l2", inicio_planejado: "07:05", fim_planejado: "07:25", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r21", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t16", local_id: "christus_l2", inicio_planejado: "07:25", fim_planejado: "07:45", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r22", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t17", local_id: "christus_l2", inicio_planejado: "07:45", fim_planejado: "08:00", tempo_previsto_min: 15, tempo_visual_min: 15, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r23", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t18", local_id: "christus_l2", inicio_planejado: "08:00", fim_planejado: "08:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r24", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t19", local_id: "christus_l2", inicio_planejado: "08:30", fim_planejado: "09:00", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r25", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t20", local_id: "christus_l2", inicio_planejado: "09:15", fim_planejado: "10:15", tempo_previsto_min: 60, tempo_visual_min: 60, blocos_ocupados: 4, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r26", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t21", local_id: "christus_l2", inicio_planejado: "10:15", fim_planejado: "11:30", tempo_previsto_min: 75, tempo_visual_min: 75, blocos_ocupados: 5, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r27", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t22", local_id: "christus_l2", inicio_planejado: "11:30", fim_planejado: "11:45", tempo_previsto_min: 15, tempo_visual_min: 15, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r28", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t23", local_id: "christus_l2", inicio_planejado: "11:45", fim_planejado: "12:05", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r29", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t24", local_id: "christus_l2", inicio_planejado: "12:05", fim_planejado: "13:00", tempo_previsto_min: 55, tempo_visual_min: 55, blocos_ocupados: 4, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r30", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t25", local_id: "christus_l2", inicio_planejado: "14:00", fim_planejado: "14:20", tempo_previsto_min: 20, tempo_visual_min: 20, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r31", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t26", local_id: "christus_l2", inicio_planejado: "14:35", fim_planejado: "15:05", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r32", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t27", local_id: "christus_l2", inicio_planejado: "15:05", fim_planejado: "15:50", tempo_previsto_min: 45, tempo_visual_min: 45, blocos_ocupados: 3, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r33", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t28", local_id: "christus_l2", inicio_planejado: "15:50", fim_planejado: "16:20", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r34", data: hoje, funcionario_id: "christus_f2", sede_id: "christus_dt", tarefa_id: "christus_t23", local_id: "christus_l2", inicio_planejado: "16:20", fim_planejado: "16:30", tempo_previsto_min: 10, tempo_visual_min: 10, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r35", data: hoje, funcionario_id: "christus_f3", sede_id: "christus_dt", tarefa_id: "christus_t29", local_id: "christus_l3", inicio_planejado: "06:05", fim_planejado: "09:00", tempo_previsto_min: 175, tempo_visual_min: 175, blocos_ocupados: 12, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r36", data: hoje, funcionario_id: "christus_f3", sede_id: "christus_dt", tarefa_id: "christus_t30", local_id: "christus_l3", inicio_planejado: "09:15", fim_planejado: "09:45", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 2, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r37", data: hoje, funcionario_id: "christus_f3", sede_id: "christus_dt", tarefa_id: "christus_t29", local_id: "christus_l3", inicio_planejado: "09:45", fim_planejado: "11:00", tempo_previsto_min: 75, tempo_visual_min: 75, blocos_ocupados: 5, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r38", data: hoje, funcionario_id: "christus_f3", sede_id: "christus_dt", tarefa_id: "christus_t31", local_id: "christus_l3", inicio_planejado: "12:30", fim_planejado: "13:30", tempo_previsto_min: 60, tempo_visual_min: 60, blocos_ocupados: 4, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r39", data: hoje, funcionario_id: "christus_f3", sede_id: "christus_dt", tarefa_id: "christus_t29", local_id: "christus_l3", inicio_planejado: "13:30", fim_planejado: "15:00", tempo_previsto_min: 90, tempo_visual_min: 90, blocos_ocupados: 6, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r40", data: hoje, funcionario_id: "christus_f3", sede_id: "christus_dt", tarefa_id: "christus_t32", local_id: "christus_l3", inicio_planejado: "15:15", fim_planejado: "16:00", tempo_previsto_min: 45, tempo_visual_min: 45, blocos_ocupados: 3, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r41", data: hoje, funcionario_id: "christus_f4", sede_id: "christus_dt", tarefa_id: "christus_t33", local_id: "christus_l4", inicio_planejado: "07:15", fim_planejado: "09:00", tempo_previsto_min: 105, tempo_visual_min: 105, blocos_ocupados: 7, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r42", data: hoje, funcionario_id: "christus_f4", sede_id: "christus_dt", tarefa_id: "christus_t33", local_id: "christus_l4", inicio_planejado: "09:15", fim_planejado: "11:30", tempo_previsto_min: 135, tempo_visual_min: 135, blocos_ocupados: 9, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r43", data: hoje, funcionario_id: "christus_f4", sede_id: "christus_dt", tarefa_id: "christus_t33", local_id: "christus_l4", inicio_planejado: "13:00", fim_planejado: "15:00", tempo_previsto_min: 120, tempo_visual_min: 120, blocos_ocupados: 8, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
      { id: "christus_r44", data: hoje, funcionario_id: "christus_f4", sede_id: "christus_dt", tarefa_id: "christus_t33", local_id: "christus_l4", inicio_planejado: "15:15", fim_planejado: "17:00", tempo_previsto_min: 105, tempo_visual_min: 105, blocos_ocupados: 7, status: "planejada", observacao: "", supervisor_id: "u1", criado_em: AGORA, atualizado_em: AGORA },
    ],
    execucoes_realizadas: [],
    servicos_eventuais: [
      { id: "e1", sede_id: "sede_aldeota", funcionario_id: "f2", local_id: "l6", categoria_id: "c6", data: hoje, tipo: "eventual", descricao: "Apoio na montagem de evento no auditório", inicio: "14:00", fim: "15:30", tempo_min: 90, observacao: "Demanda pontual da diretoria", supervisor_id: "u2", ...aud },
      { id: "e2", sede_id: "sede_aldeota", funcionario_id: "f1", local_id: "l2", categoria_id: "c2", data: hoje, tipo: "imprevisto", descricao: "Vazamento no banheiro — contenção e limpeza extra", inicio: "", fim: "", tempo_min: 45, observacao: "", supervisor_id: "u2", ...aud },
      { id: "e3", sede_id: "sede_dt", funcionario_id: "f4", local_id: "", categoria_id: "", data: hoje, tipo: "imprevisto", descricao: "Queda de energia — reorganização da rotina", inicio: "", fim: "", tempo_min: 30, observacao: "", supervisor_id: "u2", ...aud },
    ],
    tempos_personalizados: [
      { id: "tp1", funcionario_id: "f1", tarefa_id: "t1", sede_id: "sede_aldeota", tempo_min: 70, observacao: "Mais rápida na recepção", ...aud },
      { id: "tp2", funcionario_id: "f2", tarefa_id: "t1", sede_id: "sede_aldeota", tempo_min: 95, observacao: "", ...aud },
    ],
    qualificacoes_funcionario: [
      { id: "qf1", funcionario_id: "f1", requisito_id: "rq2", sede_id: "sede_aldeota", validade: "", observacao: "Apta a trabalho em altura", ...aud },
      { id: "qf2", funcionario_id: "f1", requisito_id: "rq1", sede_id: "sede_aldeota", validade: "2026-01-01", observacao: "Treinamento vencido — renovar", ...aud },
      { id: "qf3", funcionario_id: "f2", requisito_id: "rq1", sede_id: "sede_aldeota", validade: "2027-12-31", observacao: "", ...aud },
    ],
    modelos_rotina: [],
    historico: [],
    ausencias: [
      { id: "a1", funcionario_id: "f3", sede_id: "sede_aldeota", tipo: "atestado", data_inicio: hoje, data_fim: hoje, observacao: "Atestado médico — exemplo do modo demo", ...aud },
    ],
    periodos_letivos: [
      { id: "pl1", sede_id: "sede_aldeota", nome: "2026.1", data_inicio: "2026-02-02", data_fim: "2026-07-03", dias_semana: "1,2,3,4,5", ativo: true, ...aud },
    ],
    parametros: [
      { id: "p1", chave: "bloco_agenda_min", valor: "15", tipo: "numero", descricao: "Tamanho do bloco/snap da agenda em minutos (15 = granularidade fina)", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p2", chave: "ocupacao_baixa", valor: "60", tipo: "percentual", descricao: "Limite para considerar funcionário subutilizado", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p3", chave: "ocupacao_adequada", valor: "85", tipo: "percentual", descricao: "Limite para considerar ocupação adequada", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p4", chave: "ocupacao_alta", valor: "100", tipo: "percentual", descricao: "Limite para alta ocupação/sobrecarga", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p5", chave: "desvio_justificativa_percentual", valor: "30", tipo: "percentual", descricao: "Percentual de desvio que exige justificativa", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p6", chave: "tolerancia_sobrecarga_min", valor: "0", tipo: "numero", descricao: "Tolerância em minutos antes de marcar sobrecarga", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p7", chave: "tempo_limpeza_m2_recepcao", valor: "1", tipo: "min_por_m2", descricao: "Tempo padrão por m² para limpeza de recepção", sede_id: "sede_aldeota", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p8", chave: "min_execucoes_ajuste", valor: "3", tipo: "numero", descricao: "Mínimo de execuções com tempo real para sugerir ajuste de tempo padrão", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p9", chave: "desvio_ajuste_percentual", valor: "15", tipo: "percentual", descricao: "Desvio mediano que dispara sugestão de ajuste do tempo base", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p10", chave: "folga_minima_percentual", valor: "10", tipo: "percentual", descricao: "Folga reservada da jornada (buffer p/ imprevistos) — ocupação-alvo = 100 − este valor", sede_id: "geral", editavel_por_supervisor: true, ativo: true, ...aud },
      { id: "p11", chave: "deslocamento_min_por_tarefa", valor: "5", tipo: "numero", descricao: "Minutos de deslocamento/transição por tarefa alocada (entra na ocupação)", sede_id: "sede_aldeota", editavel_por_supervisor: true, ativo: true, ...aud },
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
