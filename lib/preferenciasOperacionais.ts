/**
 * Preferências leves para acelerar o uso diário da Agenda.
 *
 * Não são dados operacionais nem fonte de verdade: ficam somente no navegador
 * e sempre são isoladas por usuário + sede. A leitura é defensiva porque o
 * localStorage pode conter uma versão antiga ou ter sido alterado manualmente.
 */

export interface PadraoCadastroRapido {
  tempo: string;
  frequencia: string;
  categoria_id: string;
}

export interface PreferenciasOperacionais {
  favoritas: string[];
  recentes: string[];
  cadastro_rapido?: PadraoCadastroRapido;
}

const TEMPOS_VALIDOS = new Set(["15", "30", "45", "60", "90", "120"]);
const FREQUENCIAS_VALIDAS = new Set([
  "diaria",
  "semanal",
  "quinzenal",
  "mensal",
  "sob_demanda",
]);

const VAZIAS: PreferenciasOperacionais = { favoritas: [], recentes: [] };

function listaDeIds(valor: unknown, limite: number): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((item): item is string => typeof item === "string" && item.length > 0))]
    .slice(0, limite);
}

export function chavePreferenciasOperacionais(usuarioId: string, sedeId: string): string {
  return `orkestria:preferencias-operacionais:v1:${encodeURIComponent(usuarioId)}:${encodeURIComponent(sedeId || "sem-sede")}`;
}

export function interpretarPreferenciasOperacionais(bruto: string | null): PreferenciasOperacionais {
  if (!bruto) return { ...VAZIAS };
  try {
    const valor = JSON.parse(bruto) as Record<string, unknown>;
    const cadastro = valor.cadastro_rapido;
    let cadastroRapido: PadraoCadastroRapido | undefined;
    if (cadastro && typeof cadastro === "object") {
      const objeto = cadastro as Record<string, unknown>;
      const tempo = typeof objeto.tempo === "string" && TEMPOS_VALIDOS.has(objeto.tempo)
        ? objeto.tempo
        : "30";
      const frequencia = typeof objeto.frequencia === "string" && FREQUENCIAS_VALIDAS.has(objeto.frequencia)
        ? objeto.frequencia
        : "diaria";
      const categoriaId = typeof objeto.categoria_id === "string" ? objeto.categoria_id : "";
      cadastroRapido = { tempo, frequencia, categoria_id: categoriaId };
    }
    return {
      favoritas: listaDeIds(valor.favoritas, 50),
      recentes: listaDeIds(valor.recentes, 8),
      ...(cadastroRapido ? { cadastro_rapido: cadastroRapido } : {}),
    };
  } catch {
    return { ...VAZIAS };
  }
}

export function lerPreferenciasOperacionais(chave: string): PreferenciasOperacionais {
  if (typeof window === "undefined") return { ...VAZIAS };
  try {
    return interpretarPreferenciasOperacionais(window.localStorage.getItem(chave));
  } catch {
    return { ...VAZIAS };
  }
}

export function atualizarPreferenciasOperacionais(
  chave: string,
  parcial: Partial<PreferenciasOperacionais>,
): PreferenciasOperacionais {
  const atuais = lerPreferenciasOperacionais(chave);
  const atualizadas = interpretarPreferenciasOperacionais(JSON.stringify({ ...atuais, ...parcial }));
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(chave, JSON.stringify(atualizadas));
    } catch {
      // Navegador sem armazenamento disponível não deve bloquear a operação.
    }
  }
  return atualizadas;
}
