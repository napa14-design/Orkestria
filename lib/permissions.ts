/**
 * Regras de permissão por perfil.
 *
 * administrador → tudo, em todas as sedes.
 * coordenador   → cadastros e rotinas apenas das sedes que ele opera (a
 *                 principal e, quando houver, as adicionais); parâmetros
 *                 apenas quando marcados como editavel_por_supervisor (nome de
 *                 coluna antigo — vale para o coordenador). Até 19/10/2026 este
 *                 perfil se chamava "supervisor".
 * supervisor    → (perfil novo, 19/10/2026) quem acompanha a equipe no chão: vê
 *                 a rota e marca as tarefas como feitas ou não, SÓ nas sedes
 *                 dele — nunca "todas", nem com sede principal "geral". Não
 *                 escreve mais nada.
 * visualizador  → somente leitura (dashboards e relatórios), todas as sedes.
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

const PERFIS_CONHECIDOS: ReadonlySet<unknown> = new Set<Perfil>([
  "administrador",
  "coordenador",
  "supervisor",
  "visualizador",
]);

/**
 * O login só cria sessão para perfil conhecido. Um valor estranho no banco
 * (digitação, edição manual no Console, migração errada) não vira acesso
 * nenhum — nem à própria sede (revisão de segurança, 19/10/2026).
 */
export function perfilConhecido(perfil: unknown): perfil is Perfil {
  return PERFIS_CONHECIDOS.has(perfil);
}

/** Cadastros, rotinas, agenda: o que muda o PLANEJADO. */
export function podeEscrever(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador" || sessao.perfil === "coordenador";
}

/**
 * Registrar o REALIZADO (feita / não feita, fechar o dia): o que o supervisor
 * novo faz. Sozinho não basta — a rota ainda confere a sede com `podeAlterarSede`.
 */
export function podeRegistrarRealizado(sessao: SessaoUsuario): boolean {
  return podeEscrever(sessao) || sessao.perfil === "supervisor";
}

/**
 * Quem lê o dado pessoal inteiro (motivo de desligamento, tipo da ausência,
 * observações) e imprime ficha. Lista POSITIVA: um perfil futuro começa
 * mascarado, não aberto (revisão de segurança, 19/10/2026).
 */
export function leituraCompleta(sessao: SessaoUsuario): boolean {
  return (
    sessao.perfil === "administrador" ||
    sessao.perfil === "coordenador" ||
    sessao.perfil === "visualizador"
  );
}

/**
 * Lista POSITIVA de quem vê todas as sedes. Era `perfil !== "supervisor"`, e um
 * perfil desconhecido no banco (erro de digitação, edição manual no Console)
 * caía em "todas" — falha abrindo (revisão, 19/10/2026). Agora o desconhecido
 * não vê sede nenhuma. O supervisor (perfil de chão) nunca vê "todas".
 */
export function acessaTodasAsSedes(sessao: SessaoUsuario): boolean {
  return (
    sessao.perfil === "administrador" ||
    sessao.perfil === "visualizador" ||
    (sessao.perfil === "coordenador" && sessao.sede_id === "geral")
  );
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

/**
 * Coordenador e supervisor só mexem em registros das sedes que operam. (Para o
 * supervisor, "mexer" é só registrar o realizado — o resto `podeEscrever` barra.)
 */
export function podeAlterarSede(sessao: SessaoUsuario, sedeId: string): boolean {
  if (sessao.perfil === "administrador") return true;
  if (sessao.perfil === "coordenador" || sessao.perfil === "supervisor") {
    const permitidas = sedesPermitidas(sessao);
    return !permitidas || permitidas.includes(sedeId);
  }
  return false;
}

/**
 * Chaves que o supervisor não altera, mesmo marcadas como editáveis.
 *
 * Estas três são a RÉGUA que mede a operação do próprio supervisor: os 121% da
 * CESIU só são sobrecarga porque `ocupacao_alta` vale 100. Deixar quem é medido
 * mexer no medidor apaga o diagnóstico sem apagar o problema — e ninguém
 * conseguiria distinguir depois "a sede melhorou" de "alguém subiu a régua".
 *
 * É regra de código, e não a flag `editavel_por_supervisor` do banco, de
 * propósito: a flag é dado, e dado se edita. A regra precisa morar num lugar
 * que a própria tela de parâmetros não alcance.
 */
export const CHAVES_SO_ADMINISTRADOR = new Set([
  "ocupacao_baixa",
  "ocupacao_adequada",
  "ocupacao_alta",
]);

export function podeEditarParametro(
  sessao: SessaoUsuario,
  parametro: { chave: string; editavel_por_supervisor: boolean; sede_id: string },
): boolean {
  if (sessao.perfil === "administrador") return true;
  if (sessao.perfil !== "coordenador") return false;
  if (CHAVES_SO_ADMINISTRADOR.has(parametro.chave)) return false;
  if (!parametro.editavel_por_supervisor) return false;
  return parametro.sede_id === "geral" || podeAlterarSede(sessao, parametro.sede_id);
}

export function podeGerenciarUsuarios(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador";
}

/**
 * Catálogo global (tipos de local, categorias, requisitos): **criar é aditivo,
 * editar é que afeta todo mundo.**
 *
 * Até 24/08/2026 os três eram só de administrador, e a medição mostrou o
 * absurdo: o sistema tem **2 usuários**, e quem opera o piloto é uma
 * **supervisora** — ou seja, a única pessoa que usa o sistema não podia
 * cadastrar o tipo de ambiente da própria sede. O atalho "+ novo" que nasceu
 * para poupar passos dava 403 justamente para ela.
 *
 * A separação segue o risco real, não o cargo:
 *  - **criar** acrescenta uma opção e não mexe em nenhum registro existente;
 *  - **editar** um item compartilhado muda o cálculo das **18 sedes** (subir o
 *    fator do "banheiro" reprecifica a rede inteira);
 *  - **excluir** já é bloqueado quando há alguém usando.
 */
export function podeCriarNoCatalogo(sessao: SessaoUsuario): boolean {
  return podeEscrever(sessao);
}

/**
 * Editar/excluir item do catálogo: administrador sempre; supervisor **só o que
 * ele mesmo criou**.
 *
 * Sem isso, quem criasse um tipo com o nome errado não poderia corrigir — e a
 * regra segue segura, porque os itens que vieram semeados (os 12 tipos, as 8
 * categorias, os 17 requisitos) têm outro autor e continuam intocáveis.
 */
export function podeEditarItemDoCatalogo(
  sessao: SessaoUsuario,
  item: { criado_por?: string } | null | undefined,
): boolean {
  if (sessao.perfil === "administrador") return true;
  if (sessao.perfil !== "coordenador") return false;
  return Boolean(item?.criado_por) && item?.criado_por === sessao.email;
}

/** Catálogo global — gestão ampla (a tela inteira) segue de administrador. */
export function podeGerenciarCatalogo(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador";
}

/** Transparência executiva: administração e gerência, nunca operação local. */
export function podeVerEvolucaoProduto(sessao: SessaoUsuario): boolean {
  return sessao.perfil === "administrador" || sessao.perfil === "visualizador";
}
