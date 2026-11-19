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
  deficitEstimado,
  desvioPercentual,
  ehAtividadeAdicional,
  eventuaisForaDasTarefas,
  minutosDoEventual,
  eventuaisNoApoio,
  ocupacaoPorPessoa,
  pessoasDoPeriodo,
  PARAMETROS_PADRAO,
  resumoDeOcupacao,
  ocupaHorario,
  CATEGORIA_APOIO_OUTRO_SETOR,
  CATEGORIA_APOIO_PEDAGOGICO,
  percentualApoioOutroSetor,
  semAusentes,
} from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { baixarCSV } from "@/lib/csv";
import { useSessao } from "@/components/SessaoContexto";
import { sedesPermitidas } from "@/lib/permissions";
import { MAX_DIAS_PERIODO, MAX_DIAS_SEM_SEDE, diasDoPeriodo, formatarDataBR, formatarDuracao, hojeISO } from "@/lib/dateUtils";
import type {
  TipoLocalCatalogo,
  Ausencia,
  ExecucaoRealizada,
  Feriado,
  Funcionario,
  Local,
  ParametrosResolvidos,
  RotinaPlanejada,
  Sede,
  ServicoEventual,
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
  // Período fora do teto: a tela nem pede (a API recusaria) e mostra um aviso no
  // lugar dos números — com `keepPreviousData`, seguiriam os do período ANTERIOR
  // sob as datas novas.
  const [sedeFiltro, setSedeFiltro] = useState("");
  const sessao = useSessao();
  // Mesmo teto do servidor: quem vê todas as sedes, sem escolher uma, lê as 17 — um mês.
  const teto = !sedeFiltro && sessao && sedesPermitidas(sessao) === null ? MAX_DIAS_SEM_SEDE : MAX_DIAS_PERIODO;
  const periodoOk = diasDoPeriodo(de, ate, teto) !== null;

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  // Mesma sede das rotinas: sem `?sede=` o coordenador recebia só a equipe e
  // os locais da principal, e numa sede extra a ocupação saía sobre ninguém.
  const { data: funcionarios } = useSWR<Funcionario[]>(
    `/api/funcionarios${sedeFiltro ? `?sede=${sedeFiltro}` : ""}`,
    fetcher,
  );
  const { data: locais } = useSWR<Local[]>(`/api/locais${sedeFiltro ? `?sede=${sedeFiltro}` : ""}`, fetcher);
  const { data: tiposLocal } = useSWR<TipoLocalCatalogo[]>("/api/tipos-local", fetcher);
  const fatorDoTipo = useMemo(
    () =>
      new Map(
        (tiposLocal ?? [])
          .filter((t) => Number(t.fator_intensidade) > 0)
          .map((t) => [t.id, Number(t.fator_intensidade)] as const),
      ),
    [tiposLocal],
  );
  // Mesma sede das rotinas: sem `?sede=` o coordenador recebe só as da sede
  // principal, e o apoio/desvio de uma sede extra contaria 0.
  const { data: tarefas, mutate: mutateTarefas } = useSWR<Tarefa[]>(
    `/api/tarefas${sedeFiltro ? `?sede=${sedeFiltro}` : ""}`,
    fetcher,
  );
  // Parâmetros da sede do filtro: Benfica, DT1, DT2 e Eusébio têm os próprios, e
  // sem `&sede` a sede extra era medida com os da principal (22/10/2026).
  const { data: parametros } = useSWR<ParametrosResolvidos>(
    `/api/parametros?resolvidos=1${sedeFiltro ? `&sede=${sedeFiltro}` : ""}`,
    fetcher,
  );
  const { data: rotinas } = useSWR<RotinaPlanejada[]>(
    periodoOk && `/api/rotinas?de=${de}&ate=${ate}${sedeFiltro ? `&sede=${sedeFiltro}` : ""}`,
    fetcher,
  );
  const { data: eventuais } = useSWR<ServicoEventual[]>(
    periodoOk && `/api/servicos-eventuais?de=${de}&ate=${ate}${sedeFiltro ? `&sede=${sedeFiltro}` : ""}`,
    fetcher,
  );
  const { data: feriados } = useSWR<Feriado[]>(`/api/feriados${sedeFiltro ? `?sede=${sedeFiltro}` : ""}`, fetcher);
  const { data: ausencias } = useSWR<Ausencia[]>(
    periodoOk && `/api/ausencias?de=${de}&ate=${ate}${sedeFiltro ? `&sede=${sedeFiltro}` : ""}`,
    fetcher,
  );
  const { data: execucoes } = useSWR<ExecucaoRealizada[]>(
    periodoOk && `/api/execucoes?de=${de}&ate=${ate}${sedeFiltro ? `&sede=${sedeFiltro}` : ""}`,
    fetcher,
  );

  const params = parametros ?? PARAMETROS_PADRAO;

  const indicadores = useMemo(() => {
    const rs = rotinas ?? [];
    // Quem saiu entra nos períodos em que teve tarefa; a contagem de ativos fica só com os de hoje.
    const funcs = pessoasDoPeriodo(funcionarios ?? [], rs).filter((f) => !sedeFiltro || f.sede_id === sedeFiltro);
    const validas = rs.filter(ocupaHorario);

    // O serviço eventual conta, sem o que caiu em horário que já tinha tarefa — salvo a
    // atividade adicional ("Apoio a outro setor"), que soma sempre (Consulta 6, 18/11/2026).
    const evs = semAusentes(eventuais ?? [], ausencias ?? []);
    const foraDasTarefas = eventuaisForaDasTarefas(validas, evs);
    // Déficit estimado em horas-pessoa: o número para a gestão (Consulta 6). O que a
    // atividade adicional explica é só a diferença para a conta sem ela.
    const deficit = deficitEstimado({ funcionarios: funcs, rotinas: rs, eventuais: evs, feriados: feriados ?? [] });
    // Perfil da atividade adicional por pessoa: horas e o subconjunto com movimentação de carga.
    // O tipo descreve a ocorrência; NUNCA entra na conta do tempo.
    const idsFuncs = new Set(funcs.map((f) => f.id));
    const adicionais = evs.filter((e) => ehAtividadeAdicional(e) && idsFuncs.has(e.funcionario_id));
    // Minutos sem duplicar: o mesmo horário lançado duas vezes conta uma, como na demanda.
    const minutosSemDobra = (lista: typeof adicionais) => eventuaisForaDasTarefas([], lista).reduce((s, x) => s + x.tempo_previsto_min, 0);
    const classificado = (e: (typeof adicionais)[number]) => !!e.exigencia && e.exigencia !== "nao_sei";
    const porPessoaAdicional = new Map<string, { min: number; n: number; cargasMin: number }>();
    for (const id of new Set(adicionais.map((e) => e.funcionario_id))) {
      const dela = adicionais.filter((e) => e.funcionario_id === id);
      porPessoaAdicional.set(id, {
        min: minutosSemDobra(dela),
        n: dela.length,
        cargasMin: minutosSemDobra(dela.filter((e) => e.exigencia === "cargas")),
      });
    }
    const diasRotina = new Set(validas.map((r) => r.data));
    const diasComRotina = diasRotina.size;
    // Só os dias que estão no denominador: um evento em dia sem rota não vira "8 de 7 dias".
    const diasComAdicional = new Set(adicionais.map((e) => e.data).filter((d) => diasRotina.has(d))).size;
    const adicionalMin = minutosSemDobra(adicionais);
    const classificadoMin = minutosSemDobra(adicionais.filter(classificado));
    const tempoPlanejadoTotal = [...validas, ...foraDasTarefas].reduce((s, r) => s + r.tempo_previsto_min, 0);
    // Quanto do tempo vai para outro setor (plantão, cantina, portaria, eventos)
    // — com o apoio pedagógico somado e mostrado à parte (23/10/2026).
    const tarefasPedagogicas = new Set(
      (tarefas ?? []).filter((t) => t.categoria_id === CATEGORIA_APOIO_PEDAGOGICO).map((t) => t.id),
    );
    const tarefasDeApoio = new Set([
      ...(tarefas ?? []).filter((t) => t.categoria_id === CATEGORIA_APOIO_OUTRO_SETOR).map((t) => t.id),
      ...tarefasPedagogicas,
    ]);
    const apoioOutroSetorPct = percentualApoioOutroSetor(
      validas,
      tarefasDeApoio,
      eventuaisNoApoio(validas, evs, [CATEGORIA_APOIO_OUTRO_SETOR, CATEGORIA_APOIO_PEDAGOGICO]),
    );
    const apoioPedagogicoPct = percentualApoioOutroSetor(
      validas,
      tarefasPedagogicas,
      eventuaisNoApoio(validas, evs, [CATEGORIA_APOIO_PEDAGOGICO]),
    );

    // Ocupação média por funcionário nos dias em que houve planejamento.
    const porFuncionario = ocupacaoPorPessoa(funcs, [...validas, ...foraDasTarefas], feriados ?? []);
    const resumo = resumoDeOcupacao(porFuncionario, params);
    const ocupacaoMedia = resumo.ocupacaoMedia ?? 0;
    const sobrecarregados = resumo.emSobrecarga;
    const subutilizados = resumo.subutilizados;
    const ociosidadeTotal = resumo.ociosidadeMin;

    // Tempo por local e por sede.
    const tempoPorLocal = new Map<string, number>();
    const tempoPorSede = new Map<string, number>();
    const porStatus = new Map<string, number>();
    for (const r of rs) {
      porStatus.set(r.status, (porStatus.get(r.status) ?? 0) + 1);
      if (!ocupaHorario(r)) continue;
      tempoPorLocal.set(r.local_id, (tempoPorLocal.get(r.local_id) ?? 0) + r.tempo_previsto_min);
      tempoPorSede.set(r.sede_id, (tempoPorSede.get(r.sede_id) ?? 0) + r.tempo_previsto_min);
    }
    // Mesma conta do "Tempo planejado" lá em cima: o gráfico dizia 31 h ao lado de 40 h.
    for (const e of foraDasTarefas)
      if (e.sede_id) tempoPorSede.set(e.sede_id, (tempoPorSede.get(e.sede_id) ?? 0) + e.tempo_previsto_min);

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
      // Só desvio de verdade: com quase tudo fechado "conforme", o top 10 saía cheio de 0%.
      .filter((d) => Math.abs(d.desvio) >= 0.5)
      .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))
      .slice(0, 10);

    return {
      apoioOutroSetorPct,
      apoioPedagogicoPct,
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
      funcsAtivos: funcs.filter((f) => f.ativo).length,
      deficit,
      porPessoaAdicional,
      diasComRotina,
      diasComAdicional,
      adicionalMin,
      classificadoMin,
      ocorrenciasAdicionais: adicionais.length,
    };
  }, [rotinas, eventuais, ausencias, feriados, execucoes, funcionarios, tarefas, sedeFiltro, params]);

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

  // Tempo e tipo em campos separados ("dessas Xh, Yh..."): o tipo é subconjunto do tempo
  // que já entrou na demanda, nunca um acréscimo (Consulta 6).
  const barrasAdicional: ItemBarra[] = [...indicadores.porPessoaAdicional]
    .sort((a, b) => b[1].min - a[1].min)
    .map(([id, a]) => ({
      rotulo: nomeFuncionario(id),
      valor: a.min,
      texto: `${formatarDuracao(a.min)} · ${a.n} ocorrência${a.n === 1 ? "" : "s"}${a.cargasMin ? ` · dessas, ${formatarDuracao(a.cargasMin)} com movimentação de cargas` : ""}`,
      cor: "var(--acento)",
    }));
  const notaAdicional = indicadores.ocorrenciasAdicionais
    ? `Atividade adicional registrada em ${indicadores.diasComAdicional} dos ${indicadores.diasComRotina} dias com rotina gerada — dia sem registro não quer dizer dia sem apoio. ` +
      `Tipo informado em ${indicadores.adicionalMin ? Math.round((100 * indicadores.classificadoMin) / indicadores.adicionalMin) : 0}% das horas. ` +
      `A atividade adicional soma sempre na demanda; apoio pedagógico e capacitação só contam fora do horário de tarefa.`
    : undefined;

  const barrasDesvio: ItemBarra[] = indicadores.desvios.map(({ rotina, execucao, desvio }) => ({
    rotulo: `${nomeTarefa(rotina.tarefa_id)} · ${nomeFuncionario(rotina.funcionario_id)} (${rotina.data.slice(8)}/${rotina.data.slice(5, 7)})`,
    valor: Math.abs(desvio),
    texto: `${desvio > 0 ? "+" : ""}${desvio.toFixed(0)}% (${formatarDuracao(rotina.tempo_previsto_min)} → ${formatarDuracao(execucao.tempo_real_min)})`,
    cor:
      Math.abs(desvio) > params.desvio_justificativa_percentual
        ? "var(--vermelho)"
        : "var(--laranja)",
  }));

  if (periodoOk && (!rotinas || !funcionarios || !tarefas)) {
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
        <button
          className="btn"
          onClick={() => window.print()}
          disabled={!periodoOk || ((rotinas ?? []).length === 0 && (eventuais ?? []).length === 0)}
        >
          🖨 Imprimir / PDF
        </button>
        <button className="btn" onClick={exportarCSV} disabled={!periodoOk || (rotinas ?? []).length === 0}>
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

      {!periodoOk ? (
        <div className="alerta alerta-erro">Escolha um período de até {teto} dias, com “De” antes de “Até”.</div>
      ) : (
        <>
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
              rotulo="Déficit estimado"
              valor={`${(indicadores.deficit.totalMin / 60).toFixed(1).replace(".", ",")} h-pessoa`}
              detalhe={
                indicadores.deficit.totalMin > indicadores.deficit.semAdicionalMin
                  ? `${((indicadores.deficit.totalMin - indicadores.deficit.semAdicionalMin) / 60).toFixed(1).replace(".", ",")} h pela atividade adicional`
                  : "demanda além da jornada, dia a dia"
              }
              cor="var(--vermelho)"
            />
            <CartaoKpi
              rotulo="Subutilizados"
              valor={String(indicadores.subutilizados)}
              detalhe={`abaixo de ${params.ocupacao_baixa}%`}
              cor="var(--cinza-bloco)"
            />
            <CartaoKpi
              rotulo="Apoio a outro setor"
              valor={indicadores.apoioOutroSetorPct === null ? "—" : `${indicadores.apoioOutroSetorPct.toFixed(1)}%`}
              detalhe={
                indicadores.apoioPedagogicoPct
                  ? `do tempo planejado · ${indicadores.apoioPedagogicoPct.toFixed(1)}% pedagógico`
                  : "do tempo planejado · plantão, cantina, portaria, eventos"
              }
              cor="var(--acento)"
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
              fatorDoTipo={fatorDoTipo}
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
            <ListaBarras
              titulo="Atividade adicional por funcionário"
              itens={barrasAdicional}
              vazio="Nenhuma atividade adicional registrada no período."
              nota={notaAdicional}
            />
            <ListaBarras titulo="Top 10 locais por tempo consumido" itens={barrasLocais} />
            <ListaBarras titulo="Tempo planejado por sede" itens={barrasSedes} />
            <ListaBarras titulo="Tarefas por status" itens={barrasStatus} />
            <ListaBarras
              titulo="Top 10 desvios previsto × realizado"
              itens={barrasDesvio}
              vazio="Nenhum desvio no período: as tarefas registradas foram feitas no tempo previsto."
            />
          </div>
        </>
      )}
    </div>
  );
}
