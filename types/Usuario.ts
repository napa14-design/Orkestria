import type { Perfil } from "./comum";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /** "geral" para administradores/gerência com acesso a todas as sedes. */
  sede_id: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
