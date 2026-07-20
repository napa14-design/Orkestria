"use client";

/**
 * Visão semanal: linhas = funcionários, colunas = dias da semana. Cada
 * célula resume o dia (tarefas, tempo, ocupação colorida ou ausência);
 * clicar em uma célula abre o dia correspondente na visão diária.
 */
import { useMemo } from "react";
import {
  classificarOcupacao,
  jornadaLiquidaMin,
  ocupacaoPercentual,
  tempoPlanejadoMin,
} from "@/lib/calculations";
import { formatarDuracao, hojeISO } from "@/lib/dateUtils";
import type {
  Ausencia,
  ClassificacaoOcupacao,
  Funcionario,
  ParametrosResolvidos,
  RotinaPlanejada,
} from "@/types";

const COR_CLASSE: Record<ClassificacaoOcupacao, string> = {
  subutilizado: "var(--cinza-bloco)",
  adequado: "var(--verde)",
  alta_ocupacao: "var(--amarelo)",
  sobrecarga: "var(--vermelho)",
};

const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const ROTULO_AUSENCIA: Record<string, string> = {
  falta: "Falta",
  atestado: "Atestado",
  ferias: "Férias",
  folga: "Folga",
  outro: "Ausente",
};

export default function SemanaGrid({
  funcionarios,
  rotinas,
  ausencias,
  parametros,
  datas,
  dataSelecionada,
  aoAbrirDia,
}: {
  funcionarios: Funcionario[];
  rotinas: RotinaPlanejada[];
  ausencias: Ausencia[];
  parametros: ParametrosResolvidos;
  /** As 7 datas (YYYY-MM-DD) da semana, de segunda a domingo. */
  datas: string[];
  dataSelecionada: string;
  aoAbrirDia: (data: string) => void;
}) {
  const hoje = hojeISO();

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
                    (r) => r.funcionario_id === f.id && r.data === data && r.status !== "cancelada",
                  );
                  const planejado = tempoPlanejadoMin(doDia);
                  const ocupacao = ocupacaoPercentual(planejado, jornada);
                  const classe = classificarOcupacao(ocupacao, parametros);

                  return (
                    <td
                      key={data}
                      onClick={() => aoAbrirDia(data)}
                      style={{ cursor: "pointer", minWidth: 96 }}
                      title={`${doDia.length} tarefa(s) · ${formatarDuracao(planejado)} planejado · ${ocupacao.toFixed(0)}% — clique para abrir o dia`}
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
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ padding: "8px 14px", fontSize: 11, color: "var(--tinta-3)" }}>
        Clique em qualquer célula ou no cabeçalho do dia para abrir a visão diária e
        editar a agenda. Cores: cinza subutilizado · verde adequado · amarelo alta
        ocupação · vermelho sobrecarga.
      </p>
    </div>
  );
}
