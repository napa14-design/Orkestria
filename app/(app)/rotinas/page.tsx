"use client";

/**
 * Tela principal: paleta de tarefas (esquerda) + agenda drag-and-drop
 * (centro) + resumo de ocupação (direita).
 *
 * Os conflitos são validados duas vezes: aqui no cliente, para resposta
 * imediata, e novamente no servidor antes de gravar.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import AgendaGrid from "@/components/agenda/AgendaGrid";
import AlertPanel from "@/components/agenda/AlertPanel";
import CoberturaPanel from "@/components/agenda/CoberturaPanel";
import FiltersBar from "@/components/agenda/FiltersBar";
import ModalPlanejamento from "@/components/agenda/ModalPlanejamento";
import OccupancySummary from "@/components/agenda/OccupancySummary";
import PendenciasPanel from "@/components/agenda/PendenciasPanel";
import SemanaGrid from "@/components/agenda/SemanaGrid";
import TaskPalette from "@/components/agenda/TaskPalette";
import Carregando from "@/components/Carregando";
import {
  funcionarioNoDia,
  jornadaDoDia,
  PARAMETROS_PADRAO,
  tempoPrevistoMin,
  tempoVisualMin,
} from "@/lib/calculations";
import { apiDelete, apiPost, apiPut, ErroApi, fetcher } from "@/lib/clientApi";
import { hhmmParaMin, hojeISO, somarDias } from "@/lib/dateUtils";
import { temErro, validarAlocacao } from "@/lib/validations";
import type {
  AlertaValidacao,
  Ausencia,
  Funcionario,
  Local,
  ParametrosResolvidos,
  RotinaPlanejada,
  Sede,
  Tarefa,
} from "@/types";

const ROTULO_AUSENCIA: Record<string, string> = {
  falta: "Falta",
  atestado: "Atestado",
  ferias: "Férias",
  folga: "Folga",
  outro: "Ausente",
};

/** Segunda-feira da semana que contém a data. */
function segundaDaSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return somarDias(iso, -((d.getDay() + 6) % 7));
}

interface RespostaRotina {
  rotina: RotinaPlanejada;
  alertas: AlertaValidacao[];
}

