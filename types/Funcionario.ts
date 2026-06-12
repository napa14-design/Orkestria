import type { Auditoria, Turno } from "./comum";

export interface Funcionario extends Auditoria {
  id: string;
  nome: string;
  genero: string;
  sede_id: string;
  turno: Turno;
  /** Formato HH:mm */
  entrada: string;
  /** Formato HH:mm */
  saida: string;
  intervalo_min: number;
  /** Formato HH:mm */
  intervalo_inicio: string;
  /** Formato HH:mm */
  intervalo_fim: string;
  cargo: string;
  ativo: boolean;
  observacoes: string;
}
