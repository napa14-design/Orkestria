"use client";

/**
 * Visão semanal: linhas = funcionários, colunas = dias da semana. Cada
 * célula resume o dia (tarefas, tempo, ocupação colorida ou ausência);
 * clicar em uma célula abre o dia correspondente na visão diária. Passar o
 * mouse mostra as tarefas do dia; a última coluna e a última linha são os
 * totais da pessoa na semana e do dia na equipe (pedido do dono, 22/10/2026).
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  classificarOcupacao,
  jornadaLiquidaMin,
  ocupacaoPercentual,
  ocupacaoPorPessoa,
  resumoDeOcupacao,
  tempoPlanejadoMin,
  ocupaHorario,
} from "@/lib/calculations";
import { formatarDuracao, hhmmParaMin, hojeISO } from "@/lib/dateUtils";
import type {
  Ausencia,
  ClassificacaoOcupacao,
  Funcionario,
  ParametrosResolvidos,
  RotinaPlanejada,
  Tarefa,
} from "@/types";

/** Quantas linhas a lista de tarefas mostra antes do "+N": um dia cheio tem 50 blocos. */
const MAX_LINHAS_DICA = 18;

const COR_CLASSE: Record<ClassificacaoOcupacao, string> = {
  subutilizado: "var(--cinza-bloco)",
  adequado: "var(--verde)",
  alta_ocupacao: "var(--amarelo)",
  sobrecarga: "var(--vermelho)",
};

/** Texto legível na cor da classe: o verde e o amarelo de barra somem em letra miúda. */
const COR_TEXTO: Record<ClassificacaoOcupacao, string> = {
  subutilizado: "var(--tinta-3)",
  adequado: "var(--tinta)",
  alta_ocupacao: "var(--tinta)",
  sobrecarga: "var(--vermelho)",
};

const DIA_CURTO =["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const ROTULO_AUSENCIA: Record<string, string> = {
  falta: "Falta",
  atestado: "Atestado",
  ferias: "Férias",
  folga: "Folga",
  banco_horas: "Banco de horas",
  outro: "Ausente",
};

