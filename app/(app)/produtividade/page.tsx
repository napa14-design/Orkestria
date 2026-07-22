"use client";

/**
 * Produtividade por funcionário (Fase F) — indicador OPERACIONAL derivado do
 * previsto × realizado que já existe, para reconhecimento e dimensionamento.
 * Salvaguardas (diretriz da direção): não usa idade/sexo, não é punitivo e não
 * substitui a avaliação de gestão. Tarefas de referência/presença ficam de fora
 * (a variação é esperada).
 */
import { useMemo } from "react";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import {
  cobraDesvio,
  desvioPercentual,
  PARAMETROS_PADRAO,
} from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { baixarCSV } from "@/lib/csv";
import { formatarDuracao, hojeISO, somarDias } from "@/lib/dateUtils";
import { usePreferenciaTela } from "@/lib/usePreferenciaTela";
import type {
  ExecucaoRealizada,
  Funcionario,
  ParametrosResolvidos,
  RotinaPlanejada,
  Sede,
  Tarefa,
} from "@/types";

const REALIZADAS = ["conforme_planejado", "com_atraso", "parcial"];

export default function PaginaProdutividade() {
  const [de, setDe] = usePreferenciaTela("produtividade", "de", somarDias(hojeISO(), -29));
  const [ate, setAte] = usePreferenciaTela("produtividade", "ate", hojeISO());
  const [sedeFiltro, setSedeFiltro] = usePreferenciaTela("produtividade", "sede", "");

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: tarefas } = useSWR<Tarefa[]>("/api/tarefas", fetcher);
  const { data: rotinas } = useSWR<RotinaPlanejada[]>(`/api/rotinas?de=${de}&ate=${ate}`, fetcher);
  const { data: execucoes } = useSWR<ExecucaoRealizada[]>(`/api/execucoes?de=${de}&ate=${ate}`, fetcher);
  const { data: parametros } = useSWR<ParametrosResolvidos>("/api/parametros?resolvidos=1", fetcher);

  const params = parametros ?? PARAMETROS_PADRAO;
  const carregando = !sedes || !funcionarios || !rotinas || !execucoes;

  const linhas = useMemo(() => {
    const rotinaPorId = new Map((rotinas ?? []).map((r) => [r.id, r]));
    const cobraPorTarefa = new Map((tarefas ?? []).map((t) => [t.id, cobraDesvio(t)]));
    const funcs = (funcionarios ?? []).filter(
      (f) => f.ativo && (!sedeFiltro || f.sede_id === sedeFiltro),
    );

    const agg = new Map<
      string,
      { realizadas: number; tempoReal: number; tempoPrev: number; noAlvo: number; comDesvio: number }
    >();
    for (const e of execucoes ?? []) {
      if (!REALIZADAS.includes(e.status_realizado)) continue;
      const rotina = rotinaPorId.get(e.rotina_id);
      if (!rotina) continue;
      const a = agg.get(rotina.funcionario_id) ?? {
        realizadas: 0,
        tempoReal: 0,
        tempoPrev: 0,
        noAlvo: 0,
        comDesvio: 0,
      };
      a.realizadas += 1;
      a.tempoReal += e.tempo_real_min || 0;
      // aderência só conta onde o tempo é comparável (tarefa cobra desvio e há real)
      if (e.tempo_real_min > 0 && cobraPorTarefa.get(rotina.tarefa_id) !== false) {
        a.tempoPrev += rotina.tempo_previsto_min || 0;
        a.comDesvio += 1;
        const d = Math.abs(desvioPercentual(e.tempo_real_min, rotina.tempo_previsto_min));
        if (d <= params.desvio_justificativa_percentual) a.noAlvo += 1;
      }
      agg.set(rotina.funcionario_id, a);
    }

    return funcs
      .map((f) => {
        const a = agg.get(f.id);
        const aderencia = a && a.comDesvio > 0 ? (a.noAlvo / a.comDesvio) * 100 : null;
        return {
          funcionario: f,
          realizadas: a?.realizadas ?? 0,
          tempoReal: a?.tempoReal ?? 0,
          comDesvio: a?.comDesvio ?? 0,
          aderencia, // % de execuções dentro da tolerância (null = sem base)
        };
      })
      .sort((x, y) => {
        // ordena por aderência (quem tem base primeiro), depois por volume
        if (x.aderencia == null && y.aderencia == null) return y.realizadas - x.realizadas;
        if (x.aderencia == null) return 1;
        if (y.aderencia == null) return -1;
        return y.aderencia - x.aderencia || y.realizadas - x.realizadas;
      });
  }, [rotinas, execucoes, tarefas, funcionarios, sedeFiltro, params]);

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;

  function exportar() {
    baixarCSV(
      `produtividade_${de}_a_${ate}`,
      ["Funcionário", "Sede", "Serviços realizados", "Tempo realizado (min)", "Execuções comparáveis", "Aderência (%)"],
      linhas.map((l) => [
        l.funcionario.nome,
        nomeSede(l.funcionario.sede_id),
        l.realizadas,
        l.tempoReal,
        l.comDesvio,
        l.aderencia == null ? "" : l.aderencia.toFixed(0),
      ]),
    );
  }

  return (
    <div className="entra">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Produtividade</h1>
          <p style={{ color: "var(--tinta-2)", marginTop: 2 }}>
            Aderência ao previsto, por funcionário — para reconhecimento e dimensionamento.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="campo"><span className="rotulo">De</span>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label className="campo"><span className="rotulo">Até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          <label className="campo"><span className="rotulo">Sede</span>
            <select value={sedeFiltro} onChange={(e) => setSedeFiltro(e.target.value)}>
              <option value="">Todas</option>
              {(sedes ?? []).filter((s) => s.ativo).map((s) => (
                <option key={s.id} value={s.id}>{s.nome_sede}</option>
              ))}
            </select></label>
          <button className="btn" onClick={exportar} disabled={carregando}>⭳ CSV</button>
        </div>
      </div>

      <div className="alerta alerta-aviso" style={{ marginBottom: 16, fontSize: 13 }}>
        Indicador <strong>operacional</strong>, derivado do previsto × realizado. Não considera
        idade, sexo ou qualquer atributo pessoal, e <strong>não substitui</strong> a avaliação de
        gestão — serve para reconhecer quem está com folga/sobra de capacidade e dimensionar a
        equipe. Tarefas de “tempo é referência” e de presença/plantão ficam de fora.
      </div>

      {carregando ? (
        <div className="painel"><Carregando texto="Calculando…" style={{ padding: 48 }} /></div>
      ) : (
        <div className="painel" style={{ overflowX: "auto" }}>
          <table className="tabela">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Funcionário</th>
                <th>Sede</th>
                <th style={{ textAlign: "right" }}>Serviços</th>
                <th style={{ textAlign: "right" }}>Tempo realizado</th>
                <th style={{ textAlign: "right" }}>Aderência</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.funcionario.id}>
                  <td className="num" style={{ color: "var(--tinta-3)" }}>
                    {l.aderencia != null ? (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1) : "—"}
                  </td>
                  <td><strong>{l.funcionario.nome}</strong></td>
                  <td>{nomeSede(l.funcionario.sede_id)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{l.realizadas}</td>
                  <td className="num" style={{ textAlign: "right" }}>{formatarDuracao(l.tempoReal)}</td>
                  <td style={{ textAlign: "right" }}>
                    {l.aderencia == null ? (
                      <span style={{ color: "var(--tinta-3)", fontSize: 12 }} title="Sem execuções comparáveis no período">sem base</span>
                    ) : (
                      <span className={`selo num ${l.aderencia >= 80 ? "selo-verde" : l.aderencia >= 50 ? "selo-amarelo" : "selo-vermelho"}`}>
                        {l.aderencia.toFixed(0)}% ({l.comDesvio})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--tinta-3)" }}>
                  Nenhum funcionário no escopo.
                </td></tr>
              )}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: "var(--tinta-3)", padding: "8px 12px" }}>
            Aderência = % das execuções comparáveis cujo tempo real ficou dentro de ±
            {params.desvio_justificativa_percentual}% do previsto. O número entre parênteses é
            quantas execuções entraram na conta.
          </p>
        </div>
      )}
    </div>
  );
}
