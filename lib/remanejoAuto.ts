/**
 * Remanejo automático da tarefa crítica de quem faltou (10/11/2026): o texto do
 * aviso e a leitura da marca gravada no bloco. Puro — a Central (servidor) e a
 * Agenda (navegador) dizem a mesma frase.
 */
import type { RemanejoAuto, RotinaPlanejada } from "@/types";

/**
 * A caixa "Qualquer horário" ao abrir a edição de uma tarefa. Caixa que já vem
 * marcada não é escolha (auditoria, 10/11/2026): sem escolha gravada e sem janela,
 * abre desmarcada com `null`, que o servidor não grava — só clicar grava.
 */
export function escolhaDoHorario(t: {
  qualquer_horario?: unknown;
  janela_inicio?: unknown;
  janela_fim?: unknown;
}): boolean | null {
  if (t.qualquer_horario === true) return true;
  if (t.qualquer_horario === false || (t.janela_inicio && t.janela_fim)) return false;
  return null;
}

/** Um remanejo automático, para a tela dizer o que aconteceu. */
export interface AvisoRemanejo {
  rotina_id: string;
  data: string;
  texto: string;
  /** Quando o remanejo aconteceu: com o id, a chave do "Entendi" (sem nome nem ausência). */
  em: string;
}

/** Quem assumiu, de quem era, e o que deixou de fazer. */
export function textoDoRemanejo(a: {
  tarefa: string;
  de: string;
  para: string;
  inicio: string;
  inicioAntes: string;
  cedidas: string[];
}): string {
  const quando = a.inicio !== a.inicioAntes ? ` às ${a.inicio} (era às ${a.inicioAntes})` : ` às ${a.inicio}`;
  const lugar = a.cedidas.length ? ` no lugar de ${a.cedidas.map((c) => `“${c}”`).join(", ")}` : ", num horário livre";
  return `${a.para} assumiu “${a.tarefa}”${quando}, que era de ${a.de} (ausente)${lugar}.`;
}

/** A marca do bloco, ou `null` se não houve remanejo (ou se a marca não se lê). */
export function lerRemanejo(r: Pick<RotinaPlanejada, "remanejo_auto">): RemanejoAuto | null {
  if (!r.remanejo_auto) return null;
  try {
    const m = JSON.parse(r.remanejo_auto) as RemanejoAuto;
    return typeof m?.de === "string" && typeof m.inicio === "string" && Array.isArray(m.cedidas) ? m : null;
  } catch {
    return null;
  }
}

/** A marca do bloco e as anteriores a ela (a mais recente primeiro). */
export function cadeiaDoRemanejo(r: Pick<RotinaPlanejada, "remanejo_auto">): RemanejoAuto[] {
  const cadeia: RemanejoAuto[] = [];
  let atual = lerRemanejo(r);
  // O teto só protege contra marca malformada que aponte para si mesma.
  while (atual && cadeia.length < 20) {
    cadeia.push(atual);
    atual = atual.anterior ? lerRemanejo({ remanejo_auto: atual.anterior }) : null;
  }
  return cadeia;
}

/** Os remanejos automáticos de um dia, já em frase. */
export function avisosDeRemanejo(
  rotinas: Pick<RotinaPlanejada, "id" | "data" | "funcionario_id" | "tarefa_id" | "inicio_planejado" | "remanejo_auto">[],
  nomeDe: (funcionarioId: string) => string,
  tarefaDe: (tarefaId: string) => string,
): AvisoRemanejo[] {
  return rotinas.flatMap((r) => {
    const m = lerRemanejo(r);
    if (!m) return [];
    return [
      {
        rotina_id: r.id,
        data: r.data,
        em: m.em,
        texto: textoDoRemanejo({
          tarefa: tarefaDe(r.tarefa_id),
          de: nomeDe(m.de),
          para: nomeDe(r.funcionario_id),
          inicio: r.inicio_planejado,
          inicioAntes: m.inicio,
          cedidas: m.cedidas.map((c) => c.tarefa_nome),
        }),
      },
    ];
  });
}
