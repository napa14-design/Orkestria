/** Contexto efêmero da agenda, mantido apenas na sessão atual do navegador. */
export interface ContextoAgendaPersistido {
  salvo_em: number;
  data: string;
  turno: string;
  modo: "dia" | "semana";
  busca_funcionario: string;
  pagina_funcionario: number;
  funcionario_selecionado: string | null;
  tarefa_rapida_id: string | null;
  grade_densa: boolean;
  modo_foco: boolean;
}

export const CHAVE_CONTEXTO_AGENDA = "orkestria:agenda:contexto-v1";
export const VALIDADE_CONTEXTO_MS = 12 * 60 * 60 * 1000;

/** Desserializa e rejeita contexto antigo ou estruturalmente inválido. */
export function lerContextoAgenda(
  bruto: string | null,
  agora = Date.now(),
): Partial<ContextoAgendaPersistido> | null {
  if (!bruto) return null;
  try {
    const contexto = JSON.parse(bruto) as Partial<ContextoAgendaPersistido>;
    const vigente =
      typeof contexto.salvo_em === "number" &&
      agora - contexto.salvo_em >= 0 &&
      agora - contexto.salvo_em <= VALIDADE_CONTEXTO_MS;
    if (!vigente) return null;
    return contexto;
  } catch {
    return null;
  }
}
