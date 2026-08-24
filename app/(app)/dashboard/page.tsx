"use client";

/** Dashboard de indicadores: ocupação, ociosidade, tempo por local/sede. */
import { useMemo, useState } from "react";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import { CartaoKpi, ListaBarras, type ItemBarra } from "@/components/DashboardCards";
import SugestoesAjuste from "@/components/SugestoesAjuste";
import {
  classificarOcupacao,
  cobraDesvio,
  desvioPercentual,
  jornadaLiquidaMin,
  PARAMETROS_PADRAO,
} from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { baixarCSV } from "@/lib/csv";
import { formatarDataBR, formatarDuracao, hojeISO } from "@/lib/dateUtils";
import type {
  ExecucaoRealizada,
  Funcionario,
  Local,
  ParametrosResolvidos,
  RotinaPlanejada,
  Sede,
  Tarefa,
} from "@/types";

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ROTULO_STATUS: Record<string, string> = {
  planejada: "Planejada",
  realizada: "Realizada",
  nao_realizada: "Não realizada",
  remanejada: "Remanejada",
  cancelada: "Cancelada",
  pendente: "Pendente",
};

const COR_STATUS: Record<string, string> = {
  planejada: "var(--azul)",
  realizada: "var(--verde)",
  nao_realizada: "var(--vermelho)",
  remanejada: "var(--laranja)",
  cancelada: "var(--cinza-bloco)",
  pendente: "var(--laranja)",
};

