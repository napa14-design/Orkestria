/**
 * Quantas pessoas por unidade (pedido da operação, 25/11/2026). Puro: conta o que a tela de
 * Funcionários já carregou. Quem já saiu (desligado, transferido) e o posto vago não contam; quem está em
 * aviso prévio conta até a data; ausência (férias, afastamento) não tira ninguém do quadro.
 */
import type { Funcionario, Sede } from "@/types";

export interface EquipeDaSede {
  sede_id: string;
  nome: string;
  ativos: number;
  /** Na unidade, incluindo quem está marcado Inativo sem ter sido desligado. */
  total: number;
}

export interface ResumoEquipe {
  porSede: EquipeDaSede[];
  ativos: number;
  total: number;
}

export function resumoEquipe(
  equipe: Pick<Funcionario, "sede_id" | "ativo" | "desligado_em">[],
  sedes: Pick<Sede, "id" | "nome_sede">[],
  hoje: string,
): ResumoEquipe {
  const porId = new Map<string, EquipeDaSede>();
  for (const f of equipe) {
    if (f.desligado_em && f.desligado_em <= hoje) continue;
    if (!porId.has(f.sede_id))
      porId.set(f.sede_id, { sede_id: f.sede_id, nome: sedes.find((s) => s.id === f.sede_id)?.nome_sede ?? f.sede_id, ativos: 0, total: 0 });
    const s = porId.get(f.sede_id)!;
    s.total++;
    if (f.ativo !== false) s.ativos++;
  }
  const porSede = [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return {
    porSede,
    ativos: porSede.reduce((n, s) => n + s.ativos, 0),
    total: porSede.reduce((n, s) => n + s.total, 0),
  };
}