export default function SemanaGrid({
  funcionarios,
  rotinas,
  ausencias,
  tarefas,
  parametros,
  datas,
  dataSelecionada,
  aoAbrirDia,
}: {
  funcionarios: Funcionario[];
  rotinas: RotinaPlanejada[];
  ausencias: Ausencia[];
  /** Para o nome das tarefas na lista do dia. */
  tarefas: Tarefa[];
  parametros: ParametrosResolvidos;
  /** As 7 datas (YYYY-MM-DD) da semana, de segunda a domingo. */
  datas: string[];
  dataSelecionada: string;
  aoAbrirDia: (data: string) => void;
}) {
  const hoje = hojeISO();
  const [dica, setDica] = useState<{ x: number; y: number; acima: boolean; titulo: string; linhas: string[] } | null>(null);
  const nomeTarefa = useMemo(() => {
    const m = new Map(tarefas.map((t) => [t.id, t.nome_tarefa]));
    return (id: string) => m.get(id) ?? "Tarefa";
  }, [tarefas]);

  // Só quem está na grade (o filtro de turno vale para os totais também) e não
  // está ausente no dia: a ausência não apaga os blocos, e o total contava o dia
  // de quem faltou enquanto a célula dizia "Falta" (auditoria, 22/10/2026).
  const daGrade = useMemo(() => {
    const ids = new Set(funcionarios.map((f) => f.id));
    const ausente = (r: RotinaPlanejada) =>
      ausencias.some((a) => a.funcionario_id === r.funcionario_id && a.data_inicio <= r.data && r.data <= a.data_fim);
    return rotinas.filter((r) => ids.has(r.funcionario_id) && ocupaHorario(r) && !ausente(r));
  }, [funcionarios, rotinas, ausencias]);
  /** Total da pessoa na semana — mesma conta do Painel (`ocupacaoPorPessoa`). */
  const daSemana = useMemo(
    () => new Map(ocupacaoPorPessoa(funcionarios, daGrade).map((p) => [p.funcionario.id, p])),
    [funcionarios, daGrade],
  );
  /** Total do dia na equipe (`resumoDeOcupacao`): só conta quem tem algo planejado. */
  const totalDoDia = useMemo(
    () =>
      new Map(
        datas.map((d) => {
          const rs = daGrade.filter((r) => r.data === d);
          return [d, { tarefas: rs.length, planejado: tempoPlanejadoMin(rs), ...resumoDeOcupacao(ocupacaoPorPessoa(funcionarios, rs), parametros) }];
        }),
      ),
    [datas, daGrade, funcionarios, parametros],
  );
  const daEquipe = useMemo(() => resumoDeOcupacao([...daSemana.values()], parametros), [daSemana, parametros]);

  function mostrarTarefas(el: HTMLElement, f: Funcionario, data: string, doDia: RotinaPlanejada[]) {
    const r = el.getBoundingClientRect();
    const linhas = [...doDia]
      .sort((a, b) => hhmmParaMin(a.inicio_planejado) - hhmmParaMin(b.inicio_planejado))
      .map((x) => `${x.inicio_planejado}–${x.fim_planejado}  ${nomeTarefa(x.tarefa_id)}`);
    const acima = r.bottom + 320 > window.innerHeight;
    setDica({
      x: Math.min(Math.max(r.left, 8), window.innerWidth - 328),
      y: acima ? r.top - 6 : r.bottom + 6,
      acima,
      titulo: `${f.nome} · ${new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}`,
      linhas,
    });
  }

  const ausenciaDe = useMemo(() => {
    return (funcionarioId: string, data: string) =>
      ausencias.find(
        (a) =>
          a.funcionario_id === funcionarioId &&
          a.data_inicio <= data &&
          data <= a.data_fim,
      ) ?? null;
  }, [ausencias]);

  if (funcionarios.length === 0) {
    return (
      <div className="painel" style={{ padding: 48, textAlign: "center", color: "var(--tinta-3)" }}>
        Nenhum funcionário ativo para a sede/turno selecionados.
      </div>
    );
  }

  return (
    <div className="painel entra-2" style={{ overflow: "auto" }}>
      <table className="tabela" style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th className="col-fixa" style={{ width: 170 }}>Funcionário</th>
            {datas.map((data) => {
              const d = new Date(`${data}T12:00:00`);
              const eHoje = data === hoje;
              const selecionado = data === dataSelecionada;
              return (
                <th
                  key={data}
                  style={{
                    textAlign: "center",
                    cursor: "pointer",
                    background: selecionado ? "var(--tinta)" : undefined,
                    color: selecionado ? "var(--papel)" : undefined,
                  }}
                  onClick={() => aoAbrirDia(data)}
                  title="Abrir este dia na visão diária"
                >
                  {DIA_CURTO[d.getDay()]}{" "}
                  <span className="num">
                    {String(d.getDate()).padStart(2, "0")}/{String(d.getMonth() + 1).padStart(2, "0")}
                  </span>
                  {eHoje && (
                    <span className="selo selo-laranja" style={{ marginLeft: 4, fontSize: 8 }}>
                      hoje
                    </span>
                  )}
                </th>
              );
            })}
            <th style={{ textAlign: "center", width: 110 }} title="Total da pessoa na semana">
              Semana
            </th>
          </tr>
        </thead>
        <tbody>
          {funcionarios.map((f) => {
            const jornada = jornadaLiquidaMin(f);
            return (
              <tr key={f.id}>
                <td className="col-fixa">
                  <strong>{f.nome}</strong>
                  <div className="num" style={{ fontSize: 10, color: "var(--tinta-3)" }}>
                    {f.entrada}–{f.saida} · líq. {formatarDuracao(jornada)}
                  </div>
                </td>
                {datas.map((data) => {
                  const ausencia = ausenciaDe(f.id, data);
                  if (ausencia) {
                    return (
                      <td
                        key={data}
                        onClick={() => aoAbrirDia(data)}
                        style={{
                          cursor: "pointer",
                          textAlign: "center",
                          background:
                            "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(199,58,43,0.12) 5px, rgba(199,58,43,0.12) 10px)",
                        }}
                      >
                        <span className="selo selo-vermelho" style={{ fontSize: 9 }}>
                          {ROTULO_AUSENCIA[ausencia.tipo] ?? "Ausente"}
                        </span>
                      </td>
                    );
                  }

                  const doDia = rotinas.filter(
                    (r) => r.funcionario_id === f.id && r.data === data && ocupaHorario(r),
                  );
                  const planejado = tempoPlanejadoMin(doDia);
                  const ocupacao = ocupacaoPercentual(planejado, jornada);
                  const classe = classificarOcupacao(ocupacao, parametros);

                  return (
                    <td
                      key={data}
                      onClick={() => aoAbrirDia(data)}
                      onMouseEnter={doDia.length ? (e) => mostrarTarefas(e.currentTarget, f, data, doDia) : undefined}
                      onMouseLeave={() => setDica(null)}
                      style={{ cursor: "pointer", minWidth: 96 }}
                    >
                      {doDia.length === 0 ? (
                        <span style={{ color: "var(--tinta-3)", fontSize: 11 }}>— vazio —</span>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, marginBottom: 3 }}>
                            <strong className="num">{doDia.length}</strong> tarefas ·{" "}
                            <span className="num">{formatarDuracao(planejado)}</span>
                          </div>
                          <div className="barra-trilho" style={{ height: 10 }}>
                            <div
                              className="barra-preenchimento"
                              style={{
                                width: `${Math.min(100, ocupacao)}%`,
                                background: COR_CLASSE[classe],
                              }}
                            />
                          </div>
                          <div className="num" style={{ fontSize: 10, color: "var(--tinta-2)", marginTop: 2 }}>
                            {ocupacao.toFixed(0)}%
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
                <td style={{ textAlign: "center", background: "var(--papel-2)" }}>
                  {(() => {
                    const s = daSemana.get(f.id);
                    if (!s || s.dias === 0) return <span style={{ color: "var(--tinta-3)", fontSize: 11 }}>—</span>;
                    return (
                      <>
                        <div className="num" style={{ fontSize: 11 }}>
                          <strong>{s.dias}</strong> dia(s) · {formatarDuracao(s.planejado)}
                        </div>
                        <div className="num" style={{ fontSize: 11, color: COR_TEXTO[classificarOcupacao(s.ocupacao, parametros)] }}>
                          <strong>{s.ocupacao.toFixed(0)}%</strong> média
                        </div>
                      </>
                    );
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--tinta)" }}>
            <td className="col-fixa">
              <strong>Total do dia</strong>
              <div style={{ fontSize: 10, color: "var(--tinta-3)" }}>média de quem tem tarefa</div>
            </td>
            {datas.map((data) => {
              const t = totalDoDia.get(data)!;
              if (t.tarefas === 0)
                return (
                  <td key={data} style={{ textAlign: "center", color: "var(--tinta-3)", fontSize: 11 }}>
                    —
                  </td>
                );
              return (
                <td key={data} style={{ textAlign: "center" }}>
                  <div className="num" style={{ fontSize: 11 }}>
                    <strong>{t.tarefas}</strong> tarefas · {formatarDuracao(t.planejado)}
                  </div>
                  <div className="num" style={{ fontSize: 11, color: COR_TEXTO[classificarOcupacao(t.ocupacaoMedia ?? 0, parametros)] }}>
                    <strong>{(t.ocupacaoMedia ?? 0).toFixed(0)}%</strong> · {t.pessoasPlanejadas} pessoa(s)
                  </div>
                  {t.emSobrecarga > 0 && (
                    <span className="selo selo-vermelho" style={{ fontSize: 8 }}>
                      {t.emSobrecarga} em sobrecarga
                    </span>
                  )}
                </td>
              );
            })}
            <td style={{ textAlign: "center", background: "var(--papel-2)" }}>
              {daEquipe.pessoasPlanejadas > 0 ? (
                <div className="num" style={{ fontSize: 11, color: COR_TEXTO[classificarOcupacao(daEquipe.ocupacaoMedia ?? 0, parametros)] }}>
                  <strong>{(daEquipe.ocupacaoMedia ?? 0).toFixed(0)}%</strong> na semana
                </div>
              ) : (
                <span style={{ color: "var(--tinta-3)", fontSize: 11 }}>—</span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
      {dica &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: dica.x,
              top: dica.acima ? undefined : dica.y,
              bottom: dica.acima ? window.innerHeight - dica.y : undefined,
              width: 320,
              zIndex: 1000,
              background: "var(--papel)",
              border: "2px solid var(--tinta)",
              boxShadow: "4px 4px 0 var(--tinta)",
              padding: "8px 10px",
              pointerEvents: "none",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{dica.titulo}</div>
            {dica.linhas.slice(0, MAX_LINHAS_DICA).map((l, i) => (
              <div key={i} className="num" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l}
              </div>
            ))}
            {dica.linhas.length > MAX_LINHAS_DICA && (
              <div style={{ color: "var(--tinta-3)", marginTop: 2 }}>
                + {dica.linhas.length - MAX_LINHAS_DICA} tarefa(s) — clique para abrir o dia
              </div>
            )}
          </div>,
          document.body,
        )}
      <p style={{ padding: "8px 14px", fontSize: 11, color: "var(--tinta-3)" }}>
        Passe o mouse numa célula para ver as tarefas do dia; clique nela (ou no
        cabeçalho do dia) para abrir a visão diária e editar a agenda. Cores: cinza
        subutilizado · verde adequado · amarelo alta ocupação · vermelho sobrecarga.
      </p>
    </div>
  );
}