export default function PaginaRotinas() {
  const [data, setData] = useState(hojeISO());
  const [sedeEscolhida, setSedeEscolhida] = useState("");
  const [turno, setTurno] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<AlertaValidacao[]>([]);
  const [planejamentoAberto, setPlanejamentoAberto] = useState(false);
  const [modo, setModo] = useState<"dia" | "semana">("dia");
  // Blocos do item em arrasto — dimensiona o fantasma de drop na agenda.
  const [blocosArrasto, setBlocosArrasto] = useState<number | null>(null);
  // Sedes grandes (50+ ASGs): busca por nome + paginação de colunas.
  const [buscaFuncionario, setBuscaFuncionario] = useState("");
  const [paginaFunc, setPaginaFunc] = useState(0);

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const sedeId = sedeEscolhida || sedes?.find((s) => s.ativo)?.id || "";

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
  const { data: rotinas, mutate: mutateRotinas } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?data=${data}&sede=${sedeId}` : null,
    fetcher,
  );
  const { data: ausencias } = useSWR<Ausencia[]>(
    sedeId ? `/api/ausencias?data=${data}&sede=${sedeId}` : null,
    fetcher,
  );
  // Últimos 31 dias: base do cálculo de "periódica vencida".
  const { data: historico } = useSWR<RotinaPlanejada[]>(
    sedeId ? `/api/rotinas?de=${somarDias(data, -31)}&ate=${somarDias(data, -1)}&sede=${sedeId}` : null,
    fetcher,
  );

  // Visão semanal: rotinas e ausências da semana inteira (seg–dom).
  const segunda = segundaDaSemana(data);
  const datasSemana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i)),
    [segunda],
  );
  const { data: rotinasSemana } = useSWR<RotinaPlanejada[]>(
    modo === "semana" && sedeId
      ? `/api/rotinas?de=${segunda}&ate=${somarDias(segunda, 6)}&sede=${sedeId}`
      : null,
    fetcher,
  );
  const { data: ausenciasSemana } = useSWR<Ausencia[]>(
    modo === "semana" && sedeId
      ? `/api/ausencias?de=${segunda}&ate=${somarDias(segunda, 6)}&sede=${sedeId}`
      : null,
    fetcher,
  );

  // ausências do dia + folgas da escala (ambas bloqueiam a coluna na agenda)
  const ausentesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of ausencias ?? [])
      m.set(a.funcionario_id, ROTULO_AUSENCIA[a.tipo] ?? "Ausente");
    for (const f of funcionarios ?? []) {
      if (!m.has(f.id) && !jornadaDoDia(f, data).trabalha) m.set(f.id, "Folga");
    }
    return m;
  }, [ausencias, funcionarios, data]);

  const params = parametros ?? PARAMETROS_PADRAO;
  const blocoMin = params.bloco_agenda_min || 30;

  const FUNC_POR_PAGINA = 8;

  /** Todos os funcionários da sede/turno/busca — alimenta equipe e cobertura. */
  const funcionariosVisiveis = useMemo(() => {
    const q = buscaFuncionario.trim().toLowerCase();
    return (funcionarios ?? [])
      .filter(
        (f) =>
          f.ativo &&
          (!turno || f.turno === turno) &&
          (!q || f.nome.toLowerCase().includes(q)),
      )
      .toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [funcionarios, turno, buscaFuncionario]);

  /** Página de colunas exibida na agenda (8 por vez). */
  const totalPaginasFunc = Math.max(
    1,
    Math.ceil(funcionariosVisiveis.length / FUNC_POR_PAGINA),
  );
  const paginaAtual = Math.min(paginaFunc, totalPaginasFunc - 1);
  const funcionariosPagina = useMemo(
    () =>
      funcionariosVisiveis.slice(
        paginaAtual * FUNC_POR_PAGINA,
        (paginaAtual + 1) * FUNC_POR_PAGINA,
      ),
    [funcionariosVisiveis, paginaAtual],
  );

  // Funcionários com o horário daquela data aplicado (sábado de 4h, etc.).
  const efetivosPagina = useMemo(
    () => funcionariosPagina.map((f) => funcionarioNoDia(f, data)),
    [funcionariosPagina, data],
  );
  const efetivosVisiveis = useMemo(
    () => funcionariosVisiveis.map((f) => funcionarioNoDia(f, data)),
    [funcionariosVisiveis, data],
  );

  /** Seleciona e garante que a coluna do funcionário esteja na página visível. */
  function selecionarFuncionario(id: string) {
    setSelecionado(id);
    const idx = funcionariosVisiveis.findIndex((f) => f.id === id);
    if (idx >= 0) setPaginaFunc(Math.floor(idx / FUNC_POR_PAGINA));
  }

  function mostrarErro(err: unknown) {
    if (err instanceof ErroApi && err.alertas.length > 0) setAlertas(err.alertas);
    else
      setAlertas([
        {
          nivel: "erro",
          codigo: "API",
          mensagem: err instanceof Error ? err.message : "Erro inesperado.",
        },
      ]);
  }

  /** Bloqueio imediato para funcionário ausente (o servidor também valida). */
  function bloquearSeAusente(funcionarioId: string): boolean {
    const motivo = ausentesMap.get(funcionarioId);
    if (!motivo) return false;
    const nome = funcionariosVisiveis.find((f) => f.id === funcionarioId)?.nome ?? "Funcionário";
    setAlertas([
      {
        nivel: "erro",
        codigo: "FUNCIONARIO_AUSENTE",
        mensagem: `${nome} está ausente hoje (${motivo}) — use o painel de cobertura para remanejar.`,
      },
    ]);
    return true;
  }

  /** Conflitos que o supervisor pode autorizar manualmente (regras 6 e 7). */
  function pedirAutorizacao(validacao: AlertaValidacao[]): boolean {
    const erros = validacao.filter((a) => a.nivel === "erro");
    const autorizaveis =
      erros.length > 0 &&
      erros.every((a) => a.codigo === "INTERVALO" || a.codigo === "SOBREPOSICAO");
    if (!autorizaveis) return false;
    return window.confirm(
      `${erros.map((e) => `• ${e.mensagem}`).join("\n")}\n\nAutorizar mesmo assim? A rotina ficará marcada como autorizada manualmente.`,
    );
  }

  /** Validação local imediata; o servidor revalida antes de gravar. */
  function validarLocalmente(
    funcionarioId: string,
    inicio: string,
    tempoPrevisto: number,
    tarefa?: Tarefa,
    ignorarRotinaId?: string,
  ): AlertaValidacao[] {
    const funcionario = efetivosVisiveis.find((f) => f.id === funcionarioId);
    if (!funcionario)
      return [{ nivel: "erro", codigo: "SEM_FUNCIONARIO", mensagem: "Funcionário não encontrado." }];
    const local = tarefa ? (locais ?? []).find((l) => l.id === tarefa.local_id) : undefined;
    const visual = tempoVisualMin(tempoPrevisto, blocoMin);
    const iniMin = hhmmParaMin(inicio);
    return validarAlocacao({
      funcionario,
      rotinasExistentes: (rotinas ?? []).filter(
        (r) => r.funcionario_id === funcionarioId && r.id !== ignorarRotinaId,
      ),
      inicioMin: iniMin,
      fimMin: iniMin + visual,
      tarefa,
      local,
      parametros: params,
      tempoPrevistoNovo: tempoPrevisto,
    });
  }

  async function soltarNova(tarefaId: string, funcionarioId: string, inicio: string) {
    if (bloquearSeAusente(funcionarioId)) return;
    const tarefa = (tarefas ?? []).find((t) => t.id === tarefaId);
    if (!tarefa) return;
    const local = (locais ?? []).find((l) => l.id === tarefa.local_id);
    const previsto = tempoPrevistoMin(tarefa, local);

    const validacao = validarLocalmente(funcionarioId, inicio, previsto, tarefa);
    let forcar = false;
    if (temErro(validacao)) {
      if (!pedirAutorizacao(validacao)) {
        setAlertas(validacao);
        return;
      }
      forcar = true;
    }
    try {
      const res = await apiPost<RespostaRotina>("/api/rotinas", {
        data,
        funcionario_id: funcionarioId,
        tarefa_id: tarefaId,
        inicio_planejado: inicio,
        forcar,
      });
      await mutateRotinas();
      setSelecionado(funcionarioId);
      setAlertas(res.alertas ?? []);
    } catch (err) {
      mostrarErro(err);
    }
  }

  async function mover(rotinaId: string, funcionarioId: string, inicio: string) {
    if (bloquearSeAusente(funcionarioId)) return;
    const rotina = (rotinas ?? []).find((r) => r.id === rotinaId);
    if (!rotina) return;
    if (rotina.funcionario_id === funcionarioId && rotina.inicio_planejado === inicio) return;

    const tarefa = (tarefas ?? []).find((t) => t.id === rotina.tarefa_id);
    const validacao = validarLocalmente(
      funcionarioId,
      inicio,
      rotina.tempo_previsto_min,
      tarefa,
      rotinaId,
    );
    let forcar = false;
    if (temErro(validacao)) {
      if (!pedirAutorizacao(validacao)) {
        setAlertas(validacao);
        return;
      }
      forcar = true;
    }
    try {
      const res = await apiPut<RespostaRotina>(`/api/rotinas/${rotinaId}`, {
        funcionario_id: funcionarioId,
        inicio_planejado: inicio,
        forcar,
      });
      await mutateRotinas();
      setSelecionado(funcionarioId);
      setAlertas(res.alertas ?? []);
    } catch (err) {
      mostrarErro(err);
    }
  }

  /** Redimensionamento pela alça do card; conflitos podem ser autorizados. */
  async function redimensionar(rotinaId: string, novoTempoMin: number) {
    const corpo = { tempo_previsto_min: novoTempoMin };
    try {
      const res = await apiPut<RespostaRotina>(`/api/rotinas/${rotinaId}`, corpo);
      await mutateRotinas();
      setAlertas(res.alertas ?? []);
    } catch (err) {
      if (err instanceof ErroApi && pedirAutorizacao(err.alertas)) {
        try {
          const res = await apiPut<RespostaRotina>(`/api/rotinas/${rotinaId}`, {
            ...corpo,
            forcar: true,
          });
          await mutateRotinas();
          setAlertas(res.alertas ?? []);
        } catch (err2) {
          mostrarErro(err2);
        }
        return;
      }
      mostrarErro(err);
    }
  }

  async function remover(rotinaId: string) {
    try {
      await apiDelete(`/api/rotinas/${rotinaId}`);
      await mutateRotinas();
    } catch (err) {
      mostrarErro(err);
    }
  }

  function concluirPlanejamento(mensagem: string) {
    setAlertas([{ nivel: "alerta", codigo: "PLANEJAMENTO", mensagem }]);
    void mutateRotinas();
  }

  return (
    <div>
      <FiltersBar
        data={data}
        sedeId={sedeId}
        turno={turno}
        sedes={sedes ?? []}
        aoMudarData={setData}
        aoMudarSede={(v) => {
          setSedeEscolhida(v);
          setSelecionado(null);
          setBuscaFuncionario("");
          setPaginaFunc(0);
        }}
        modo={modo}
        busca={buscaFuncionario}
        aoMudarModo={setModo}
        aoMudarTurno={(v) => {
          setTurno(v);
          setPaginaFunc(0);
        }}
        aoMudarBusca={(v) => {
          setBuscaFuncionario(v);
          setPaginaFunc(0);
        }}
        aoDuplicar={() => setPlanejamentoAberto(true)}
      />

      {modo === "semana" ? (
        <SemanaGrid
          funcionarios={funcionariosVisiveis}
          rotinas={rotinasSemana ?? []}
          ausencias={ausenciasSemana ?? []}
          parametros={params}
          datas={datasSemana}
          dataSelecionada={data}
          aoAbrirDia={(dia) => {
            setData(dia);
            setModo("dia");
          }}
        />
      ) : !funcionarios || !tarefas || !locais ? (
        <div className="painel">
          <Carregando texto="Carregando agenda…" style={{ padding: 64 }} />
        </div>
      ) : (
        <>
      <CoberturaPanel
        funcionarios={efetivosVisiveis}
        ausencias={ausentesMap}
        rotinas={rotinas ?? []}
        tarefas={tarefas ?? []}
        parametros={params}
        aoMover={mover}
      />

      <PendenciasPanel
        tarefas={tarefas ?? []}
        locais={locais ?? []}
        rotinasDoDia={rotinas ?? []}
        historico={historico ?? []}
        data={data}
      />

      {/* paginação de colunas — só aparece em sedes grandes */}
      {funcionariosVisiveis.length > FUNC_POR_PAGINA && (
        <div
          className="painel entra"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "6px 12px", marginBottom: 14 }}
        >
          <button
            className="btn btn-mini"
            disabled={paginaAtual === 0}
            onClick={() => setPaginaFunc(paginaAtual - 1)}
          >
            ‹ Anteriores
          </button>
          <span className="rotulo">
            Funcionários{" "}
            <span className="num">
              {paginaAtual * FUNC_POR_PAGINA + 1}–
              {Math.min((paginaAtual + 1) * FUNC_POR_PAGINA, funcionariosVisiveis.length)}
            </span>{" "}
            de <span className="num">{funcionariosVisiveis.length}</span>
          </span>
          <button
            className="btn btn-mini"
            disabled={paginaAtual >= totalPaginasFunc - 1}
            onClick={() => setPaginaFunc(paginaAtual + 1)}
          >
            Próximos ›
          </button>
        </div>
      )}

      <div className="linha-rotina">
        <TaskPalette
          tarefas={tarefas ?? []}
          locais={locais ?? []}
          blocoMin={blocoMin}
          aoIniciarArrasto={setBlocosArrasto}
          aoTerminarArrasto={() => setBlocosArrasto(null)}
        />

        <AgendaGrid
          funcionarios={efetivosPagina}
          rotinas={rotinas ?? []}
          tarefas={tarefas ?? []}
          locais={locais ?? []}
          blocoMin={blocoMin}
          funcionarioSelecionado={selecionado}
          ausencias={ausentesMap}
          aoSelecionarFuncionario={selecionarFuncionario}
          aoSoltarNova={soltarNova}
          aoMover={mover}
          aoRemover={remover}
          aoRedimensionar={redimensionar}
          blocosArrasto={blocosArrasto}
          aoIniciarArrasto={setBlocosArrasto}
          aoTerminarArrasto={() => setBlocosArrasto(null)}
        />

        <OccupancySummary
          funcionarios={efetivosVisiveis}
          rotinas={rotinas ?? []}
          tarefas={tarefas ?? []}
          parametros={params}
          selecionadoId={selecionado}
          aoSelecionar={selecionarFuncionario}
        />
      </div>
        </>
      )}

      <ModalPlanejamento
        aberto={planejamentoAberto}
        aoFechar={() => setPlanejamentoAberto(false)}
        dataAtual={data}
        sedeId={sedeId}
        aoConcluir={concluirPlanejamento}
      />

      <AlertPanel alertas={alertas} aoLimpar={() => setAlertas([])} />
    </div>
  );
}
