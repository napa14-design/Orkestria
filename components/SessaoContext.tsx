"use client";

import { createContext, useContext } from "react";
import type { SessaoUsuario } from "@/lib/permissions";

const SessaoContext = createContext<SessaoUsuario | null>(null);

export function SessaoProvider({
  sessao,
  children,
}: {
  sessao: SessaoUsuario;
  children: React.ReactNode;
}) {
  return <SessaoContext.Provider value={sessao}>{children}</SessaoContext.Provider>;
}

export function useSessao(): SessaoUsuario {
  const sessao = useContext(SessaoContext);
  if (!sessao) throw new Error("useSessao deve ser usado dentro de SessaoProvider.");
  return sessao;
}
