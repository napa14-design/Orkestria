/**
 * Constantes de autenticação compartilhadas com o middleware (Edge runtime) e
 * com o cliente. Aqui não pode entrar nada que dependa de módulo do Node —
 * é por isso que o mínimo da senha mora aqui e não em `lib/senha.ts`.
 */
export const COOKIE_SESSAO = "rf_sessao";

/** Mínimo de caracteres da senha pessoal (validado no servidor, exibido na tela). */
export const MIN_SENHA = 10;
