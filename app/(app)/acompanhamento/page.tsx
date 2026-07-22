"use client";

/**
 * Fase 2 — Acompanhamento do dia: o supervisor marca o que realmente
 * aconteceu (status, tempo real, justificativa) e o sistema confronta
 * previsto × realizado.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import {
  cobraDesvio,
  desvioPercentual,
  exigeJustificativa,
  PARAMETROS_PADRAO,
} from "@/lib/calculations";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { baixarCSV } from "@/lib/csv";
import { formatarDataBR, formatarDuracao, hhmmParaMin, hojeISO, somarDias } from "@/lib/dateUtils";
import type {
  ExecucaoRealizada,
  Funcionario,
  Local,
  ParametrosResolvidos,
  Requisito,
  RotinaPlanejada,
  Sede,
  StatusRealizado,
  Tarefa,
} from "@/types";

const OPCOES_STATUS: Array<{ valor: StatusRealizado; rotulo: string }> = [
  { valor: "conforme_planejado", rotulo: "Realizada conforme planejado" },
  { valor: "com_atraso", rotulo: "Realizada com atraso" },
  { valor: "parcial", rotulo: "Realizada parcialmente" },
  { valor: "nao_realizada", rotulo: "Não realizada" },
  { valor: "remanejada", rotulo: "Remanejada" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

const SELO_STATUS_ROTINA: Record<string, { classe: string; rotulo: string }> = {
  planejada: { classe: "selo-azul", rotulo: "Planejada" },
  realizada: { classe: "selo-verde", rotulo: "Realizada" },
  nao_realizada: { classe: "selo-vermelho", rotulo: "Não realizada" },
  remanejada: { classe: "selo-laranja", rotulo: "Remanejada" },
  cancelada: { classe: "selo-cinza", rotulo: "Cancelada" },
  pendente: { classe: "selo-laranja", rotulo: "Pendente" },
};

interface FormExecucao {
  status_realizado: StatusRealizado;
  inicio_real: string;
  fim_real: string;
  tempo_real_min: number;
  justificativa: string;
  observacao: string;
  /** EPIs confirmados como usados (nomes). */
  epis: string[];
}

const FORM_VAZIO: FormExecucao = {
  status_realizado: "conforme_planejado",
  inicio_real: "",
  fim_real: "",
  tempo_real_min: 0,
  justificativa: "",
  observacao: "",
  epis: [],
};

