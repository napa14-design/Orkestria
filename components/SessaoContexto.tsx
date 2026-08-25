"use client";

import { createContext, useContext } from "react";
import type { SessaoUsuario } from "@/lib/permissions";

/**
 * A sessão disponível para os componentes de tela.
 *
 * Existe por um motivo específico: a tela não pode oferecer o que o servidor
 * vai recusar. Antes de 24/08/2026 só o `AppShell` conhecia o perfil, e o
 * `CrudManager` mostrava "Editar"/"Excluir" para todo mundo — quem não tinha
 * permissão clicava e levava 403. É o mesmo defeito que a coluna "Supervisor
 * edita?" dos parâmetros tinha de manhã: o botão prometia o que a regra negava.
 *
 * `null` fora do `AppShell` (login, páginas públicas) — quem consome trata a
 * ausência como "sem restrição conhecida", nunca como "pode tudo".
 */
const SessaoContexto = createContext<SessaoUsuario | null>(null);

export function ProvedorSessao({
  sessao,
  children,
}: {
  sessao: SessaoUsuario;
  children: React.ReactNode;
}) {
  return <SessaoContexto.Provider value={sessao}>{children}</SessaoContexto.Provider>;
}

export function useSessao(): SessaoUsuario | null {
  return useContext(SessaoContexto);
}
