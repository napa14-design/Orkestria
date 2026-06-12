/** Tipos compartilhados entre as entidades do sistema. */

export type Perfil = "administrador" | "supervisor" | "visualizador";

export type Turno = "manha" | "tarde" | "noite" | "integral";

export type TipoLocal =
  | "sala"
  | "banheiro"
  | "corredor"
  | "area_comum"
  | "area_externa"
  | "copa"
  | "escada"
  | "recepcao"
  | "auditorio"
  | "almoxarifado"
  | "outros";

export type RegraCalculo = "fixo" | "por_m2" | "por_unidade" | "manual";

export type Frequencia =
  | "diaria"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "sob_demanda";

export type Prioridade = "alta" | "media" | "baixa";

export type StatusRotina =
  | "planejada"
  | "realizada"
  | "nao_realizada"
  | "remanejada"
  | "cancelada"
  | "pendente";

export type StatusRealizado =
  | "conforme_planejado"
  | "com_atraso"
  | "parcial"
  | "nao_realizada"
  | "remanejada"
  | "cancelada";

export type ClassificacaoOcupacao =
  | "subutilizado"
  | "adequado"
  | "alta_ocupacao"
  | "sobrecarga";

/** Campos de auditoria presentes na maioria das entidades. */
export interface Auditoria {
  criado_por: string;
  criado_em: string; // ISO 8601
  atualizado_por: string;
  atualizado_em: string; // ISO 8601
}

/** Resultado de uma validação de alocação na agenda. */
export interface AlertaValidacao {
  /** "erro" bloqueia a operação; "alerta" apenas avisa. */
  nivel: "erro" | "alerta";
  codigo: string;
  mensagem: string;
}
