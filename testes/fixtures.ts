/**
 * Objetos mínimos para os testes das funções puras.
 *
 * Fábricas com `parcial` em vez de constantes: cada teste diz só o que importa
 * para ele, e o resto fica igual — quem lê o teste vê a diferença, não o ruído.
 */
import type { Funcionario, Local, RotinaPlanejada, Tarefa } from "@/types";

const auditoria = {
  criado_por: "teste",
  criado_em: "2026-01-01T00:00:00.000Z",
  atualizado_por: "teste",
  atualizado_em: "2026-01-01T00:00:00.000Z",
};

/** Jornada 06:00–16:00 com 1h de almoço → 540 min líquidos. */
export function funcionario(parcial: Partial<Funcionario> = {}): Funcionario {
  return {
    id: "f1",
    nome: "Cristina",
    genero: "feminino",
    sede_id: "aldeota",
    turno: "manha",
    entrada: "06:00",
    saida: "16:00",
    intervalo_min: 60,
    intervalo_inicio: "11:30",
    intervalo_fim: "12:30",
    cargo: "ASG",
    ativo: true,
    observacoes: "",
    ...auditoria,
    ...parcial,
  };
}

export function local(parcial: Partial<Local> = {}): Local {
  return {
    id: "l1",
    sede_id: "aldeota",
    andar: "Térreo",
    nome_local: "Sala ADM",
    tipo_local: "sala",
    metragem: 50,
    ativo: true,
    observacoes: "",
    ...auditoria,
    ...parcial,
  };
}

export function tarefa(parcial: Partial<Tarefa> = {}): Tarefa {
  return {
    id: "t1",
    nome_tarefa: "Limpar",
    tipo_tarefa: "",
    categoria_id: "",
    local_id: "l1",
    sede_id: "aldeota",
    regra_calculo: "fixo",
    tipo_servico: "rotina",
    tempo_base_min: 30,
    quantidade: 1,
    frequencia: "diaria",
    prioridade: "media",
    restricao_genero: "",
    tempo_referencia: false,
    presenca: false,
    critica: false,
    requisitos: "",
    janela_inicio: "",
    janela_fim: "",
    dias_semana: "",
    depende_calendario: false,
    ativo: true,
    observacoes: "",
    ...auditoria,
    ...parcial,
  };
}

export function rotina(parcial: Partial<RotinaPlanejada> = {}): RotinaPlanejada {
  return {
    id: "r1",
    data: "2026-08-10",
    funcionario_id: "f1",
    sede_id: "aldeota",
    tarefa_id: "t1",
    local_id: "l1",
    inicio_planejado: "08:00",
    fim_planejado: "08:30",
    tempo_previsto_min: 30,
    tempo_visual_min: 30,
    blocos_ocupados: 1,
    status: "planejada",
    observacao: "",
    supervisor_id: "u1",
    criado_em: auditoria.criado_em,
    atualizado_em: auditoria.atualizado_em,
    ...parcial,
  };
}
