import type { Frequencia, Prioridade, TipoLocal } from "@/types";

export interface ItemKitTarefa {
  id: string;
  nome: string;
  descricao: string;
  tempo_base_min: number;
  frequencia: Frequencia;
  prioridade: Prioridade;
  critica?: boolean;
  categoria_sugerida: string;
}

const COLETA: ItemKitTarefa = {
  id: "coleta-residuos",
  nome: "Coleta de resíduos",
  descricao: "Recolher lixeiras e encaminhar os resíduos.",
  tempo_base_min: 15,
  frequencia: "diaria",
  prioridade: "media",
  categoria_sugerida: "Coleta",
};

const KITS: Record<TipoLocal, ItemKitTarefa[]> = {
  sala: [
    { id: "limpeza-sala", nome: "Limpeza do ambiente", descricao: "Organizar, retirar pó e limpar piso e superfícies.", tempo_base_min: 30, frequencia: "diaria", prioridade: "media", categoria_sugerida: "Higienização" },
    COLETA,
    { id: "limpeza-detalhada-sala", nome: "Limpeza detalhada", descricao: "Reforço em mobiliário, rodapés e pontos de contato.", tempo_base_min: 45, frequencia: "semanal", prioridade: "baixa", categoria_sugerida: "Limpeza pesada" },
  ],
  banheiro: [
    { id: "higienizacao-banheiro", nome: "Higienização do banheiro", descricao: "Louças, piso, superfícies e pontos de contato.", tempo_base_min: 30, frequencia: "diaria", prioridade: "alta", critica: true, categoria_sugerida: "Higienização" },
    { id: "reposicao-banheiro", nome: "Reposição de insumos", descricao: "Conferir e repor papel, sabonete e demais consumíveis.", tempo_base_min: 15, frequencia: "diaria", prioridade: "alta", critica: true, categoria_sugerida: "Reposição" },
    COLETA,
    { id: "limpeza-pesada-banheiro", nome: "Limpeza pesada do banheiro", descricao: "Desincrustação e detalhamento do ambiente.", tempo_base_min: 60, frequencia: "semanal", prioridade: "media", categoria_sugerida: "Limpeza pesada" },
  ],
  corredor: [
    { id: "limpeza-corredor", nome: "Limpeza do corredor", descricao: "Varrer, retirar marcas e limpar o piso.", tempo_base_min: 30, frequencia: "diaria", prioridade: "media", categoria_sugerida: "Higienização" },
    COLETA,
  ],
  area_comum: [
    { id: "limpeza-area-comum", nome: "Limpeza da área comum", descricao: "Piso, mobiliário e pontos de contato do ambiente.", tempo_base_min: 30, frequencia: "diaria", prioridade: "media", categoria_sugerida: "Higienização" },
    COLETA,
    { id: "detalhamento-area-comum", nome: "Detalhamento da área comum", descricao: "Rodapés, cantos, vidros baixos e mobiliário.", tempo_base_min: 45, frequencia: "semanal", prioridade: "baixa", categoria_sugerida: "Limpeza pesada" },
  ],
  area_externa: [
    { id: "varricao-area-externa", nome: "Varrição da área externa", descricao: "Remover folhas, areia e resíduos do percurso.", tempo_base_min: 45, frequencia: "diaria", prioridade: "media", categoria_sugerida: "Conservação" },
    COLETA,
    { id: "lavagem-area-externa", nome: "Lavagem da área externa", descricao: "Lavagem programada de piso e pontos críticos.", tempo_base_min: 90, frequencia: "semanal", prioridade: "baixa", categoria_sugerida: "Limpeza pesada" },
  ],
  copa: [
    { id: "higienizacao-copa", nome: "Higienização da copa", descricao: "Bancadas, pia, piso e pontos de contato.", tempo_base_min: 30, frequencia: "diaria", prioridade: "alta", critica: true, categoria_sugerida: "Higienização" },
    { id: "reposicao-copa", nome: "Reposição da copa", descricao: "Conferir materiais e insumos de uso diário.", tempo_base_min: 15, frequencia: "diaria", prioridade: "media", categoria_sugerida: "Reposição" },
    COLETA,
  ],
  escada: [
    { id: "limpeza-escada", nome: "Limpeza da escada", descricao: "Degraus, corrimãos, patamares e cantos.", tempo_base_min: 30, frequencia: "diaria", prioridade: "media", categoria_sugerida: "Higienização" },
    { id: "detalhamento-escada", nome: "Detalhamento da escada", descricao: "Rodapés, quinas e marcas de maior aderência.", tempo_base_min: 45, frequencia: "semanal", prioridade: "baixa", categoria_sugerida: "Limpeza pesada" },
  ],
  recepcao: [
    { id: "limpeza-recepcao", nome: "Limpeza da recepção", descricao: "Piso, balcões, mobiliário e pontos de contato.", tempo_base_min: 30, frequencia: "diaria", prioridade: "alta", critica: true, categoria_sugerida: "Higienização" },
    COLETA,
    { id: "vidros-recepcao", nome: "Limpeza de vidros e portas", descricao: "Remover marcas em portas, divisórias e vidros acessíveis.", tempo_base_min: 30, frequencia: "semanal", prioridade: "media", categoria_sugerida: "Vidros" },
  ],
  auditorio: [
    { id: "limpeza-auditorio", nome: "Limpeza do auditório", descricao: "Piso, assentos, palco e pontos de contato.", tempo_base_min: 60, frequencia: "sob_demanda", prioridade: "media", categoria_sugerida: "Higienização" },
    COLETA,
    { id: "preparacao-auditorio", nome: "Preparação do auditório", descricao: "Organizar o ambiente antes ou depois de eventos.", tempo_base_min: 45, frequencia: "sob_demanda", prioridade: "alta", categoria_sugerida: "Apoio a eventos" },
  ],
  almoxarifado: [
    { id: "limpeza-almoxarifado", nome: "Limpeza do almoxarifado", descricao: "Piso, superfícies livres e áreas de circulação.", tempo_base_min: 30, frequencia: "semanal", prioridade: "baixa", categoria_sugerida: "Higienização" },
    COLETA,
  ],
  outros: [
    { id: "limpeza-ambiente", nome: "Limpeza do ambiente", descricao: "Rotina geral de conservação do local.", tempo_base_min: 30, frequencia: "diaria", prioridade: "media", categoria_sugerida: "Higienização" },
    COLETA,
  ],
};

export function kitTarefasPorTipo(tipo: TipoLocal): ItemKitTarefa[] {
  return KITS[tipo] ?? KITS.outros;
}
