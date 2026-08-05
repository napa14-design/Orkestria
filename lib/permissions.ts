/**
 * Regras de permissão por perfil.
 *
 * administrador → tudo, em todas as sedes.
 * supervisor    → cadastros e rotinas apenas das sedes que ele opera (a
 *                 principal e, quando houver, as adicionais); parâmetros
 *                 apenas quando marcados como editavel_por_supervisor.
 * visualizador  → somente leitura (dashboards e relatórios).
 */
import type { Perfil } from "@/types";

export interface SessaoUsuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Sede principal — abre por padrão nas telas. "geral" = todas as sedes. */
  sede_id: string;
  /**
   * Todas as sedes que a sessão opera, **incluindo a principal**, montada no
   * login a partir de `sede_id` + `sedes_extra`. Ausente em cookies emitidos
   * antes deste campo existir: nesse caso o escopo cai em `[sede_id]`, que é
   * o comportamento histórico — ou seja, falha fechando, nunca abrindo.
   */
  sedes?: string[];
}

export function podeEscrever(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador" || sessao.perfil === "supervisor";
}

export function acessaTodasAsSedes(sessao: SessaoUsuario): boolean {
  return sessao.perfil !== "supervisor" || sessao.sede_id === "geral";
}

/** Lê a coluna `sedes_extra` (ids separadas por vírgula) do cadastro. */
export function lerSedesExtra(csv?: string): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Monta a lista de sedes da sessão a partir do cadastro do usuário. */
export function montarSedesDaSessao(sedeId: string, sedesExtra?: string): string[] {
  if (sedeId === "geral") return [];
  return [...new Set([sedeId, ...lerSedesExtra(sedesExtra)])];
}

/**
 * Sedes que a sessão alcança. `null` = sem restrição (todas).
 *
 * Nunca devolve lista vazia para quem tem escopo: sem `sedes` no cookie, cai
 * na sede principal.
 */
export function sedesPermitidas(sessao: SessaoUsuario): string[] | null {
  if (acessaTodasAsSedes(sessao)) return null;
  return sessao.sedes?.length ? sessao.sedes : [sessao.sede_id];
}

/**
 * Escopo obrigatório das consultas de leitura.
 *
 * Um supervisor nunca amplia o próprio escopo omitindo `?sede=` nem trocando o
 * parâmetro manualmente: se a sede pedida não está entre as dele, a consulta
 * cai na sede **principal** em vez de virar "todas". Administrador,
 * visualizador e o supervisor `geral` preservam o filtro solicitado.
 *
 * Devolve sempre **uma** sede para quem tem escopo — as telas mostram uma sede
 * por vez, e é isso que mantém cada consulta em um único `where` no Firestore.
 */
export function limitarSedeConsulta(
  sessao: SessaoUsuario,
  sedeSolicitada?: string,
): string | undefined {
  const permitidas = sedesPermitidas(sessao);
  if (!permitidas) return sedeSolicitada;
  if (sedeSolicitada && permitidas.includes(sedeSolicitada)) return sedeSolicitada;
  return sessao.sede_id;
}

/** Supervisor só altera registros das sedes que opera. */
export function podeAlterarSede(sessao: SessaoUsuario, sedeId: string): boolean {
  if (sessao.perfil === "administrador") return true;
  if (sessao.perfil === "supervisor") {
    const permitidas = sedesPermitidas(sessao);
    return !permitidas || permitidas.includes(sedeId);
  }
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
