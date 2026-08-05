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
   * Hash scrypt da senha individual ("salt:hash"). Ausente = a pessoa ainda não
   * fez o primeiro acesso e entra pelo código. Nunca é enviado ao cliente.
   */
  senha_hash?: string;
  /**
   * Hash scrypt do código de primeiro acesso. Gerado pelo administrador e
   * mostrado **uma única vez** a ele; some quando a senha é criada. Nunca é
   * enviado ao cliente.
   */
  convite_hash?: string;
  /** Data-hora ISO em que o código de primeiro acesso deixa de valer. */
  convite_expira_em?: string;
  /**
   * Etapas da trilha de aprendizado já concluídas — **ids separados por
   * vírgula**. Vazio = a pessoa ainda não fez nada. A primeira etapa que não
   * está aqui é onde ela parou: é assim que se enxerga quem travou e onde.
   */
  tutorial_concluido?: string;
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
export interface UsuarioListado
  extends Omit<Usuario, "senha_hash" | "convite_hash"> {
  /** `false` = ainda não fez o primeiro acesso. */
  senha_definida: boolean;
  /** Tem código de primeiro acesso gerado e dentro da validade. */
  convite_valido: boolean;
  /** Tem código, mas venceu — precisa de um novo. */
  convite_expirado: boolean;
}
