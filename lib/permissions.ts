/**
 * Regras de permissão por perfil.
 *
 * administrador → tudo, em todas as sedes.
 * supervisor    → cadastros e rotinas apenas da própria sede; parâmetros
 *                 apenas quando marcados como editavel_por_supervisor.
 * visualizador  → somente leitura (dashboards e relatórios).
 */
import type { Perfil } from "@/types";

export interface SessaoUsuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  sede_id: string; // "geral" = todas as sedes
}

export function podeEscrever(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador" || sessao.perfil === "supervisor";
}

export function acessaTodasAsSedes(sessao: SessaoUsuario): boolean {
  return sessao.perfil !== "supervisor" || sessao.sede_id === "geral";
}

/** Supervisor só altera registros da própria sede. */
export function podeAlterarSede(sessao: SessaoUsuario, sedeId: string): boolean {
  if (sessao.perfil === "administrador") return true;
  if (sessao.perfil === "supervisor")
    return sessao.sede_id === "geral" || sessao.sede_id === sedeId;
  return false;
}

export function podeEditarParametro(
  sessao: SessaoUsuario,
  editavelPorSupervisor: boolean,
  sedeIdParametro: string,
): boolean {
  if (sessao.perfil === "administrador") return true;
  if (sessao.perfil !== "supervisor") return false;
  if (!editavelPorSupervisor) return false;
  return sedeIdParametro === "geral" || podeAlterarSede(sessao, sedeIdParametro);
}

export function podeGerenciarUsuarios(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador";
}
