"use client";

/**
 * Cobertura de ausências: lista as tarefas planejadas de funcionários
 * ausentes ("órfãs") e sugere colegas com ociosidade para assumi-las.
 */
import { useMemo, useState } from "react";
import { resumoFuncionario } from "@/lib/calculations";
import { formatarDuracao } from "@/lib/dateUtils";
import type {
  Funcionario,
  ParametrosResolvidos,
  RotinaPlanejada,
  Tarefa,
} from "@/types";

export default function CoberturaPanel({
  funcionarios,
  ausencias,
  rotinas,
  tarefas,
  parametros,
  aoMover,
}: {
  funcionarios: Funcionario[];
  /** funcionario_id → rótulo da ausência. */
  ausencias: Map<string, string>;
  rotinas: RotinaPlanejada[];
  tarefas: Tarefa[];
  parametros: ParametrosResolvidos;
  aoMover: (rotinaId: string, funcionarioId: string, inicio: string) => void;
}) {
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [aberto, setAberto] = useState(false);

  const tarefaPorId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);
  const funcPorId = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f])),
    [funcionarios],
  );

  const orfas = useMemo(
    () =>
      rotinas
        .filter(
          (r) =>
            ausencias.has(r.funcionario_id) &&
            (r.status === "planejada" || r.status === "pendente"),
        )
        .sort((a, b) => a.inicio_planejado.localeCompare(b.inicio_planejado)),
    [rotinas, ausencias],
  );

  // Colegas presentes, ordenados da maior para a menor ociosidade prevista.
  const candidatos = useMemo(
    () =>
      funcionarios
        .filter((f) => !ausencias.has(f.id))
        .map((f) => ({
          funcionario: f,
          resumo: resumoFuncionario(
            f,
            rotinas.filter((r) => r.funcionario_id === f.id),
            parametros,
          ),
        }))
        .sort((a, b) => b.resumo.ociosidade_prevista_min - a.resumo.ociosidade_prevista_min),
    [funcionarios, ausencias, rotinas, parametros],
  );

  if (orfas.length === 0) return null;

  return (
    <div
      className="painel entra"
      style={{ marginBottom: 14, borderLeft: "6px solid var(--vermelho)" }}
    >
      <button
        type="button"
        className="painel-cabecalho"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
        style={{
          width: "100%",
          padding: "9px 14px",
          color: "inherit",
          cursor: "pointer",
          border: "none",
          borderBottom: aberto ? "2px solid var(--tinta)" : "none",
        }}
      >
        <span className="rotulo" style={{ color: "var(--vermelho)" }}>
          ⚠ Cobertura de ausência — {orfas.length} tarefa(s) sem responsável
        </span>
        <span className="rotulo">{aberto ? "▲ fechar" : "▼ resolver"}</span>
      </button>
      {aberto && <div style={{ padding: "10px 14px", display: "grid", gap: 8 }}>
        {orfas.map((r) => {
          const tarefa = tarefaPorId.get(r.tarefa_id);
          const ausente = funcPorId.get(r.funcionario_id);
          const destino = destinos[r.id] ?? "";
          return (
            <div
              key={r.id}
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}
            >
              <span className="num" style={{ color: "var(--tinta-2)", width: 84 }}>
                {r.inicio_planejado}–{r.fim_planejado}
              </span>
              <span style={{ flex: 1, minWidth: 180 }}>
                <strong>{tarefa?.nome_tarefa ?? "Tarefa"}</strong>{" "}
                <span style={{ color: "var(--tinta-3)" }}>
                  (de {ausente?.nome ?? "?"} · {formatarDuracao(r.tempo_previsto_min)})
                </span>
              </span>
              <select
                value={destino}
                onChange={(e) => setDestinos((d) => ({ ...d, [r.id]: e.target.value }))}
                style={{ fontSize: 12, padding: 4 }}
              >
                <option value="">— remanejar para —</option>
                {candidatos
                  .filter(
                    ({ funcionario }) =>
                      !tarefa?.restricao_genero ||
                      funcionario.genero === tarefa.restricao_genero,
                  )
                  .map(({ funcionario, resumo }) => (
                    <option key={funcionario.id} value={funcionario.id}>
                      {funcionario.nome} (livre: {formatarDuracao(resumo.ociosidade_prevista_min)})
                    </option>
                  ))}
              </select>
              <button
                className="btn btn-mini btn-primario"
                disabled={!destino}
                onClick={() => aoMover(r.id, destino, r.inicio_planejado)}
                title="Move mantendo o horário; conflitos são validados"
              >
                Mover →
              </button>
            </div>
          );
        })}
        <p style={{ fontSize: 11, color: "var(--tinta-3)" }}>
          A movimentação mantém o horário original e passa pelas validações normais
          (conflito, intervalo, expediente). Se conflitar, arraste o card manualmente
          para outro horário do colega.
        </p>
      </div>}
    </div>
  );
}
