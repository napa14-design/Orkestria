import type { Perfil } from "./comum";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /** "geral" para administradores/gerência com acesso a todas as sedes. */
  sede_id: string;
  /**
   * Hash scrypt da senha individual ("salt:hash"). Ausente = usuário ainda usa
   * a senha única (ACCESS_PASSWORD) como bootstrap. Nunca é enviado ao cliente.
   */
  senha_hash?: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
