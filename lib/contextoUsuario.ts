/**
 * Contexto do usuário da requisição atual (AsyncLocalStorage).
 *
 * `comSessao` (lib/api.ts) registra o e-mail do usuário aqui; o decorator de
 * histórico (lib/historico.ts) o lê na hora de gravar quem fez cada alteração
 * — sem precisar passar o autor por todas as camadas.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<string>();

export function executarComUsuario<T>(email: string, fn: () => Promise<T>): Promise<T> {
  return als.run(email, fn);
}

export function usuarioAtual(): string {
  return als.getStore() ?? "sistema";
}
