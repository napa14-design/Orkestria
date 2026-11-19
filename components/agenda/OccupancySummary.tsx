"use client";

/** Lado direito da tela de rotina: resumo do funcionário e da equipe. */
import { useMemo } from "react";
import { rotuloDaExigencia } from "@/lib/atividadeAdicional";
import {
  diaSemJornada,
  ehAtividadeAdicional,
  janelaDoEventual,
  minutosDoEventual,
  ocupacaoDoDiaPorPessoa,
  ocupaHorario,
  ROTULO_CLASSIFICACAO,
  servicoPesadoPorPessoa,
} from "@/lib/calculations";
import { formatarDuracao, hhmmParaMin } from "@/lib/dateUtils";
import type {
  Ausencia,
  ClassificacaoOcupacao,
  Feriado,
  Funcionario,
  ParametrosResolvidos,
  RotinaPlanejada,
  ServicoEventual,
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
}: {
  percentual: number;
  classe: ClassificacaoOcupacao;
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
    </div>
  );
}

export default function OccupancySummary({
  funcionarios,
  rotinas,
  eventuais,
  ausencias,
  feriados,
  data,
  tarefas,
  parametros,
  selecionadoId,
  aoSelecionar,
  aoTrocar,
}: {
  funcionarios: Funcionario[];
  rotinas: RotinaPlanejada[];
  eventuais: ServicoEventual[];
  ausencias: Ausencia[];
  feriados: Feriado[];
  data: string;
  tarefas: Tarefa[];
  parametros: ParametrosResolvidos;
  selecionadoId: string | null;
  aoSelecionar: (id: string) => void;
  /** Sem isto (supervisor, só leitura), o botão de troca nem aparece. */
  aoTrocar?: (id: string) => void;
}) {
  const tarefaPorId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);

  const resumos = useMemo(() => {
    // Só os deste dia (a função filtra): ao trocar de data, a lista anterior fica na tela até a nova chegar.
    // A mesma conta do aviso de sobrecarga do Acompanhamento (`ocupacaoDoDiaPorPessoa`).
    return ocupacaoDoDiaPorPessoa({ funcionarios, rotinas, eventuais, ausencias, data, parametros }).map(
      ({ funcionario: f, dela, eventuaisDela, eventualMin, resumo }) => ({
        funcionario: f,
        eventualMin,
        // Tudo o que foi lançado: sobre tarefas, a ocupação não muda, e sem isto a
        // pessoa lançava e achava que não tinha entrado.
        lancadoMin: eventuaisDela.reduce((s, e) => s + minutosDoEventual(e), 0),
        soHoras: eventualMin > 0 && !dela.some(ocupaHorario) && diaSemJornada(f, data, feriados),
        resumo,
      }),
    );
  }, [funcionarios, rotinas, eventuais, ausencias, feriados, data, parametros]);

  const selecionado = resumos.find((r) => r.funcionario.id === selecionadoId);
  const pesado = useMemo(() => servicoPesadoPorPessoa({ rotinas, tarefas, eventuais }), [rotinas, tarefas, eventuais]);
  const pesadoDele = selecionado ? pesado.get(selecionado.funcionario.id) : undefined;
  const pesadoMin = (pesadoDele?.rotaMin ?? 0) + (pesadoDele?.cargasMin ?? 0);

  return (
    <aside className="entra-3 resumo-lateral">
      {/* resumo do funcionário selecionado */}
      {selecionado ? (
        <div className="painel">
          <div className="painel-cabecalho" style={{ padding: "10px 12px" }}>
            <span className="rotulo">Resumo do funcionário</span>
            {selecionado.soHoras ? (
              <span className="selo selo-cinza">Só eventual</span>
            ) : (
              <span className={`selo ${SELO_CLASSIFICACAO[selecionado.resumo.classificacao]}`}>
                {ROTULO_CLASSIFICACAO[selecionado.resumo.classificacao]}
              </span>
            )}
          </div>
          <div style={{ padding: 14 }}>
            <h3 style={{ fontSize: 18, marginBottom: 2 }}>{selecionado.funcionario.nome}</h3>
            <div className="num" style={{ fontSize: 11, color: "var(--tinta-2)", marginBottom: 12 }}>
              {selecionado.funcionario.entrada}–{selecionado.funcionario.saida} · intervalo{" "}
              {selecionado.funcionario.intervalo_inicio}–{selecionado.funcionario.intervalo_fim}
            </div>
            {aoTrocar && (
              <button
                type="button"
                className="btn btn-mini"
                style={{ marginBottom: 12 }}
                onClick={() => aoTrocar(selecionado.funcionario.id)}
                title="Passa as tarefas do dia desta pessoa para outra e traz as da outra, de uma vez"
              >
                ⇄ Trocar tarefas com…
              </button>
            )}

            {!selecionado.soHoras && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span className="rotulo">Ocupação</span>
                  <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>
                    {selecionado.resumo.ocupacao_percentual.toFixed(1)}%
                  </span>
                </div>
                <BarraOcupacao
                  percentual={selecionado.resumo.ocupacao_percentual}
                  classe={selecionado.resumo.classificacao}
                />
              </>
            )}

            <dl style={{ marginTop: 14, display: "grid", gap: 7 }}>
              {[
                ...(selecionado.soHoras ? [] : [["Jornada líquida", formatarDuracao(selecionado.resumo.jornada_liquida_min)]]),
                ["Tempo planejado", formatarDuracao(selecionado.resumo.tempo_planejado_min)],
                // Sem isto, a ocupação sobe sem nenhum bloco a mais na agenda que explique,
                // ou não sobe depois de um lançamento, e a pessoa acha que não entrou.
                ...(selecionado.lancadoMin > 0
                  ? [
                      ["Eventual lançado", formatarDuracao(selecionado.lancadoMin)],
                      ["Fora das tarefas (já somado)", formatarDuracao(selecionado.eventualMin)],
                    ]
                  : []),
                ...(selecionado.soHoras ? [] : [["Ociosidade prevista", formatarDuracao(selecionado.resumo.ociosidade_prevista_min)]]),
                // Tarefa pesada (cadastro) + carga em atividade adicional: o esforço que o tempo esconde.
                ...(pesadoMin > 0 ? [["Serviço pesado", formatarDuracao(pesadoMin)]] : []),
                ["Tarefas no dia", String(selecionado.resumo.total_tarefas)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--linha)", paddingBottom: 4 }}>
                  <dt style={{ fontSize: 12, color: "var(--tinta-2)" }}>{rotulo}</dt>
                  <dd className="num" style={{ fontWeight: 700, fontSize: 13 }}>{valor}</dd>
                </div>
              ))}
            </dl>

            {/* tarefas do dia, com a atividade adicional no meio e as tarefas no mesmo horário
                marcadas (pedido da coordenação, 19/11/2026: o 110% aparecia sem dizer de onde) */}
            {(() => {
              const id = selecionado.funcionario.id;
              const evs = eventuais.filter((e) => e.funcionario_id === id);
              const janelasAdicionais = evs.filter(ehAtividadeAdicional).map(janelaDoEventual).filter((j): j is [number, number] => !!j);
              const itens = [
                // "|0" antes de "|1": no mesmo horário, a atividade vem antes da tarefa que ela cobre.
                ...rotinas.filter((r) => r.funcionario_id === id).map((r) => ({ hora: `${r.inicio_planejado}|1`, rotina: r, evento: null })),
                ...evs.map((e) => ({ hora: janelaDoEventual(e) ? `${e.inicio}|0` : "99:99", rotina: null, evento: e })),
              ].sort((a, b) => a.hora.localeCompare(b.hora));
              return (
                <div style={{ marginTop: 12 }}>
                  <span className="rotulo">Tarefas do dia</span>
                  {/* minmax(0, 1fr): sem isto a coluna cresce até o texto e corta na borda do painel. */}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, marginTop: 6 }}>
                    {itens.map(({ rotina: r, evento: e }) => {
                      if (e) {
                        const adicional = ehAtividadeAdicional(e);
                        const comHora = !!janelaDoEventual(e);
                        return (
                          <div key={`ev-${e.id}`} style={{ fontSize: 12, minWidth: 0, overflowWrap: "anywhere", borderLeft: `3px solid ${adicional ? "var(--acento)" : "var(--tinta-3)"}`, paddingLeft: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <span className="num" style={{ color: "var(--tinta-2)", flexShrink: 0 }}>
                                {comHora ? `${e.inicio}–${e.fim}` : formatarDuracao(minutosDoEventual(e))}
                              </span>
                              <strong style={{ color: adicional ? "var(--acento)" : "var(--tinta)" }}>
                                + {adicional ? "Atividade adicional" : "Serviço eventual"}
                              </strong>
                            </div>
                            {(adicional && e.exigencia) || e.descricao ? (
                              <div style={{ color: "var(--tinta-2)" }}>
                                {adicional && e.exigencia ? rotuloDaExigencia(e.exigencia) : ""}
                                {adicional && e.exigencia && e.descricao ? " — " : ""}
                                {e.descricao}
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      const ini = hhmmParaMin(r!.inicio_planejado);
                      const fim = hhmmParaMin(r!.fim_planejado);
                      const junto = ocupaHorario(r!) && janelasAdicionais.some(([a, b]) => ini < b && fim > a);
                      return (
                        <div key={r!.id} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "baseline" }}>
                          <span className="num" style={{ color: "var(--tinta-2)", flexShrink: 0 }}>
                            {r!.inicio_planejado}
                          </span>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {tarefaPorId.get(r!.tarefa_id)?.nome_tarefa ?? "Tarefa"}
                          </span>
                          {junto && (
                            <span style={{ color: "var(--acento)", fontSize: 10, flexShrink: 0 }} title="No mesmo horário da atividade adicional">
                              · ao mesmo tempo
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {itens.length === 0 && <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>Agenda vazia.</span>}
                  </div>
                </div>
              );
            })()}
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
          {resumos.map(({ funcionario, resumo, soHoras, eventualMin }) => (
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
                  {soHoras ? formatarDuracao(eventualMin) : `${resumo.ocupacao_percentual.toFixed(0)}%`}
                </span>
              </div>
              {!soHoras && <BarraOcupacao percentual={resumo.ocupacao_percentual} classe={resumo.classificacao} />}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
