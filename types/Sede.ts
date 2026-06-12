import type { Auditoria } from "./comum";

export interface Sede extends Auditoria {
  id: string;
  nome_sede: string;
  cidade: string;
  endereco: string;
  ativo: boolean;
}