export default function PaginaAcompanhamento() {
  const [data, setData] = useState(hojeISO());
  const [sedeEscolhida, setSedeEscolhida] = useState("");
  const [rotinaAberta, setRotinaAberta] = useState<RotinaPlanejada | null>(null);
  const [form, setForm] = useState<FormExecucao>(FORM_VAZIO);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [processandoRapido, setProcessandoRapido] = useState<Set<string>>(() => new Set());
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const sedeId = sedeEscolhida || sedes?.find((s) => s.ativo)?.id || "";

  const { data: rotinas, mutate: mutateRotinas } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?data=${data}&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: execucoes, mutate: mutateExecucoes } = useSWR<ExecucaoRealizada[]>(
    sedeId ? `/api/execucoes?de=${data}&ate=${data}&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: funcionarios } = useSWR<Funcionario[]>(
    sedeId ? `/api/funcionarios?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: tarefas } = useSWR<Tarefa[]>(
    sedeId ? `/api/tarefas?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: locais } = useSWR<Local[]>(
    sedeId ? `/api/locais?sede=${sedeId}` : null,
    fetcher,
  );
  const { data: parametros } = useSWR<ParametrosResolvidos>(
    sedeId ? `/api/parametros?resolvidos=1&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: requisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);
  const params = parametros ?? PARAMETROS_PADRAO;

  // Dias anteriores (última semana) com tarefas planejadas sem registro.
  const hoje = hojeISO();
  const { data: rotinasAnteriores } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?de=${somarDias(hoje, -7)}&ate=${somarDias(hoje, -1)}&sede=${sedeId}` : null,
    fetcher,
  );
  const diasPendentes = useMemo(() => {
    const porDia = new Map<string, number>();
    for (const r of rotinasAnteriores ?? []) {
      if (r.status !== "planejada" && r.status !== "pendente") continue;
      porDia.set(r.data, (porDia.get(r.data) ?? 0) + 1);
    }
    return [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rotinasAnteriores]);

  const funcPorId = useMemo(() => new Map((funcionarios ?? []).map((f) => [f.id, f])), [funcionarios]);
  const tarefaPorId = useMemo(() => new Map((tarefas ?? []).map((t) => [t.id, t])), [tarefas]);
  const localPorId = useMemo(() => new Map((locais ?? []).map((l) => [l.id, l])), [locais]);
  const reqPorId = useMemo(() => new Map((requisitos ?? []).map((r) => [r.id, r])), [requisitos]);
  const execucaoPorRotina = useMemo(
    () => new Map((execucoes ?? []).map((e) => [e.rotina_id, e])),
    [execucoes],
  );

  const linhas = useMemo(
    () =>
      (rotinas ?? [])
        .slice()
        .sort(
          (a, b) =>
            (funcPorId.get(a.funcionario_id)?.nome ?? "").localeCompare(
              funcPorId.get(b.funcionario_id)?.nome ?? "",
            ) || a.inicio_planejado.localeCompare(b.inicio_planejado),
        ),
    [rotinas, funcPorId],
  );

  const pendentes = linhas.filter((r) => !execucaoPorRotina.has(r.id)).length;

  function tarefaExigeEpi(tarefaId: string): boolean {
    const tarefa = tarefaPorId.get(tarefaId);
    if (!tarefa) return true; // sem cadastro carregado, mantém o caminho seguro
    return (tarefa.requisitos ?? "")
      .split(",")
      .filter(Boolean)
      .some((id) => reqPorId.get(id)?.tipo === "epi");
  }

  async function confirmarConforme(rotina: RotinaPlanejada) {
    // A declaração de EPI exige gesto explícito no formulário completo.
    if (tarefaExigeEpi(rotina.tarefa_id)) {
      abrirRegistro(rotina);
      return;
    }
    setMensagem(null);
    setProcessandoRapido((atuais) => new Set(atuais).add(rotina.id));
    try {
      await apiPost("/api/execucoes/conforme", { rotina_id: rotina.id });
      setMensagem({ texto: "Realizado confirmado sem abrir formulário." });
      await Promise.all([mutateRotinas(), mutateExecucoes()]);
    } catch (err) {
      setMensagem({
        texto: err instanceof ErroApi ? err.message : "Não foi possível confirmar o realizado.",
        erro: true,
      });
    } finally {
      setProcessandoRapido((atuais) => {
        const proximos = new Set(atuais);
        proximos.delete(rotina.id);
        return proximos;
      });
    }
  }

  function abrirRegistro(rotina: RotinaPlanejada) {
    // EPIs exigidos pela tarefa — apenas para montar o texto da declaração.
    const t = tarefaPorId.get(rotina.tarefa_id);
    const exigidos: string[] = [];
    for (const id of (t?.requisitos ?? "").split(",").filter(Boolean)) {
      const req = reqPorId.get(id);
      if (req?.tipo === "epi" && !exigidos.includes(req.nome)) exigidos.push(req.nome);
    }
    const exec = execucaoPorRotina.get(rotina.id);
    // Registro NOVO nasce sem declaração: quem confirma é o supervisor, não o
    // formulário. Só um registro já gravado reabre com o que foi declarado.
    const epis = exec?.epis_confirmados
      ? exec.epis_confirmados.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setForm({
      ...FORM_VAZIO,
      inicio_real: rotina.inicio_planejado,
      fim_real: rotina.fim_planejado,
      tempo_real_min: rotina.tempo_previsto_min,
      epis,
    });
    setErro("");
    setRotinaAberta(rotina);
  }

  function calcularPeloHorario() {
    const ini = hhmmParaMin(form.inicio_real);
    const fim = hhmmParaMin(form.fim_real);
    if (!Number.isNaN(ini) && !Number.isNaN(fim) && fim > ini)
      setForm((f) => ({ ...f, tempo_real_min: fim - ini }));
  }

  function exportarCSV() {
    baixarCSV(
      `acompanhamento_${data}`,
      ["Data", "Funcionário", "Tarefa", "Local", "Início plan.", "Fim plan.", "Previsto (min)", "Real (min)", "Desvio %", "Status", "Justificativa"],
      linhas.map((r) => {
        const exec = execucaoPorRotina.get(r.id);
        const desvio =
          exec && exec.tempo_real_min > 0
            ? desvioPercentual(exec.tempo_real_min, r.tempo_previsto_min).toFixed(1)
            : "";
        return [
          r.data,
          funcPorId.get(r.funcionario_id)?.nome ?? "",
          tarefaPorId.get(r.tarefa_id)?.nome_tarefa ?? "",
          localPorId.get(r.local_id)?.nome_local ?? "",
          r.inicio_planejado,
          r.fim_planejado,
          r.tempo_previsto_min,
          exec?.tempo_real_min ?? "",
          desvio,
          SELO_STATUS_ROTINA[r.status]?.rotulo ?? r.status,
          exec?.justificativa ?? "",
        ];
      }),
    );
  }

  const statusCritico = ["nao_realizada", "remanejada", "cancelada"].includes(
    form.status_realizado,
  );
  // tarefa de referência/presença não cobra desvio
  const ehReferencia = rotinaAberta
    ? !cobraDesvio(tarefaPorId.get(rotinaAberta.tarefa_id))
    : false;
  const desvioAtual = rotinaAberta
    ? desvioPercentual(form.tempo_real_min, rotinaAberta.tempo_previsto_min)
    : 0;
  const precisaJustificar =
    statusCritico ||
    (rotinaAberta !== null &&
      !ehReferencia &&
      form.tempo_real_min > 0 &&
      exigeJustificativa(form.tempo_real_min, rotinaAberta.tempo_previsto_min, params));

  // EPIs exigidos pela tarefa da rotina aberta (requisitos tipo "epi").
  const episDaRotina = useMemo(() => {
    if (!rotinaAberta) return [];
    const t = tarefaPorId.get(rotinaAberta.tarefa_id);
    const nomes: string[] = [];
    for (const id of (t?.requisitos ?? "").split(",").filter(Boolean)) {
      const req = reqPorId.get(id);
      if (req?.tipo === "epi" && !nomes.includes(req.nome)) nomes.push(req.nome);
    }
    return nomes;
  }, [rotinaAberta, tarefaPorId, reqPorId]);

  async function salvarExecucao(e: React.FormEvent) {
    e.preventDefault();
    if (!rotinaAberta) return;
    setErro("");
    setSalvando(true);
    try {
      await apiPost("/api/execucoes", {
        rotina_id: rotinaAberta.id,
        data_execucao: data,
        status_realizado: form.status_realizado,
        inicio_real: statusCritico ? "" : form.inicio_real,
        fim_real: statusCritico ? "" : form.fim_real,
        tempo_real_min: statusCritico ? 0 : form.tempo_real_min,
        justificativa: form.justificativa,
        observacao: form.observacao,
        epis_confirmados: statusCritico ? "" : form.epis.join(", "),
      });
      await Promise.all([mutateRotinas(), mutateExecucoes()]);
      setRotinaAberta(null);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro ao registrar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="entra">
      {/* filtros */}
      <div
        className="painel"
        style={{ display: "flex", alignItems: "flex-end", gap: 14, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>Acompanhamento do dia</h1>
          <span className="rotulo" style={{ color: "var(--acento)" }}>
            registre o realizado e confronte com o previsto
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {pendentes > 0 && (
          <span className="selo selo-laranja">{pendentes} sem registro</span>
        )}
        <button className="btn" onClick={exportarCSV} disabled={linhas.length === 0}>
          ⬇ Exportar CSV
        </button>
        <label className="campo">
          <span className="rotulo">Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="campo">
          <span className="rotulo">Sede</span>
          <select value={sedeId} onChange={(e) => setSedeEscolhida(e.target.value)}>
            {(sedes ?? [])
              .filter((s) => s.ativo)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome_sede}
                </option>
              ))}
          </select>
        </label>
      </div>

      {mensagem && (
        <div
          className={`alerta ${mensagem.erro ? "alerta-erro" : "alerta-ok"} acompanhamento-mensagem`}
          role="status"
        >
          {mensagem.texto}
        </div>
      )}

      {/* dias anteriores com tarefas sem status */}
      {diasPendentes.length > 0 && (
        <div
          className="painel entra"
          style={{ marginBottom: 16, padding: "10px 14px", borderLeft: "6px solid var(--vermelho)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}
        >
          <span>
            ⚠ <strong>Dias anteriores com tarefas sem registro:</strong>
          </span>
          {diasPendentes.map(([dia, qtd]) => (
            <button
              key={dia}
              className="btn btn-mini"
              onClick={() => setData(dia)}
              title="Abrir este dia para registrar as execuções"
            >
              {formatarDataBR(dia)} · <strong className="num">{qtd}</strong>
            </button>
          ))}
        </div>
      )}

      {/* visão mobile: cards empilhados (supervisor andando pelo prédio) */}
      <div className="so-mobile" style={{ display: "grid", gap: 10 }}>
        {linhas.length === 0 && (
          <div className="painel" style={{ padding: 24, textAlign: "center", color: "var(--tinta-3)" }}>
            Nenhuma rotina planejada para esta data/sede.
          </div>
        )}
        {linhas.map((r) => {
          const exec = execucaoPorRotina.get(r.id);
          const tarefa = tarefaPorId.get(r.tarefa_id);
          const local = localPorId.get(r.local_id);
          const tarefaCarregada = Boolean(tarefa);
          const exigeEpi = tarefaExigeEpi(r.tarefa_id);
          const confirmando = processandoRapido.has(r.id);
          const selo = SELO_STATUS_ROTINA[r.status] ?? SELO_STATUS_ROTINA.planejada;
          const desvio =
            exec && exec.tempo_real_min > 0
              ? desvioPercentual(exec.tempo_real_min, r.tempo_previsto_min)
              : null;
          return (
            <div key={r.id} className="painel" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <strong style={{ fontSize: 14 }}>
                  {funcPorId.get(r.funcionario_id)?.nome ?? "?"}
                </strong>
                <span className={`selo ${selo.classe}`}>{selo.rotulo}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {tarefa?.nome_tarefa ?? "Tarefa"}
                <span style={{ color: "var(--tinta-3)" }}>
                  {local ? ` — ${local.nome_local} · ${local.andar}` : ""}
                </span>
              </div>
              <div className="num" style={{ fontSize: 12, color: "var(--tinta-2)", marginTop: 4 }}>
                {r.inicio_planejado}–{r.fim_planejado} · previsto {formatarDuracao(r.tempo_previsto_min)}
                {exec && exec.tempo_real_min > 0 && (
                  <>
                    {" "}· real {formatarDuracao(exec.tempo_real_min)}{" "}
                    <strong
                      style={{
                        color:
                          desvio !== null && Math.abs(desvio) > params.desvio_justificativa_percentual
                            ? "var(--vermelho)"
                            : "var(--verde)",
                      }}
                    >
                      ({desvio !== null && desvio > 0 ? "+" : ""}
                      {desvio?.toFixed(0)}%)
                    </strong>
                  </>
                )}
              </div>
              <div className="acompanhamento-acoes-linha">
                {!exec && !exigeEpi && (
                  <button
                    type="button"
                    className="btn btn-mini btn-conforme"
                    disabled={confirmando}
                    onClick={() => void confirmarConforme(r)}
                  >
                    {confirmando ? "Confirmando…" : "✓ Conforme"}
                  </button>
                )}
                <button
                  type="button"
                  className={`btn btn-mini ${exec ? "btn-fantasma" : exigeEpi ? "btn-primario" : "btn-fantasma"}`}
                  disabled={!exec && !tarefaCarregada}
                  onClick={() => abrirRegistro(r)}
                >
                  {exec
                    ? "Reabrir registro"
                    : !tarefaCarregada
                      ? "Carregando…"
                      : exigeEpi
                        ? "Confirmar + EPI"
                        : "Houve desvio"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* tabela do dia (desktop) */}
      <div className="painel so-desktop" style={{ overflow: "auto" }}>
        <table className="tabela">
          <thead>
            <tr>
              <th>Funcionário</th>
              <th>Tarefa / Local</th>
              <th>Planejado</th>
              <th>Previsto</th>
              <th>Realizado</th>
              <th>Desvio</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--tinta-3)" }}>
                  Nenhuma rotina planejada para esta data/sede.
                </td>
              </tr>
            )}
            {linhas.map((r) => {
              const exec = execucaoPorRotina.get(r.id);
              const tarefa = tarefaPorId.get(r.tarefa_id);
              const local = localPorId.get(r.local_id);
              const tarefaCarregada = Boolean(tarefa);
              const exigeEpi = tarefaExigeEpi(r.tarefa_id);
              const confirmando = processandoRapido.has(r.id);
              const selo = SELO_STATUS_ROTINA[r.status] ?? SELO_STATUS_ROTINA.planejada;
              const desvio =
                exec && exec.tempo_real_min > 0
                  ? desvioPercentual(exec.tempo_real_min, r.tempo_previsto_min)
                  : null;
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{funcPorId.get(r.funcionario_id)?.nome ?? "?"}</td>
                  <td>
                    {tarefa?.nome_tarefa ?? "Tarefa"}
                    <div style={{ fontSize: 11, color: "var(--tinta-3)" }}>
                      {local ? `${local.nome_local} · ${local.andar}` : ""}
                    </div>
                  </td>
                  <td className="num">
                    {r.inicio_planejado}–{r.fim_planejado}
                  </td>
                  <td className="num">{formatarDuracao(r.tempo_previsto_min)}</td>
                  <td className="num">
                    {exec && exec.tempo_real_min > 0 ? formatarDuracao(exec.tempo_real_min) : "—"}
                  </td>
                  <td>
                    {desvio !== null ? (
                      <span
                        className="num"
                        style={{
                          fontWeight: 700,
                          color:
                            Math.abs(desvio) > params.desvio_justificativa_percentual
                              ? "var(--vermelho)"
                              : Math.abs(desvio) > 10
                                ? "var(--laranja)"
                                : "var(--verde)",
                        }}
                        title={exec?.justificativa ? `Justificativa: ${exec.justificativa}` : undefined}
                      >
                        {desvio > 0 ? "+" : ""}
                        {desvio.toFixed(0)}%
                      </span>
                    ) : (
                      <span style={{ color: "var(--tinta-3)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`selo ${selo.classe}`}>{selo.rotulo}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="acompanhamento-acoes-tabela">
                      {!exec && !exigeEpi && (
                        <button
                          type="button"
                          className="btn btn-mini btn-conforme"
                          disabled={confirmando}
                          onClick={() => void confirmarConforme(r)}
                        >
                          {confirmando ? "Confirmando…" : "✓ Conforme"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn btn-mini ${exec ? "btn-fantasma" : exigeEpi ? "btn-primario" : "btn-fantasma"}`}
                        disabled={!exec && !tarefaCarregada}
                        onClick={() => abrirRegistro(r)}
                      >
                        {exec
                          ? "Reabrir"
                          : !tarefaCarregada
                            ? "Carregando…"
                            : exigeEpi
                              ? "Confirmar + EPI"
                              : "Desvio"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* modal de registro */}
      <Modal
        titulo={`Registrar execução — ${tarefaPorId.get(rotinaAberta?.tarefa_id ?? "")?.nome_tarefa ?? ""}`}
        aberto={rotinaAberta !== null}
        aoFechar={() => setRotinaAberta(null)}
        larguraMax={560}
      >
        {rotinaAberta && (
          <form onSubmit={salvarExecucao} className="form-grade">
            <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--tinta-2)" }}>
              Planejado:{" "}
              <strong className="num">
                {rotinaAberta.inicio_planejado}–{rotinaAberta.fim_planejado}
              </strong>{" "}
              · Previsto: <strong className="num">{formatarDuracao(rotinaAberta.tempo_previsto_min)}</strong> ·{" "}
              {funcPorId.get(rotinaAberta.funcionario_id)?.nome}
            </div>

            <label className="campo" style={{ gridColumn: "1 / -1" }}>
              <span className="rotulo">Status realizado *</span>
              <select
                value={form.status_realizado}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status_realizado: e.target.value as StatusRealizado }))
                }
              >
                {OPCOES_STATUS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>

            {!statusCritico && (
              <>
                <label className="campo">
                  <span className="rotulo">Início real</span>
                  <input
                    type="time"
                    value={form.inicio_real}
                    onChange={(e) => setForm((f) => ({ ...f, inicio_real: e.target.value }))}
                  />
                </label>
                <label className="campo">
                  <span className="rotulo">Fim real</span>
                  <input
                    type="time"
                    value={form.fim_real}
                    onChange={(e) => setForm((f) => ({ ...f, fim_real: e.target.value }))}
                  />
                </label>
                <label className="campo">
                  <span className="rotulo">Tempo real (min)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.tempo_real_min}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tempo_real_min: Number(e.target.value) }))
                    }
                  />
                </label>
                <div className="campo">
                  <span className="rotulo">&nbsp;</span>
                  <button type="button" className="btn btn-mini" onClick={calcularPeloHorario}>
                    Calcular pelo horário
                  </button>
                </div>
                {form.tempo_real_min > 0 && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12 }}>
                    Desvio:{" "}
                    <strong
                      className="num"
                      style={{
                        color: precisaJustificar ? "var(--vermelho)" : "var(--verde)",
                      }}
                    >
                      {desvioAtual > 0 ? "+" : ""}
                      {desvioAtual.toFixed(1)}%
                    </strong>
                    {precisaJustificar && (
                      <span style={{ color: "var(--vermelho)" }}>
                        {" "}
                        — acima de {params.desvio_justificativa_percentual}%, justificativa obrigatória
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Declaração única, DESMARCADA por padrão — igual à ficha de papel
                (ORK3). Antes vinha tudo pré-marcado, o que fazia o registro
                afirmar sozinho algo que ninguém conferiu. */}
            {!statusCritico && episDaRotina.length > 0 && (
              <div className="campo" style={{ gridColumn: "1 / -1" }}>
                <span className="rotulo">Declaração de EPIs</span>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={episDaRotina.every((n) => form.epis.includes(n))}
                    onChange={(e) => setForm((f) => ({ ...f, epis: e.target.checked ? [...episDaRotina] : [] }))}
                    style={{ marginTop: 3, width: "auto" }}
                  />
                  <span>
                    O funcionário confirmou que utilizou os EPIs desta tarefa:{" "}
                    <em>{episDaRotina.join(", ")}</em>.
                  </span>
                </label>
                {/* Registro antigo pode ter lista PARCIAL (ou a lista do dia
                    inteiro, vinda da ficha). Mostra o que está gravado para o
                    supervisor não sobrescrever sem perceber. */}
                {form.epis.length > 0 &&
                  !(
                    form.epis.length === episDaRotina.length &&
                    episDaRotina.every((n) => form.epis.includes(n))
                  ) && (
                    <div className="alerta alerta-aviso" style={{ marginTop: 6, fontSize: 12 }}>
                      Já gravado neste registro: <strong>{form.epis.join(", ")}</strong>. Marcar ou
                      desmarcar acima substitui essa lista.
                    </div>
                  )}
              </div>
            )}

            <label className="campo" style={{ gridColumn: "1 / -1" }}>
              <span className="rotulo">
                Justificativa {precisaJustificar ? "* (obrigatória)" : "(opcional)"}
              </span>
              <textarea
                value={form.justificativa}
                onChange={(e) => setForm((f) => ({ ...f, justificativa: e.target.value }))}
                placeholder={
                  statusCritico
                    ? "Por que a tarefa não foi realizada como planejado?"
                    : "Explique o desvio, se houver"
                }
              />
            </label>

            <label className="campo" style={{ gridColumn: "1 / -1" }}>
              <span className="rotulo">Observação</span>
              <textarea
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </label>

            {erro && (
              <div className="alerta alerta-erro" style={{ gridColumn: "1 / -1" }}>
                {erro}
              </div>
            )}

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn" onClick={() => setRotinaAberta(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primario" disabled={salvando}>
                {salvando ? "Registrando…" : "Registrar execução"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
