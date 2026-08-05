import type { Perfil } from "./comum";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /**
   * Sede principal — é ela que abre por padrão nas telas. "geral" para
   * administradores/gerência com acesso a todas as sedes.
   */
  sede_id: string;
  /**
   * Sedes adicionais que o supervisor também opera, além da principal:
   * **ids separadas por vírgula** (o schema do Sheets só guarda escalares).
   * Vazio/ausente = opera somente `sede_id`, que é o comportamento histórico.
   * Irrelevante quando `sede_id === "geral"` (já alcança todas).
   */
  sedes_extra?: string;
  /**
   * Hash scrypt da senha individual ("salt:hash"). Ausente = usuário ainda usa
   * a senha única (ACCESS_PASSWORD) como bootstrap. Nunca é enviado ao cliente.
   */
  senha_hash?: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

/**
 * Como a API devolve o usuário para as telas: sem o hash e com o indicador de
 * senha definida.
 *
 * É um tipo separado de propósito — o indicador é **calculado**, e se morasse
 * em `Usuario` corria o risco de ser gravado no banco junto num update.
 */
export interface UsuarioListado extends Omit<Usuario, "senha_hash"> {
  /** `false` = ainda não fez o primeiro acesso (entra com a senha compartilhada). */
  senha_definida: boolean;
}
