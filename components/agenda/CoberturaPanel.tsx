"use client";

/**
 * Cobertura de ausências: lista as tarefas planejadas de funcionários
 * ausentes ("órfãs") e sugere colegas para assumi-las, pela régua da Central.
 */
import { useMemo, useState } from "react";
import { jornadaDoDia, ocupaHorario, resumoFuncionario } from "@/lib/calculations";
import { formatarDuracao } from "@/lib/dateUtils";
import { avaliarCandidatos, type CandidatoAvaliado } from "@/lib/redistribuicao";
import type {
  Funcionario,
  Local,
  ParametrosResolvidos,
  QualificacaoFuncionario,
  Requisito,
  RotinaPlanejada,
  Tarefa,
} from "@/types";

export default function CoberturaPanel({
  funcionarios,
  ausencias,
  rotinas,
  tarefas,
  locais,
  requisitos,
  qualificacoes,
  parametros,
  aoMover,
}: {
  funcionarios: Funcionario[];
  /** funcionario_id → rótulo da ausência. */
  ausencias: Map<string, string>;
  rotinas: RotinaPlanejada[];
  tarefas: Tarefa[];
  locais: Local[];
  requisitos: Requisito[];
  qualificacoes: QualificacaoFuncionario[];
  parametros: ParametrosResolvidos;
  /** Ausente = só leitura (supervisor): lista as órfãs, sem remanejar. */
  aoMover?: (rotinaId: string, funcionarioId: string, inicio: string) => void;
}) {
  const [destinos, setDestinos] = useState<Record<string, string>>({});

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

  const livrePorPessoa = useMemo(
    () =>
      new Map(
        funcionarios.map((f) => [
          f.id,
          resumoFuncionario(f, rotinas.filter((r) => r.funcionario_id === f.id), parametros).ociosidade_prevista_min,
        ]),
      ),
    [funcionarios, rotinas, parametros],
  );

  // Pela mesma régua da Central: primeiro quem assume sem alerta, do mais leve ao
  // mais cheio. Quem tem alerta continua na lista, porque o "Mover" pede autorização.
  const candidatosPorOrfa = useMemo(() => {
    const ocupando = rotinas.filter(ocupaHorario);
    return new Map(
      orfas.map((r) => {
        const tarefa = tarefaPorId.get(r.tarefa_id);
        const local = locais.find((l) => l.id === tarefa?.local_id);
        const disponiveisIds = new Set(
          funcionarios.filter((f) => !ausencias.has(f.id) && jornadaDoDia(f, r.data).trabalha).map((f) => f.id),
        );
        return [
          r.id,
          tarefa && local
            ? avaliarCandidatos({
                rotina: r,
                funcionarios,
                disponiveisIds,
                rotinasDoDia: ocupando,
                tarefa,
                local,
                parametros,
                requisitosCatalogo: requisitos,
                qualificacoes,
              }).filter((c) => !tarefa.restricao_genero || c.funcionario.genero === tarefa.restricao_genero)
            : [],
        ];
      }),
    );
  }, [orfas, tarefaPorId, locais, funcionarios, ausencias, rotinas, parametros, requisitos, qualificacoes]);

  if (orfas.length === 0) return null;

  // O motivo vai na opção porque cada alerta dá numa coisa ao clicar em "Mover":
  // conflito pede autorização, sobrecarga só avisa depois e requisito é recusado.
  const opcao = ({ funcionario, alertas }: CandidatoAvaliado) => (
    <option key={funcionario.id} value={funcionario.id}>
      {funcionario.nome} (livre: {formatarDuracao(livrePorPessoa.get(funcionario.id) ?? 0)})
      {alertas.length ? ` — ${alertas.map((a) => a.mensagem).join(" ")}` : ""}
    </option>
  );

  return (
    <div
      className="painel entra"
      style={{ marginBottom: 14, borderLeft: "6px solid var(--vermelho)" }}
    >
      <div className="painel-cabecalho" style={{ padding: "10px 14px" }}>
        <span className="rotulo" style={{ color: "var(--vermelho)" }}>
          ⚠ Cobertura de ausência — {orfas.length} tarefa(s) sem responsável
        </span>
      </div>
      <div style={{ padding: "10px 14px", display: "grid", gap: 8 }}>
        {orfas.map((r) => {
          const tarefa = tarefaPorId.get(r.tarefa_id);
          const ausente = funcPorId.get(r.funcionario_id);
          const destino = destinos[r.id] ?? "";
          const candidatos = candidatosPorOrfa.get(r.id) ?? [];
          const semAlerta = candidatos.filter((c) => c.alertas.length === 0);
          const comAlerta = candidatos.filter((c) => c.alertas.length > 0);
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
              {aoMover && (
                <>
                  <select
                    value={destino}
                    onChange={(e) => setDestinos((d) => ({ ...d, [r.id]: e.target.value }))}
                    // Largura fixa: a opção leva o alerta inteiro, e sem limite a caixa
                    // crescia até o texto mais longo, estourava a tela e empurrava o
                    // "Mover" para outra linha (Sul 2, 10/11/2026). Aberta, mostra tudo.
                    style={{ fontSize: 12, padding: 4, width: 260, maxWidth: "100%" }}
                  >
                    <option value="">— remanejar para —</option>
                    {semAlerta.length > 0 && <optgroup label="Sem alerta">{semAlerta.map(opcao)}</optgroup>}
                    {comAlerta.length > 0 && <optgroup label="Com alerta">{comAlerta.map(opcao)}</optgroup>}
                  </select>
                  <button
                    className="btn btn-mini btn-primario"
                    disabled={!destino}
                    onClick={() => aoMover(r.id, destino, r.inicio_planejado)}
                    title="Move mantendo o horário; conflitos são validados"
                  >
                    Mover →
                  </button>
                </>
              )}
            </div>
          );
        })}
        {aoMover && (
          <p style={{ fontSize: 11, color: "var(--tinta-3)" }}>
            A movimentação mantém o horário original e passa pelas validações normais:
            conflito pede autorização, sobrecarga só avisa depois de mover e requisito
            faltando é recusado. Se conflitar, arraste o card manualmente para outro
            horário do colega.
          </p>
        )}
      </div>
    </div>
  );
}
