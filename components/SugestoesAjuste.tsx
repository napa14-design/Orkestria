"use client";

/**
 * Fecha o ciclo previsto → realidade: quando uma tarefa acumula execuções
 * com tempo real e a mediana desvia do previsto além do parâmetro, o sistema
 * sugere um novo tempo base — aplicável com um clique.
 */
import { useMemo, useState } from "react";
import { mediana, tempoPrevistoMin } from "@/lib/calculations";
import { apiPut, ErroApi } from "@/lib/clientApi";
import { formatarDuracao } from "@/lib/dateUtils";
import type {
  ExecucaoRealizada,
  Local,
  ParametrosResolvidos,
  RotinaPlanejada,
  Tarefa,
} from "@/types";

const ROTULO_REGRA: Record<string, string> = {
  fixo: "min fixos",
  manual: "min (manual)",
  por_m2: "min/m²",
  por_unidade: "min/unidade",
};

interface Sugestao {
  tarefa: Tarefa;
  local: Local | undefined;
  execucoes: number;
  previstoAtual: number;
  medianaReal: number;
  desvio: number;
  novoTempoBase: number;
}

export default function SugestoesAjuste({
  rotinas,
  execucoes,
  tarefas,
  locais,
  parametros,
  aoAplicado,
}: {
  rotinas: RotinaPlanejada[];
  execucoes: ExecucaoRealizada[];
  tarefas: Tarefa[];
  locais: Local[];
  parametros: ParametrosResolvidos;
  aoAplicado: () => void;
}) {
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const sugestoes = useMemo<Sugestao[]>(() => {
    const rotinaPorId = new Map(rotinas.map((r) => [r.id, r]));
    const localPorId = new Map(locais.map((l) => [l.id, l]));

    // tempos reais agrupados por tarefa
    const reaisPorTarefa = new Map<string, number[]>();
    for (const e of execucoes) {
      if (e.tempo_real_min <= 0) continue;
      const rotina = rotinaPorId.get(e.rotina_id);
      if (!rotina) continue;
      const lista = reaisPorTarefa.get(rotina.tarefa_id) ?? [];
      lista.push(e.tempo_real_min);
      reaisPorTarefa.set(rotina.tarefa_id, lista);
    }

    const resultado: Sugestao[] = [];
    for (const [tarefaId, reais] of reaisPorTarefa) {
      if (reais.length < parametros.min_execucoes_ajuste) continue;
      const tarefa = tarefas.find((t) => t.id === tarefaId);
      // tarefas de "tempo referência" não entram (desvio é esperado)
      if (!tarefa || !tarefa.ativo || tarefa.tempo_referencia) continue;
      const local = localPorId.get(tarefa.local_id);

      // compara com o previsto ATUAL: depois de aplicar, a sugestão some.
      const previstoAtual = tempoPrevistoMin(tarefa, local);
      if (previstoAtual <= 0) continue;

      const med = mediana(reais);
      const desvio = ((med - previstoAtual) / previstoAtual) * 100;
      if (Math.abs(desvio) < parametros.desvio_ajuste_percentual) continue;

      let novoTempoBase: number;
      if (tarefa.regra_calculo === "por_m2" && local && local.metragem > 0) {
        novoTempoBase = Math.round((med / local.metragem) * 100) / 100;
      } else if (tarefa.regra_calculo === "por_unidade" && tarefa.quantidade > 0) {
        novoTempoBase = Math.round((med / tarefa.quantidade) * 10) / 10;
      } else {
        novoTempoBase = Math.round(med);
      }
      if (novoTempoBase <= 0 || novoTempoBase === tarefa.tempo_base_min) continue;

      resultado.push({
        tarefa,
        local,
        execucoes: reais.length,
        previstoAtual,
        medianaReal: med,
        desvio,
        novoTempoBase,
      });
    }
    return resultado.sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio));
  }, [rotinas, execucoes, tarefas, locais, parametros]);

  if (sugestoes.length === 0) return null;

  async function aplicar(s: Sugestao) {
    setErro("");
    setAplicando(s.tarefa.id);
    try {
      await apiPut(`/api/tarefas/${s.tarefa.id}`, { tempo_base_min: s.novoTempoBase });
      aoAplicado();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro ao aplicar.");
    } finally {
      setAplicando(null);
    }
  }

  return (
    <div
      className="painel entra"
      style={{ marginBottom: 16, borderLeft: "6px solid var(--acento)" }}
    >
      <div className="painel-cabecalho" style={{ padding: "10px 14px" }}>
        <span className="rotulo" style={{ color: "var(--acento)" }}>
          ◎ Tempos padrão para revisar — {sugestoes.length} tarefa(s) com desvio
          consistente no período
        </span>
      </div>
      <div style={{ padding: "10px 14px", display: "grid", gap: 8 }}>
        {sugestoes.map((s) => (
          <div
            key={s.tarefa.id}
            style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}
          >
            <span style={{ flex: 1, minWidth: 200 }}>
              <strong>{s.tarefa.nome_tarefa}</strong>{" "}
              <span style={{ color: "var(--tinta-3)" }}>
                — {s.local ? `${s.local.nome_local} · ${s.local.andar}` : "?"}
              </span>
            </span>
            <span className="num" style={{ color: "var(--tinta-2)" }}>
              previsto {formatarDuracao(s.previstoAtual)} · mediana real{" "}
              {formatarDuracao(s.medianaReal)} ({s.execucoes} exec.)
            </span>
            <span
              className="num"
              style={{ fontWeight: 700, color: s.desvio > 0 ? "var(--vermelho)" : "var(--azul)" }}
            >
              {s.desvio > 0 ? "+" : ""}
              {s.desvio.toFixed(0)}%
            </span>
            <button
              className="btn btn-mini btn-primario"
              disabled={aplicando === s.tarefa.id}
              onClick={() => aplicar(s)}
              title={`Atualiza o tempo base de ${s.tarefa.tempo_base_min} para ${s.novoTempoBase} ${ROTULO_REGRA[s.tarefa.regra_calculo] ?? "min"}`}
            >
              {aplicando === s.tarefa.id
                ? "Aplicando…"
                : `Ajustar para ${s.novoTempoBase} ${ROTULO_REGRA[s.tarefa.regra_calculo] ?? "min"}`}
            </button>
          </div>
        ))}
        {erro && <div className="alerta alerta-erro">{erro}</div>}
        <p style={{ fontSize: 11, color: "var(--tinta-3)" }}>
          Sugerido quando há ≥ {parametros.min_execucoes_ajuste} execuções com tempo
          real no período e a mediana desvia ≥ {parametros.desvio_ajuste_percentual}%
          do previsto atual. O ajuste vale para os próximos planejamentos; rotinas já
          gravadas não mudam.
        </p>
      </div>
    </div>
  );
}
