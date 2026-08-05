"use client";

/** Lado direito da tela de rotina: resumo do funcionário e da equipe. */
import { useMemo } from "react";
import {
  resumoFuncionario,
  ROTULO_CLASSIFICACAO,
} from "@/lib/calculations";
import { formatarDuracao } from "@/lib/dateUtils";
import type {
  ClassificacaoOcupacao,
  Funcionario,
  ParametrosResolvidos,
  RotinaPlanejada,
  Tarefa,
} from "@/types";

const COR_CLASSIFICACAO: Record<ClassificacaoOcupacao, string> = {
  subutilizado: "var(--cinza-bloco)",
  adequado: "var(--verde)",
  alta_ocupacao: "var(--amarelo)",
  sobrecarga: "var(--vermelho)",
};

const SELO_CLASSIFICACAO: Record<ClassificacaoOcupacao, string> = {
  subutilizado: "selo-cinza",
  adequado: "selo-verde",
  alta_ocupacao: "selo-amarelo",
  sobrecarga: "selo-vermelho",
};

function BarraOcupacao({
  percentual,
  classe,
  alvo,
}: {
  percentual: number;
  classe: ClassificacaoOcupacao;
  alvo?: number; // marca a ocupação-alvo (100 − folga reservada)
}) {
  return (
    <div className="barra-trilho" style={{ position: "relative" }}>
      <div
        className="barra-preenchimento"
        style={{
          width: `${Math.min(100, percentual)}%`,
          background: COR_CLASSIFICACAO[classe],
        }}
      />
      {alvo != null && alvo < 100 && (
        <div
          title={`Ocupação-alvo: ${alvo}% (acima disso consome a folga reservada)`}
          style={{
            position: "absolute",
            top: -2,
            bottom: -2,
            left: `${alvo}%`,
            width: 2,
            background: "var(--tinta)",
          }}
        />
      )}
    </div>
  );
}

export default function OccupancySummary({
  funcionarios,
  rotinas,
  tarefas,
  parametros,
  selecionadoId,
  aoSelecionar,
}: {
  funcionarios: Funcionario[];
  rotinas: RotinaPlanejada[];
  tarefas: Tarefa[];
  parametros: ParametrosResolvidos;
  selecionadoId: string | null;
  aoSelecionar: (id: string) => void;
}) {
  const tarefaPorId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);
  const alvoOcupacao = 100 - (parametros.folga_minima_percentual || 0);

  const resumos = useMemo(
    () =>
      funcionarios.map((f) => ({
        funcionario: f,
        resumo: resumoFuncionario(
          f,
          rotinas.filter((r) => r.funcionario_id === f.id),
          parametros,
        ),
      })),
    [funcionarios, rotinas, parametros],
  );

  const selecionado = resumos.find((r) => r.funcionario.id === selecionadoId);

  return (
    <aside className="entra-3 resumo-lateral">
      {/* resumo do funcionário selecionado */}
      {selecionado ? (
        <div className="painel">
          <div className="painel-cabecalho" style={{ padding: "10px 12px" }}>
            <span className="rotulo">Resumo do funcionário</span>
            <span className={`selo ${SELO_CLASSIFICACAO[selecionado.resumo.classificacao]}`}>
              {ROTULO_CLASSIFICACAO[selecionado.resumo.classificacao]}
            </span>
          </div>
          <div style={{ padding: 14 }}>
            <h3 style={{ fontSize: 18, marginBottom: 2 }}>{selecionado.funcionario.nome}</h3>
            <div className="num" style={{ fontSize: 11, color: "var(--tinta-2)", marginBottom: 12 }}>
              {selecionado.funcionario.entrada}–{selecionado.funcionario.saida} · intervalo{" "}
              {selecionado.funcionario.intervalo_inicio}–{selecionado.funcionario.intervalo_fim}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span className="rotulo">Ocupação</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>
                {selecionado.resumo.ocupacao_percentual.toFixed(1)}%
              </span>
            </div>
            <BarraOcupacao
              percentual={selecionado.resumo.ocupacao_percentual}
              classe={selecionado.resumo.classificacao}
              alvo={alvoOcupacao}
            />
            {parametros.folga_minima_percentual > 0 && (
              <div style={{ fontSize: 11, color: "var(--tinta-3)", marginTop: 4 }}>
                Folga reservada {parametros.folga_minima_percentual}% · ocupação-alvo ≤ {alvoOcupacao}%
              </div>
            )}

            <dl style={{ marginTop: 14, display: "grid", gap: 7 }}>
              {[
                ["Jornada líquida", formatarDuracao(selecionado.resumo.jornada_liquida_min)],
                ["Tempo planejado", formatarDuracao(selecionado.resumo.tempo_planejado_min)],
                ...(selecionado.resumo.deslocamento_min > 0
                  ? [["Deslocamento estimado", formatarDuracao(selecionado.resumo.deslocamento_min)] as [string, string]]
                  : []),
                ["Ociosidade prevista", formatarDuracao(selecionado.resumo.ociosidade_prevista_min)],
                ["Tarefas no dia", String(selecionado.resumo.total_tarefas)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--linha)", paddingBottom: 4 }}>
                  <dt style={{ fontSize: 12, color: "var(--tinta-2)" }}>{rotulo}</dt>
                  <dd className="num" style={{ fontWeight: 700, fontSize: 13 }}>{valor}</dd>
                </div>
              ))}
            </dl>

            {/* tarefas do dia */}
            <div style={{ marginTop: 12 }}>
              <span className="rotulo">Tarefas do dia</span>
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {rotinas
                  .filter((r) => r.funcionario_id === selecionado.funcionario.id)
                  .sort((a, b) => a.inicio_planejado.localeCompare(b.inicio_planejado))
                  .map((r) => (
                    <div key={r.id} style={{ fontSize: 12, display: "flex", gap: 6 }}>
                      <span className="num" style={{ color: "var(--tinta-2)", flexShrink: 0 }}>
                        {r.inicio_planejado}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tarefaPorId.get(r.tarefa_id)?.nome_tarefa ?? "Tarefa"}
                      </span>
                    </div>
                  ))}
                {rotinas.filter((r) => r.funcionario_id === selecionado.funcionario.id).length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>Agenda vazia.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="painel" style={{ padding: 16, fontSize: 13, color: "var(--tinta-2)" }}>
          Clique no nome de um funcionário na agenda para ver jornada, ocupação e
          ociosidade prevista.
        </div>
      )}

      {/* equipe */}
      <div className="painel">
        <div className="painel-cabecalho" style={{ padding: "10px 12px" }}>
          <span className="rotulo" data-tour="painel-ocupacao">Equipe — ocupação</span>
        </div>
        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          {resumos.map(({ funcionario, resumo }) => (
            <button
              key={funcionario.id}
              onClick={() => aoSelecionar(funcionario.id)}
              style={{ background: "transparent", border: "none", textAlign: "left", padding: 0 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: selecionadoId === funcionario.id ? 700 : 500 }}>
                  {funcionario.nome}
                </span>
                <span className="num" style={{ color: "var(--tinta-2)" }}>
                  {resumo.ocupacao_percentual.toFixed(0)}%
                </span>
              </div>
              <BarraOcupacao percentual={resumo.ocupacao_percentual} classe={resumo.classificacao} alvo={alvoOcupacao} />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