export default function PaginaDashboard() {
  const [de, setDe] = useState(diasAtras(6));
  const [ate, setAte] = useState(hojeISO());
  const [sedeFiltro, setSedeFiltro] = useState("");

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: locais } = useSWR<Local[]>("/api/locais", fetcher);
  const { data: tarefas, mutate: mutateTarefas } = useSWR<Tarefa[]>("/api/tarefas", fetcher);
  const { data: parametros } = useSWR<ParametrosResolvidos>(
    "/api/parametros?resolvidos=1",
    fetcher,
  );
  const { data: rotinas } = useSWR<RotinaPlanejada[]>(
    `/api/rotinas?de=${de}&ate=${ate}${sedeFiltro ? `&sede=${sedeFiltro}` : ""}`,
    fetcher,
  );
  const { data: execucoes } = useSWR<ExecucaoRealizada[]>(
    `/api/execucoes?de=${de}&ate=${ate}${sedeFiltro ? `&sede=${sedeFiltro}` : ""}`,
    fetcher,
  );

  const params = parametros ?? PARAMETROS_PADRAO;

  const indicadores = useMemo(() => {
    const rs = rotinas ?? [];
    const funcs = (funcionarios ?? []).filter(
      (f) => f.ativo && (!sedeFiltro || f.sede_id === sedeFiltro),
    );
    const validas = rs.filter((r) => r.status !== "cancelada");

    const tempoPlanejadoTotal = validas.reduce((s, r) => s + r.tempo_previsto_min, 0);

    // Ocupação média por funcionário nos dias em que houve planejamento.
    const porFuncionario = funcs.map((f) => {
      const minhas = validas.filter((r) => r.funcionario_id === f.id);
      const dias = new Set(minhas.map((r) => r.data)).size;
      const jornada = jornadaLiquidaMin(f);
      const planejado = minhas.reduce((s, r) => s + r.tempo_previsto_min, 0);
      const ocupacao = dias > 0 && jornada > 0 ? (planejado / (jornada * dias)) * 100 : 0;
      return { funcionario: f, dias, planejado, jornada, ocupacao };
    });

    const comPlanejamento = porFuncionario.filter((p) => p.dias > 0);
    const ocupacaoMedia =
      comPlanejamento.length > 0
        ? comPlanejamento.reduce((s, p) => s + p.ocupacao, 0) / comPlanejamento.length
        : 0;

    const sobrecarregados = comPlanejamento.filter(
      (p) => classificarOcupacao(p.ocupacao, params) === "sobrecarga",
    ).length;
    const subutilizados = comPlanejamento.filter(
      (p) => classificarOcupacao(p.ocupacao, params) === "subutilizado",
    ).length;

    const ociosidadeTotal = comPlanejamento.reduce(
      (s, p) => s + Math.max(0, p.jornada * p.dias - p.planejado),
      0,
    );

    // Tempo por local e por sede.
    const tempoPorLocal = new Map<string, number>();
    const tempoPorSede = new Map<string, number>();
    const porStatus = new Map<string, number>();
    for (const r of rs) {
      porStatus.set(r.status, (porStatus.get(r.status) ?? 0) + 1);
      if (r.status === "cancelada") continue;
      tempoPorLocal.set(r.local_id, (tempoPorLocal.get(r.local_id) ?? 0) + r.tempo_previsto_min);
      tempoPorSede.set(r.sede_id, (tempoPorSede.get(r.sede_id) ?? 0) + r.tempo_previsto_min);
    }

    // Previsto × realizado (execuções com tempo real informado).
    const rotinaPorId = new Map(rs.map((r) => [r.id, r]));
    const execsDoEscopo = (execucoes ?? []).filter((e) => rotinaPorId.has(e.rotina_id));
    const tempoRealizadoTotal = execsDoEscopo.reduce((s, e) => s + (e.tempo_real_min || 0), 0);
    const tarefasRealizadas = execsDoEscopo.filter((e) =>
      ["conforme_planejado", "com_atraso", "parcial"].includes(e.status_realizado),
    ).length;
    const tarefasNaoRealizadas = execsDoEscopo.filter(
      (e) => e.status_realizado === "nao_realizada",
    ).length;
    const cobraPorTarefa = new Map((tarefas ?? []).map((t) => [t.id, cobraDesvio(t)]));
    const desvios = execsDoEscopo
      .filter((e) => e.tempo_real_min > 0)
      // tarefas de referência/presença não contam como desvio (execução varia)
      .filter((e) => cobraPorTarefa.get(rotinaPorId.get(e.rotina_id)!.tarefa_id) !== false)
      .map((e) => {
        const rotina = rotinaPorId.get(e.rotina_id)!;
        return {
          rotina,
          execucao: e,
          desvio: desvioPercentual(e.tempo_real_min, rotina.tempo_previsto_min),
        };
      })
      .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))
      .slice(0, 10);

    return {
      tempoRealizadoTotal,
      tarefasRealizadas,
      tarefasNaoRealizadas,
      desvios,
      totalRotinas: validas.length,
      tempoPlanejadoTotal,
      ocupacaoMedia,
      sobrecarregados,
      subutilizados,
      ociosidadeTotal,
      porFuncionario,
      tempoPorLocal,
      tempoPorSede,
      porStatus,
      funcsAtivos: funcs.length,
    };
  }, [rotinas, execucoes, funcionarios, tarefas, sedeFiltro, params]);

  const nomeLocal = (id: string) => {
    const l = (locais ?? []).find((x) => x.id === id);
    const s = (sedes ?? []).find((x) => x.id === l?.sede_id);
    return l ? `${l.nome_local} — ${s?.nome_sede ?? ""}` : id;
  };
  const nomeSede = (id: string) => (sedes ?? []).find((s) => s.id === id)?.nome_sede ?? id;

  const barrasOcupacao: ItemBarra[] = indicadores.porFuncionario
    .filter((p) => p.dias > 0)
    .sort((a, b) => b.ocupacao - a.ocupacao)
    .map((p) => {
      const classe = classificarOcupacao(p.ocupacao, params);
      const cor =
        classe === "sobrecarga"
          ? "var(--vermelho)"
          : classe === "alta_ocupacao"
            ? "var(--amarelo)"
            : classe === "adequado"
              ? "var(--verde)"
              : "var(--cinza-bloco)";
      return {
        rotulo: p.funcionario.nome,
        valor: p.ocupacao,
        texto: `${p.ocupacao.toFixed(0)}%`,
        cor,
      };
    });

  const barrasLocais: ItemBarra[] = [...indicadores.tempoPorLocal.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, min]) => ({
      rotulo: nomeLocal(id),
      valor: min,
      texto: formatarDuracao(min),
      cor: "var(--acento)",
    }));

  const barrasSedes: ItemBarra[] = [...indicadores.tempoPorSede.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, min]) => ({
      rotulo: nomeSede(id),
      valor: min,
      texto: formatarDuracao(min),
      cor: "var(--azul)",
    }));

  const barrasStatus: ItemBarra[] = [...indicadores.porStatus.entries()].map(
    ([status, qtd]) => ({
      rotulo: ROTULO_STATUS[status] ?? status,
      valor: qtd,
      texto: String(qtd),
      cor: COR_STATUS[status],
    }),
  );

  const nomeTarefa = (id: string) =>
    (tarefas ?? []).find((t) => t.id === id)?.nome_tarefa ?? "Tarefa";
  const nomeFuncionario = (id: string) =>
    (funcionarios ?? []).find((f) => f.id === id)?.nome ?? "?";

  function exportarCSV() {
    const execPorRotina = new Map((execucoes ?? []).map((e) => [e.rotina_id, e]));
    baixarCSV(
      `rotinas_${de}_a_${ate}`,
      ["Data", "Sede", "Funcionário", "Tarefa", "Início", "Fim", "Previsto (min)", "Real (min)", "Desvio %", "Status", "Justificativa"],
      (rotinas ?? []).map((r) => {
        const exec = execPorRotina.get(r.id);
        const desvio =
          exec && exec.tempo_real_min > 0
            ? desvioPercentual(exec.tempo_real_min, r.tempo_previsto_min).toFixed(1)
            : "";
        return [
          r.data,
          nomeSede(r.sede_id),
          nomeFuncionario(r.funcionario_id),
          nomeTarefa(r.tarefa_id),
          r.inicio_planejado,
          r.fim_planejado,
          r.tempo_previsto_min,
          exec?.tempo_real_min ?? "",
          desvio,
          ROTULO_STATUS[r.status] ?? r.status,
          exec?.justificativa ?? "",
        ];
      }),
    );
  }

  const barrasDesvio: ItemBarra[] = indicadores.desvios.map(({ rotina, execucao, desvio }) => ({
    rotulo: `${nomeTarefa(rotina.tarefa_id)} · ${nomeFuncionario(rotina.funcionario_id)} (${rotina.data.slice(8)}/${rotina.data.slice(5, 7)})`,
    valor: Math.abs(desvio),
    texto: `${desvio > 0 ? "+" : ""}${desvio.toFixed(0)}% (${formatarDuracao(rotina.tempo_previsto_min)} → ${formatarDuracao(execucao.tempo_real_min)})`,
    cor:
      Math.abs(desvio) > params.desvio_justificativa_percentual
        ? "var(--vermelho)"
        : "var(--laranja)",
  }));

  if (!rotinas || !funcionarios) {
    return (
      <div className="painel entra" style={{ marginTop: 24 }}>
        <Carregando texto="Carregando indicadores…" style={{ padding: 64 }} />
      </div>
    );
  }

  const sedeRotulo = sedeFiltro ? (sedes ?? []).find((s) => s.id === sedeFiltro)?.nome_sede ?? sedeFiltro : "Todas as sedes";

  return (
    <div className="entra">
      {/* cabeçalho que aparece só na impressão (relatório gerencial) */}
      <div className="so-impressao" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Relatório gerencial — Orkestria</h1>
        <div className="num" style={{ color: "var(--tinta-2)", fontSize: 13, marginTop: 2 }}>
          Período {formatarDataBR(de)}–{formatarDataBR(ate)} · {sedeRotulo}
        </div>
      </div>

      {/* filtros (somem na impressão) */}
      <div
        className="painel nao-imprimir"
        style={{ display: "flex", alignItems: "flex-end", gap: 14, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>Dashboard</h1>
          <span className="rotulo" style={{ color: "var(--acento)" }}>
            indicadores de capacidade e ociosidade prevista
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => window.print()} disabled={(rotinas ?? []).length === 0}>
          🖨 Imprimir / PDF
        </button>
        <button className="btn" onClick={exportarCSV} disabled={(rotinas ?? []).length === 0}>
          ⬇ Exportar CSV
        </button>
        <label className="campo">
          <span className="rotulo">De</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="campo">
          <span className="rotulo">Até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <label className="campo">
          <span className="rotulo">Sede</span>
          <select value={sedeFiltro} onChange={(e) => setSedeFiltro(e.target.value)}>
            <option value="">Todas</option>
            {(sedes ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome_sede}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <CartaoKpi rotulo="Funcionários ativos" valor={String(indicadores.funcsAtivos)} />
        <CartaoKpi rotulo="Tarefas planejadas" valor={String(indicadores.totalRotinas)} detalhe="no período" />
        <CartaoKpi
          rotulo="Tempo planejado"
          valor={formatarDuracao(indicadores.tempoPlanejadoTotal)}
          cor="var(--azul)"
        />
        <CartaoKpi
          rotulo="Tempo realizado"
          valor={formatarDuracao(indicadores.tempoRealizadoTotal)}
          detalhe={`${indicadores.tarefasRealizadas} realizadas · ${indicadores.tarefasNaoRealizadas} não realizadas`}
          cor="var(--verde)"
        />
        <CartaoKpi
          rotulo="Ociosidade prevista"
          valor={formatarDuracao(indicadores.ociosidadeTotal)}
          detalhe="nos dias com planejamento"
          cor="var(--laranja)"
        />
        <CartaoKpi
          rotulo="Ocupação média"
          valor={`${indicadores.ocupacaoMedia.toFixed(0)}%`}
          cor="var(--verde)"
        />
        <CartaoKpi
          rotulo="Sobrecarga"
          valor={String(indicadores.sobrecarregados)}
          detalhe="funcionários acima de 100%"
          cor="var(--vermelho)"
        />
        <CartaoKpi
          rotulo="Subutilizados"
          valor={String(indicadores.subutilizados)}
          detalhe={`abaixo de ${params.ocupacao_baixa}%`}
          cor="var(--cinza-bloco)"
        />
      </div>

      {/* ferramentas interativas — não fazem parte do relatório impresso */}
      <div className="nao-imprimir">

        {/* tempos padrão para revisar (previsto × realidade) */}
        <SugestoesAjuste
          rotinas={rotinas ?? []}
          execucoes={execucoes ?? []}
          tarefas={(tarefas ?? []).filter((t) => !sedeFiltro || t.sede_id === sedeFiltro)}
          locais={locais ?? []}
          parametros={params}
          aoAplicado={() => void mutateTarefas()}
        />
      </div>

      {/* gráficos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
        }}
      >
        <ListaBarras titulo="Ocupação por funcionário" itens={barrasOcupacao} />
        <ListaBarras titulo="Top 10 locais por tempo consumido" itens={barrasLocais} />
        <ListaBarras titulo="Tempo planejado por sede" itens={barrasSedes} />
        <ListaBarras titulo="Tarefas por status" itens={barrasStatus} />
        <ListaBarras
          titulo="Top 10 desvios previsto × realizado"
          itens={barrasDesvio}
          vazio="Nenhuma execução com tempo real registrada no período."
        />
      </div>
    </div>
  );
}
