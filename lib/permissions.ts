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

/**
 * Escopo obrigatório das consultas de leitura.
 *
 * Um supervisor comum nunca amplia a própria sede omitindo `?sede=` nem
 * trocando o parâmetro manualmente. Administrador, visualizador e o supervisor
 * explicitamente configurado como `geral` preservam o filtro solicitado.
 */
export function limitarSedeConsulta(
  sessao: SessaoUsuario,
  sedeSolicitada?: string,
): string | undefined {
  if (sessao.perfil === "supervisor" && sessao.sede_id !== "geral") {
    return sessao.sede_id;
  }
  return sedeSolicitada;
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

/** Catálogo global (categorias) afeta todas as sedes → só administrador edita. */
export function podeGerenciarCatalogo(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador";
}

/** Transparência executiva: administração e gerência, nunca operação local. */
export function podeVerEvolucaoProduto(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador" || sessao.perfil === "visualizador";
}
