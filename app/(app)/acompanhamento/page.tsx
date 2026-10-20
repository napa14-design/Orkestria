"use client";

/**
 * Fase 2 — Acompanhamento do dia: o supervisor marca o que realmente
 * aconteceu (status, tempo real, justificativa) e o sistema confronta
 * previsto × realizado.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import Modal from "@/components/Modal";
import { useSessao } from "@/components/SessaoContexto";
import {
  cobraDesvio,
  desvioPercentual,
  exigeJustificativa,
  PARAMETROS_PADRAO,
} from "@/lib/calculations";
import { listaDoSupervisor } from "@/lib/agenda";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { baixarCSV } from "@/lib/csv";
import {
  agoraHHMM,
  formatarDataBR,
  formatarDuracao,
  hhmmParaMin,
  hojeISO,
} from "@/lib/dateUtils";
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
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean; efemera?: boolean } | null>(null);
  // O aviso flutua sobre a lista: os curtos de confirmação ("Marcada como
  // feita") somem sozinhos; o resto — erro, resumo do fechamento do dia — fica
  // até a próxima ação ou um toque nele.
  useEffect(() => {
    if (!mensagem?.efemera) return;
    const t = setTimeout(() => setMensagem(null), 3500);
    return () => clearTimeout(t);
  }, [mensagem]);

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
  /**
   * Até que horário as tarefas do dia já terminaram — a mesma régua do servidor
   * (`AINDA_NAO_TERMINOU`): realizado só depois do horário da tarefa.
   */
  // Redesenha a cada minuto: sem isso, com a tela parada no celular, o botão de
  // uma tarefa que acabou de terminar seguia cinza até a pessoa mexer em algo.
  const [, setMinuto] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMinuto((m) => m + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const limiteDoDia = data > hoje ? "00:00" : data === hoje ? agoraHHMM() : "23:59";
  const sessao = useSessao();
  /** O supervisor só diz se foi feita ou não; cancelar/remanejar é do coordenador. */
  const opcoesStatus =
    sessao?.perfil === "supervisor"
      ? OPCOES_STATUS.filter((o) => o.valor !== "remanejada" && o.valor !== "cancelada")
      : OPCOES_STATUS;
  /** Cancelada/remanejada é decisão do coordenador: o supervisor não reabre (o servidor recusa). */
  const decididaPeloCoordenador = (r: RotinaPlanejada) =>
    sessao?.perfil === "supervisor" && (r.status === "cancelada" || r.status === "remanejada");
  // Supervisor de chão (20/10/2026): só diz "feita" ou "não feita", olhando uma
  // pessoa por vez e só o que falta — a DT tem 395 blocos por dia, e rolar tudo
  // no celular não fecha. O coordenador segue com a tela completa.
  const ehSupervisor = sessao?.perfil === "supervisor";
  const [filtroFunc, setFiltroFunc] = useState("");
  const [soFaltam, setSoFaltam] = useState(true);
  const [naoFeita, setNaoFeita] = useState<RotinaPlanejada | null>(null);
  // O que foi marcado AGORA fica no lugar (com o selo novo) até a lista ser
  // reaberta: sumindo na hora, o cartão de baixo subia para baixo do dedo e um
  // segundo toque rápido declarava EPI na tarefa errada (auditoria, 20/10/2026).
  const [marcadasAgora, setMarcadasAgora] = useState<Set<string>>(() => new Set());
  const lembrarMarcada = (id: string) => setMarcadasAgora((atual) => new Set(atual).add(id));
  // Outro dia ou outra sede é outra lista: o que foi marcado antes já pode sair.
  useEffect(() => setMarcadasAgora(new Set()), [data, sedeId]);
  /** Fechamento do dia: dois toques (o segundo confirma) e declaração de EPI à parte. */
  const [declararEpi, setDeclararEpi] = useState(false);
  const [confirmandoFechamento, setConfirmandoFechamento] = useState(false);
  const [fechando, setFechando] = useState(false);
  // Contado no servidor (~14 leituras) em vez de trazer 7 dias de rotinas.
  const { data: diasPendentesBrutos } = useSWR<Array<[string, number]>>(
    sedeId ? `/api/rotinas/pendentes?sede=${sedeId}` : null,
    fetcher,
  );
  const diasPendentes = diasPendentesBrutos ?? [];

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
  // Quem tem blocos no dia, para o filtro do supervisor.
  const pessoasDoDia = [...new Set(linhas.map((r) => r.funcionario_id))]
    .map((id) => ({ id, nome: funcPorId.get(id)?.nome ?? id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  // Filtro só vale com a pessoa no dia — ver `listaDoSupervisor`.
  const doSupervisor = listaDoSupervisor(
    linhas,
    filtroFunc,
    soFaltam,
    (r) => (execucaoPorRotina.has(r.id) || decididaPeloCoordenador(r)) && !marcadasAgora.has(r.id),
  );
  const filtroEfetivo = doSupervisor.filtroEfetivo;
  const visiveis = ehSupervisor ? doSupervisor.visiveis : linhas;

  /**
   * O que o fechamento por exceção alcança: só o que **já passou do horário** e
   * segue sem registro. Confirmar bloco futuro seria afirmar o que não aconteceu.
   * (O servidor recalcula tudo isto — aqui é só para a tela saber o que dizer.)
   */
  const fechamento = useMemo(() => {
    // Futuro ≠ hoje: num dia futuro nada terminou, seja que hora for.
    const alvos = linhas.filter(
      (r) =>
        !execucaoPorRotina.has(r.id) &&
        (r.status === "planejada" || r.status === "pendente") &&
        r.fim_planejado <= limiteDoDia,
    );
    const epis = new Set<string>();
    let comEpi = 0;
    for (const r of alvos) {
      const nomes = (tarefaPorId.get(r.tarefa_id)?.requisitos ?? "")
        .split(",")
        .filter(Boolean)
        .map((id) => reqPorId.get(id))
        .filter((req) => req?.tipo === "epi")
        .map((req) => req!.nome);
      if (nomes.length > 0) comEpi++;
      for (const n of nomes) epis.add(n);
    }
    return { total: alvos.length, comEpi, epis: [...epis].sort() };
  }, [linhas, execucaoPorRotina, tarefaPorId, reqPorId, limiteDoDia]);

  async function fecharDia() {
    if (!confirmandoFechamento) {
      setConfirmandoFechamento(true);
      return;
    }
    setConfirmandoFechamento(false);
    setMensagem(null);
    setFechando(true);
    try {
      const r = await apiPost<{
        confirmadas: number;
        ja_registradas: number;
        aguardando_horario: number;
        sem_declaracao: number;
        epis_declarados: string[];
      }>("/api/execucoes/confirmar-dia", { sede: sedeId, data, declarar_epi: declararEpi });
      await Promise.all([mutateRotinas(), mutateExecucoes()]);
      setDeclararEpi(false);
      setMensagem({
        texto:
          `${r.confirmadas} tarefa(s) confirmadas como planejado` +
          (r.epis_declarados.length > 0 ? ` (EPIs declarados: ${r.epis_declarados.join(", ")})` : "") +
          (r.sem_declaracao > 0
            ? ` · ${r.sem_declaracao} exigem EPI e ficaram de fora — registre uma a uma ou marque a declaração`
            : "") +
          (r.aguardando_horario > 0 ? ` · ${r.aguardando_horario} ainda não terminaram` : "") +
          ".",
      });
    } catch (err) {
      setMensagem({
        texto: err instanceof ErroApi ? err.message : "Não foi possível fechar o dia.",
        erro: true,
      });
    } finally {
      setFechando(false);
    }
  }

  /** Nomes dos EPIs da tarefa — mostrados no cartão do supervisor, que os declara ao tocar. */
  function episDe(tarefaId: string): string[] {
    const nomes: string[] = [];
    for (const id of (tarefaPorId.get(tarefaId)?.requisitos ?? "").split(",").filter(Boolean)) {
      const req = reqPorId.get(id);
      if (req?.tipo === "epi" && !nomes.includes(req.nome)) nomes.push(req.nome);
    }
    return nomes;
  }

  function tarefaExigeEpi(tarefaId: string): boolean {
    const tarefa = tarefaPorId.get(tarefaId);
    if (!tarefa) return true; // sem cadastro carregado, mantém o caminho seguro
    return (tarefa.requisitos ?? "")
      .split(",")
      .filter(Boolean)
      .some((id) => reqPorId.get(id)?.tipo === "epi");
  }

  /**
   * `declaroEpi`: o "✓ Feita" do supervisor É a declaração de uso dos EPIs
   * (decisão do dono, 20/10/2026) — o servidor grava os nomes do cadastro da
   * tarefa. No "✓ Conforme" do coordenador, tarefa com EPI segue para o
   * formulário completo.
   */
  async function confirmarConforme(rotina: RotinaPlanejada, declaroEpi = false) {
    const comEpi = tarefaExigeEpi(rotina.tarefa_id);
    if (comEpi && !declaroEpi) {
      abrirRegistro(rotina);
      return;
    }
    setMensagem(null);
    setProcessandoRapido((atuais) => new Set(atuais).add(rotina.id));
    try {
      await apiPost("/api/execucoes/conforme", { rotina_id: rotina.id, declaro_epi: comEpi && declaroEpi });
      if (ehSupervisor) lembrarMarcada(rotina.id);
      setMensagem({
        texto: declaroEpi ? "Marcada como feita." : "Realizado confirmado sem abrir formulário.",
        efemera: true,
      });
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

  /** "✗ Não feita" do supervisor: só o motivo — sem horários, tempo ou desvio. */
  async function registrarNaoFeita(rotina: RotinaPlanejada, motivo: string) {
    setProcessandoRapido((atuais) => new Set(atuais).add(rotina.id));
    try {
      await apiPost("/api/execucoes", {
        rotina_id: rotina.id,
        data_execucao: rotina.data,
        status_realizado: "nao_realizada",
        inicio_real: "",
        fim_real: "",
        tempo_real_min: 0,
        justificativa: motivo,
        observacao: "",
        epis_confirmados: "",
      });
      lembrarMarcada(rotina.id);
      setNaoFeita(null);
      setMensagem({ texto: "Marcada como não feita.", efemera: true });
      await Promise.all([mutateRotinas(), mutateExecucoes()]);
    } catch (err) {
      throw err instanceof ErroApi ? err : new Error("Não foi possível registrar.");
    } finally {
      setProcessandoRapido((atuais) => {
        const proximos = new Set(atuais);
        proximos.delete(rotina.id);
        return proximos;
      });
    }
  }

  /** Os dois botões do supervisor — no cartão do celular e na tabela. */
  function acoesDoSupervisor(r: RotinaPlanejada) {
    const exec = execucaoPorRotina.get(r.id);
    if (decididaPeloCoordenador(r)) return null;
    // Já marcado por outra pessoa: só o coordenador muda (o servidor recusa).
    if (exec && exec.supervisor_id !== sessao?.id) return null;
    const ocupado = processandoRapido.has(r.id);
    const cedo = r.fim_planejado > limiteDoDia;
    const titulo = cedo ? "Ainda não terminou — marque depois do horário" : undefined;
    const comEpi = tarefaExigeEpi(r.tarefa_id);
    const feita = exec?.status_realizado !== undefined && exec.status_realizado !== "nao_realizada";
    return (
      <>
        {/* Botão que some deixa o lugar reservado: senão o "✗ Não feita" subia
            para onde estava o "✓ Feita", sob o dedo (auditoria, 20/10/2026). */}
        {feita && (
          <span className="btn btn-mini" aria-hidden="true" style={{ visibility: "hidden" }}>
            ✓ Feita · EPI
          </span>
        )}
        {!feita && (
          <button
            type="button"
            className="btn btn-mini btn-conforme"
            disabled={ocupado || cedo}
            title={titulo ?? (comEpi ? "Ao marcar, você declara que os EPIs da tarefa foram usados" : undefined)}
            onClick={() => void confirmarConforme(r, true)}
          >
            {ocupado ? "…" : comEpi ? "✓ Feita · EPI" : "✓ Feita"}
          </button>
        )}
        {exec?.status_realizado !== "nao_realizada" && (
          <button type="button" className="btn btn-mini" disabled={ocupado || cedo} title={titulo} onClick={() => setNaoFeita(r)}>
            ✗ Não feita
          </button>
        )}
      </>
    );
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
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {ehSupervisor ? "Confirmar o dia" : "Acompanhamento do dia"}
          </h1>
          <span className="rotulo" style={{ color: "var(--acento)" }}>
            {ehSupervisor ? "marque o que foi feito e o que não foi" : "registre o realizado e confronte com o previsto"}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {pendentes > 0 && (
          <span className="selo selo-laranja">{pendentes} {ehSupervisor ? "sem marcação" : "sem registro"}</span>
        )}
        {!ehSupervisor && (
          <button className="btn" onClick={exportarCSV} disabled={linhas.length === 0}>
            ⬇ Exportar CSV
          </button>
        )}
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
        {ehSupervisor && (
          <>
            <label className="campo">
              <span className="rotulo">Funcionário</span>
              <select value={filtroEfetivo} onChange={(e) => setFiltroFunc(e.target.value)}>
                <option value="">Todos</option>
                {pessoasDoDia.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 8 }}>
              <input type="checkbox" checked={soFaltam} onChange={(e) => setSoFaltam(e.target.checked)} />
              Só o que falta marcar
            </label>
            <p style={{ flexBasis: "100%", margin: 0, fontSize: 12, color: "var(--tinta-2)" }}>
              Ao tocar <strong>✓ Feita · EPI</strong>, você declara que os EPIs listados na tarefa foram usados.
            </p>
          </>
        )}
      </div>

      {/* Em portal no <body>: o contêiner da página anima com transform, e isso
          prendia o `position: fixed` do aviso a ele — no celular o aviso ia
          parar fora da tela. */}
      {mensagem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`alerta ${mensagem.erro ? "alerta-erro" : "alerta-ok"} acompanhamento-mensagem`}
            role="status"
            onClick={() => setMensagem(null)}
            title="Toque para fechar"
          >
            {mensagem.texto}
          </div>,
          document.body,
        )}

      {/* Fechamento por exceção. Confirmar era UMA AÇÃO POR BLOCO: numa sede de 277
          blocos, a promessa de validar o dia em 5 minutos era aritmeticamente
          impossível. Registre os desvios acima e feche o resto aqui. */}
      {fechamento.total > 0 && (
        <div
          className="painel entra"
          style={{ marginBottom: 16, padding: "12px 16px", borderLeft: "6px solid var(--acento)", display: "grid", gap: 8 }}
        >
          <span style={{ fontSize: 13 }}>
            {ehSupervisor ? (
              <>
                <strong>{fechamento.total} tarefa(s) da sede</strong>
                {filtroEfetivo ? " (de todos, não só de quem está filtrado)" : ""} já passaram do horário sem
                marcação. Marque abaixo o que <strong>não</strong> foi feito — o resto você fecha aqui de uma vez.
              </>
            ) : (
              <>
                <strong>{fechamento.total} tarefa(s)</strong> já passaram do horário e seguem sem
                registro. Registre acima o que fugiu do plano — depois feche o resto de uma vez.
              </>
            )}
          </span>
          {fechamento.epis.length > 0 && (
            <label style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--tinta-2)", alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={declararEpi}
                onChange={(e) => {
                  setDeclararEpi(e.target.checked);
                  setConfirmandoFechamento(false);
                }}
              />
              <span>
                {ehSupervisor ? (
                  <>
                    Declaro que os EPIs foram usados: <strong>{fechamento.epis.join(", ")}</strong>.
                  </>
                ) : (
                  <>
                    Declaro que os EPIs foram usados nas {fechamento.comEpi} tarefa(s) que os exigem:{" "}
                    <strong>{fechamento.epis.join(", ")}</strong>. Sem esta declaração, essas tarefas
                    ficam de fora e você as registra uma a uma.
                  </>
                )}
              </span>
            </label>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-primario"
              disabled={fechando}
              onClick={() => void fecharDia()}
              title="Confirma como planejado o que já passou do horário e não tem registro"
            >
              {confirmandoFechamento
                ? `Confirmar ${declararEpi ? fechamento.total : fechamento.total - fechamento.comEpi} como planejado?`
                : "✓ Fechar o dia como planejado"}
            </button>
            {confirmandoFechamento && (
              <button className="btn btn-mini" onClick={() => setConfirmandoFechamento(false)}>
                cancelar
              </button>
            )}
            {!declararEpi && fechamento.comEpi > 0 && (
              <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>
                {fechamento.comEpi} com EPI ficarão de fora
              </span>
            )}
          </div>
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
      {/* O display vem do CSS: um `display:grid` inline aqui vencia o
          `.so-mobile { display:none }` e no computador a lista saía duas vezes
          — cartões e tabela (auditoria, 20/10/2026). */}
      <div className="so-mobile acomp-lista">
        {visiveis.length === 0 && (
          <div className="painel" style={{ padding: 24, textAlign: "center", color: "var(--tinta-3)" }}>
            {linhas.length > 0 ? "Tudo marcado por aqui." : "Nenhuma rotina planejada para esta data/sede."}
          </div>
        )}
        {visiveis.map((r) => {
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
            <div key={r.id} className="painel acomp-cartao">
              <div style={{ minWidth: 0 }}>
                <div className="acomp-cartao-topo">
                  <span className="num">
                    {r.inicio_planejado}–{r.fim_planejado}
                  </span>
                  {/* Com o filtro numa pessoa, repetir o nome em cada linha é ruído. */}
                  {!(ehSupervisor && filtroEfetivo) && <strong>{funcPorId.get(r.funcionario_id)?.nome ?? "?"}</strong>}
                  {r.status !== "planejada" && <span className={`selo ${selo.classe}`}>{selo.rotulo}</span>}
                </div>
                <div className="acomp-cartao-tarefa">
                  {tarefa?.nome_tarefa ?? "Tarefa"}
                  <span style={{ color: "var(--tinta-3)" }}>
                    {local ? ` · ${local.nome_local}` : ""}
                    {/* O andar desfaz a dúvida entre locais de mesmo nome. */}
                    {local?.andar && local.andar !== "—" ? ` (${local.andar})` : ""}
                  </span>
                </div>
                {/* O "✓ Feita · EPI" declara ESTES EPIs: eles têm de estar à vista —
                    tela de toque não mostra o `title` (revisão de segurança). Some
                    só quando já está marcada como feita (corrigir uma "não feita"
                    também declara). */}
                {ehSupervisor && exigeEpi && (!exec || exec.status_realizado === "nao_realizada") && (
                  <div style={{ fontSize: 11, color: "var(--acento)", marginTop: 2 }}>EPI: {episDe(r.tarefa_id).join(", ")}</div>
                )}
                {/* Botão desligado precisa dizer por quê — o `title` não aparece no toque. */}
                {ehSupervisor && !exec && r.fim_planejado > limiteDoDia && (
                  <div style={{ fontSize: 11, color: "var(--tinta-3)", marginTop: 2 }}>Marque depois das {r.fim_planejado}</div>
                )}
                {!ehSupervisor && exec && exec.tempo_real_min > 0 && (
                  <div className="num" style={{ fontSize: 12, color: "var(--tinta-2)", marginTop: 2 }}>
                    previsto {formatarDuracao(r.tempo_previsto_min)} · real {formatarDuracao(exec.tempo_real_min)}{" "}
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
                  </div>
                )}
              </div>
              {ehSupervisor ? (
                <div className="acomp-cartao-acoes">{acoesDoSupervisor(r)}</div>
              ) : !decididaPeloCoordenador(r) && (
              <div className="acomp-cartao-acoes">
                {!exec && !exigeEpi && (
                  <button
                    type="button"
                    className="btn btn-mini btn-conforme"
                    disabled={confirmando || r.fim_planejado > limiteDoDia}
                    title={r.fim_planejado > limiteDoDia ? "Ainda não terminou — confirme depois do horário" : undefined}
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
              )}
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
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--tinta-3)" }}>
                  {linhas.length > 0 ? "Tudo marcado por aqui." : "Nenhuma rotina planejada para esta data/sede."}
                </td>
              </tr>
            )}
            {visiveis.map((r) => {
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
                    {ehSupervisor ? (
                      <div className="acompanhamento-acoes-tabela">{acoesDoSupervisor(r)}</div>
                    ) : !decididaPeloCoordenador(r) && (
                    <div className="acompanhamento-acoes-tabela">
                      {!exec && !exigeEpi && (
                        <button
                          type="button"
                          className="btn btn-mini btn-conforme"
                          disabled={confirmando || r.fim_planejado > limiteDoDia}
                          title={r.fim_planejado > limiteDoDia ? "Ainda não terminou — confirme depois do horário" : undefined}
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
                    )}
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
                {opcoesStatus.map((o) => (
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

      {naoFeita && (
        <NaoFeitaModal
          titulo={tarefaPorId.get(naoFeita.tarefa_id)?.nome_tarefa ?? "Tarefa"}
          aoFechar={() => setNaoFeita(null)}
          aoConfirmar={(motivo) => registrarNaoFeita(naoFeita, motivo)}
        />
      )}
    </div>
  );
}

/** Motivos mais comuns — a pessoa toca um, e só escreve se for "Outro". */
const MOTIVOS_NAO_FEITA = ["Funcionário faltou", "Cobriu outra tarefa", "Faltou material", "Local fechado / em uso", "Não deu tempo"];

/** "✗ Não feita" do supervisor: o motivo e nada mais. */
function NaoFeitaModal({
  titulo,
  aoFechar,
  aoConfirmar,
}: {
  titulo: string;
  aoFechar: () => void;
  aoConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const final = motivo === "Outro" ? texto.trim() : [motivo, texto.trim()].filter(Boolean).join(" — ");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!final) return setErro(motivo === "Outro" ? "Escreva o motivo." : "Escolha o motivo.");
    setEnviando(true);
    setErro("");
    try {
      await aoConfirmar(final);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Não feita — ${titulo}`} aberto aoFechar={aoFechar} larguraMax={440}>
      <form onSubmit={enviar} style={{ display: "grid", gap: 10 }}>
        <span className="rotulo">Por quê?</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[...MOTIVOS_NAO_FEITA, "Outro"].map((m) => (
            <button
              key={m}
              type="button"
              className={`btn btn-mini${motivo === m ? " btn-primario" : ""}`}
              aria-pressed={motivo === m}
              onClick={() => setMotivo(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <label className="campo">
          <span className="rotulo">{motivo === "Outro" ? "Motivo" : "Detalhe (opcional)"}</span>
          {/* Texto livre é lido pela gerência: saúde e atestado vão pelas Ausências (LGPD). */}
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Sem motivo de saúde ou atestado — isso vai nas Ausências"
          />
        </label>
        {erro && <div className="alerta alerta-erro">{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={enviando}>
            {enviando ? "Registrando…" : "Marcar não feita"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
