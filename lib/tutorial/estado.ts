/**
 * Estado do tutorial para uma pessoa — uma máquina de estados pequena, guardada
 * numa **única coluna** (`usuarios.tutorial_estado`).
 *
 * Poderiam ser três colunas booleanas, mas elas permitiriam combinações sem
 * sentido ("pulado e ativo ao mesmo tempo"). Como estado, cada pessoa está
 * exatamente num lugar, e o texto guardado se lê sozinho no banco.
 *
 * Puro de propósito: quem decide se o convite reaparece é o cliente (que sabe
 * a hora atual do usuário), e o servidor usa as mesmas funções.
 */

export type EstadoTutorial =
  /** Nunca respondeu ao convite — é para quem o modal de boas-vindas existe. */
  | { tipo: "nunca" }
  /** Aceitou: os holofotes abrem sozinhos na primeira visita de cada tela. */
  | { tipo: "ativo" }
  /** "Agora não." Silêncio total até a data; depois o convite volta. */
  | { tipo: "adiado"; ate: string }
  /** "Não quero." Nunca mais pergunta; a volta é pela trilha, se ela quiser. */
  | { tipo: "pulado" };

/** Quanto tempo "Adiar" silencia o convite. */
export const HORAS_ADIAMENTO = 24;

export function lerEstado(bruto?: string): EstadoTutorial {
  const texto = (bruto ?? "").trim();
  if (texto === "ativo") return { tipo: "ativo" };
  if (texto === "pulado") return { tipo: "pulado" };
  if (texto.startsWith("adiado:")) return { tipo: "adiado", ate: texto.slice("adiado:".length) };
  return { tipo: "nunca" };
}

export function escreverEstado(estado: EstadoTutorial): string {
  if (estado.tipo === "adiado") return `adiado:${estado.ate}`;
  if (estado.tipo === "nunca") return "";
  return estado.tipo;
}

/** Adiamento vencido volta a valer como "nunca respondeu". */
function adiamentoVencido(estado: EstadoTutorial, agora: Date): boolean {
  if (estado.tipo !== "adiado") return false;
  const ate = new Date(estado.ate);
  return Number.isNaN(ate.getTime()) || ate.getTime() <= agora.getTime();
}

/** Mostrar o convite de boas-vindas? Só para quem ainda não começou nada. */
export function deveConvidar(
  estado: EstadoTutorial,
  etapasConcluidas: number,
  agora = new Date(),
): boolean {
  if (etapasConcluidas > 0) return false;
  if (estado.tipo === "nunca") return true;
  return adiamentoVencido(estado, agora);
}

/**
 * Abrir os holofotes sozinho ao entrar numa tela?
 *
 * Só depois de a pessoa dizer "quero ver". Quem adiou ou pulou não é
 * perseguido pelas telas — insistir com quem recusou é o caminho mais curto
 * para o tutorial virar estorvo.
 */
export function podeAutoIniciar(estado: EstadoTutorial, etapasConcluidas: number): boolean {
  if (estado.tipo === "ativo") return true;
  // Quem já concluiu alguma etapa está no meio da trilha: segue guiado.
  return estado.tipo === "nunca" && etapasConcluidas > 0;
}
