import type { Auditoria, Escala, Turno } from "./comum";

export interface Funcionario extends Auditoria {
  id: string;
  nome: string;
  genero: string;
  sede_id: string;
  turno: Turno;
  /** Formato HH:mm — horário padrão (segunda a sexta). */
  entrada: string;
  /** Formato HH:mm */
  saida: string;
  intervalo_min: number;
  /** Formato HH:mm — almoço principal (compatibilidade) */
  intervalo_inicio: string;
  /** Formato HH:mm */
  intervalo_fim: string;
  /**
   * Vários intervalos do dia (lanches + almoço), CSV de pares "HH:mm-HH:mm"
   * separados por ";" (ex.: "09:00-09:15;11:30-13:00;15:00-15:15"). Quando
   * presente, substitui o intervalo único nos cálculos e na agenda.
   */
  intervalos?: string;
  /** Dias da semana trabalhados. Ausente/"" = seg_sex. */
  escala?: Escala;
  /** Horário só de sábado (ex.: turno de 4h). Vazio = usa o padrão. HH:mm */
  entrada_sabado?: string;
  saida_sabado?: string;
  cargo: string;
  ativo: boolean;
  observacoes: string;
}
