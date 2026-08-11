"use client";

/**
 * Modal de planejamento em lote: duplicar o dia para outra data ou período
 * (com escolha de dias da semana) e salvar/aplicar/excluir modelos de rotina.
 */
import { useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import { apiDelete, apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { rotularDiasSemana, serializarDiasSemana } from "@/lib/dateUtils";
import type { ResumoModelo, ResultadoAplicacao } from "@/services/modelosService";

const DIAS_SEMANA = [
  { idx: 1, rotulo: "Seg" },
  { idx: 2, rotulo: "Ter" },
  { idx: 3, rotulo: "Qua" },
  { idx: 4, rotulo: "Qui" },
  { idx: 5, rotulo: "Sex" },
  { idx: 6, rotulo: "Sáb" },
  { idx: 0, rotulo: "Dom" },
];

/** Lista de datas YYYY-MM-DD entre de/até, filtrada pelos dias da semana. */
function datasDoPeriodo(de: string, ate: string, diasAtivos: Set<number>): string[] {
  if (!de || !ate || de > ate) return [];
  const datas: string[] = [];
  const cursor = new Date(`${de}T12:00:00`);
  const fim = new Date(`${ate}T12:00:00`);
  while (cursor <= fim && datas.length < 62) {
    if (diasAtivos.has(cursor.getDay())) {
      datas.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
}

function SeletorPeriodo({
  de,
  ate,
  dias,
  aoMudar,
}: {
  de: string;
  ate: string;
  dias: Set<number>;
  aoMudar: (de: string, ate: string, dias: Set<number>) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="campo">
          <span className="rotulo">De</span>
          <input type="date" value={de} onChange={(e) => aoMudar(e.target.value, ate, dias)} />
        </label>
        <label className="campo">
          <span className="rotulo">Até</span>
          <input type="date" value={ate} onChange={(e) => aoMudar(de, e.target.value, dias)} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {DIAS_SEMANA.map((d) => {
          const ativo = dias.has(d.idx);
          return (
            <button
              key={d.idx}
              type="button"
              className="btn btn-mini"
              style={{
                background: ativo ? "var(--tinta)" : "var(--cartao)",
                color: ativo ? "var(--papel)" : "var(--tinta)",
              }}
              onClick={() => {
                const novo = new Set(dias);
                if (ativo) novo.delete(d.idx);
                else novo.add(d.idx);
                aoMudar(de, ate, novo);
              }}
            >
              {d.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ModalPlanejamento({
  aberto,
  aoFechar,
  dataAtual,
  sedeId,
  aoConcluir,
}: {
  aberto: boolean;
  aoFechar: () => void;
  dataAtual: string;
  sedeId: string;
  aoConcluir: (mensagem: string) => void;
}) {
  const { data: modelos, mutate: mutateModelos } = useSWR<ResumoModelo[]>(
    aberto && sedeId ? `/api/modelos?sede=${sedeId}` : null,
    fetcher,
  );

  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [dias, setDias] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [nomeNovoModelo, setNomeNovoModelo] = useState("");
  const [padraoNovo, setPadraoNovo] = useState(false);
  /** Dias em que a rota padrão sendo salva vale. Vazio = todo dia. */
  const [diasPadrao, setDiasPadrao] = useState<Set<number>>(new Set());
  /**
   * Como a camada entra no dia. Começa **vazio de propósito**: escolher dias sem
   * dizer a intenção era o caminho para duplicar o dia em silêncio.
   */
  const [modoCamada, setModoCamada] = useState<"" | "acrescenta" | "substitui">("");
  const [eventoNovo, setEventoNovo] = useState(false);
  const [modeloEscolhido, setModeloEscolhido] = useState("");
  /** Confirmação em dois toques, no lugar do confirm() do navegador. */
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const datas = datasDoPeriodo(de, ate, dias);

  async function executar(fn: () => Promise<string>) {
    setErro("");
    setOcupado(true);
    try {
      const mensagem = await fn();
      aoConcluir(mensagem);
      aoFechar();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  function duplicar() {
    if (datas.length === 0) {
      setErro("Escolha o período e ao menos um dia da semana.");
      return;
    }
    executar(async () => {
      const r = await apiPost<{ copiadas: number; puladas: number }>("/api/rotinas/duplicar", {
        data_origem: dataAtual,
        datas_destino: datas,
        sede_id: sedeId,
      });
      return `${r.copiadas} tarefa(s) copiada(s)${r.puladas > 0 ? `, ${r.puladas} pulada(s) por conflito` : ""}.`;
    });
  }

  function salvarModelo() {
    if (padraoNovo && diasPadrao.size > 0 && !modoCamada) {
      setErro("Diga se esta rota acrescenta ao dia ou substitui o dia nesses dias.");
      return;
    }
    executar(async () => {
      const r = await apiPost<{ itens: number }>("/api/modelos", {
        nome: nomeNovoModelo,
        data_origem: dataAtual,
        sede_id: sedeId,
        padrao: padraoNovo,
        com_duracao: true,
        evento: eventoNovo,
        dias_semana: padraoNovo ? serializarDiasSemana([...diasPadrao]) : "",
        substitui: padraoNovo && modoCamada === "substitui",
      });
      await mutateModelos();
      const nome = nomeNovoModelo;
      const eraEvento = eventoNovo;
      const diasSalvos = padraoNovo ? serializarDiasSemana([...diasPadrao]) : "";
      // Zera os flags: o modal fica montado, e um "padrão" esquecido faria o
      // PRÓXIMO modelo salvo roubar a rota padrão da sede sem ninguém notar.
      setNomeNovoModelo("");
      setPadraoNovo(false);
      setEventoNovo(false);
      setDiasPadrao(new Set());
      const modoSalvo = modoCamada;
      setModoCamada("");
      return `Modelo "${nome}" salvo com ${r.itens} tarefa(s)${
        padraoNovo
          ? ` (rota padrão da sede${diasSalvos ? `, ${rotularDiasSemana(diasSalvos)}${modoSalvo === "substitui" ? ", substituindo o dia" : ""}` : ", todo dia"})`
          : eraEvento
            ? " (modelo de evento)"
            : ""
      }.`;
    });
  }

  function aplicarModelo() {
    if (!modeloEscolhido) {
      setErro("Escolha um modelo para aplicar.");
      return;
    }
    const alvos = datas.length > 0 ? datas : [dataAtual];
    executar(async () => {
      const r = await apiPost<ResultadoAplicacao>("/api/modelos/aplicar", {
        nome: modeloEscolhido,
        sede_id: sedeId,
        datas: alvos,
      });
      const extra = r.detalhes.length > 0 ? ` Ex.: ${r.detalhes[0]}` : "";
      return `Modelo aplicado: ${r.criadas} criada(s), ${r.puladas} pulada(s) por conflito.${extra}`;
    });
  }

  async function excluirModelo() {
    if (!modeloEscolhido) return;
    // Sem `window.confirm`: marcado o "não mostrar mensagens assim novamente"
    // do navegador, ele passa a devolver false e a exclusão morre em silêncio.
    if (!confirmandoExclusao) {
      setConfirmandoExclusao(true);
      return;
    }
    setConfirmandoExclusao(false);
    executar(async () => {
      await apiDelete(`/api/modelos?nome=${encodeURIComponent(modeloEscolhido)}&sede=${sedeId}`);
      await mutateModelos();
      setModeloEscolhido("");
      return "Modelo excluído.";
    });
  }

  return (
    <Modal titulo="Duplicar dia e modelos de rotina" aberto={aberto} aoFechar={aoFechar} larguraMax={560}>
      <div style={{ display: "grid", gap: 20 }}>
        {/* período alvo */}
        <section>
          <h4 style={{ fontSize: 14, marginBottom: 8 }}>
            1 · Período de destino{" "}
            <span className="rotulo" style={{ fontWeight: 400 }}>
              ({datas.length} data{datas.length === 1 ? "" : "s"} selecionada{datas.length === 1 ? "" : "s"})
            </span>
          </h4>
          <SeletorPeriodo
            de={de}
            ate={ate}
            dias={dias}
            aoMudar={(d, a, ds) => {
              setDe(d);
              setAte(a);
              setDias(ds);
            }}
          />
        </section>

        {/* duplicar */}
        <section style={{ borderTop: "1px solid var(--linha)", paddingTop: 14 }}>
          <h4 style={{ fontSize: 14, marginBottom: 4 }}>2 · Duplicar este dia ({dataAtual})</h4>
          <p style={{ fontSize: 12, color: "var(--tinta-2)", marginBottom: 8 }}>
            Copia todas as tarefas de hoje para as datas do período. Conflitos no destino são pulados.
          </p>
          <button className="btn btn-primario" onClick={duplicar} disabled={ocupado || datas.length === 0}>
            ⧉ Duplicar para {datas.length || "…"} data(s)
          </button>
        </section>

        {/* modelos */}
        <section style={{ borderTop: "1px solid var(--linha)", paddingTop: 14, display: "grid", gap: 10 }}>
          <h4 style={{ fontSize: 14 }}>3 · Modelos de rotina</h4>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label className="campo" style={{ flex: 1 }}>
              <span className="rotulo">Salvar este dia como modelo</span>
              <input
                placeholder='Ex.: "Padrão segunda a sexta"'
                value={nomeNovoModelo}
                onChange={(e) => setNomeNovoModelo(e.target.value)}
              />
            </label>
            <button className="btn" onClick={salvarModelo} disabled={ocupado || !nomeNovoModelo.trim()}>
              Salvar
            </button>
          </div>
          {/* Rota padrão e evento se excluem: a rota padrão alimenta o "Gerar o
              dia"; o evento é aplicado sob demanda, na véspera. */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tinta-2)" }}>
            <input
              type="checkbox"
              checked={padraoNovo}
              disabled={eventoNovo}
              onChange={(e) => setPadraoNovo(e.target.checked)}
            />
            Marcar como <strong>rota padrão</strong> da sede (usada no "Gerar o dia")
          </label>
          {/* A rota padrão da sede é a UNIÃO das camadas marcadas como padrão. Dá
              para ter a de todo dia + a de segunda + a de sábado, e o "Gerar o
              dia" monta o que vale na data. Nenhum dia marcado = todo dia. */}
          {padraoNovo && (
            <div style={{ paddingLeft: 22, display: "grid", gap: 6 }}>
              <span className="rotulo">Esta rota vale em</span>
              <div style={{ display: "flex", gap: 4 }}>
                {/* Mesma lista e mesmo visual do seletor de período acima. */}
                {DIAS_SEMANA.map((d) => {
                  const marcado = diasPadrao.has(d.idx);
                  return (
                    <button
                      key={d.idx}
                      type="button"
                      className={`btn ${marcado ? "btn-primario" : ""}`}
                      style={{ padding: "4px 10px" }}
                      aria-pressed={marcado}
                      onClick={() => {
                        const proximo = new Set(diasPadrao);
                        if (marcado) proximo.delete(d.idx);
                        else proximo.add(d.idx);
                        setDiasPadrao(proximo);
                      }}
                    >
                      {d.rotulo}
                    </button>
                  );
                })}
              </div>
              {diasPadrao.size === 0 ? (
                <p style={{ fontSize: 11, color: "var(--tinta-3)", margin: 0 }}>
                  Nenhum dia marcado = vale todo dia. É a rota base da sede.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  <p style={{ fontSize: 11, color: "var(--tinta-3)", margin: 0 }}>
                    Vale só em <strong>{rotularDiasSemana(serializarDiasSemana([...diasPadrao]))}</strong>. E
                    nesses dias ela:
                  </p>
                  {/* Sem opção pré-marcada de propósito: escolher os dias sem dizer a
                      intenção fazia o dia duplicar em silêncio quando alguém salvava o
                      dia INTEIRO como camada em vez de só os extras. */}
                  <label style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--tinta-2)" }}>
                    <input
                      type="radio"
                      name="modo-camada"
                      checked={modoCamada === "acrescenta"}
                      onChange={() => setModoCamada("acrescenta")}
                    />
                    <span>
                      <strong>acrescenta</strong> ao dia — some com a rota de todo dia (use para o
                      serviço extra da segunda)
                    </span>
                  </label>
                  <label style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--tinta-2)" }}>
                    <input
                      type="radio"
                      name="modo-camada"
                      checked={modoCamada === "substitui"}
                      onChange={() => setModoCamada("substitui")}
                    />
                    <span>
                      <strong>substitui</strong> o dia — só ela monta esses dias (use quando o dia
                      tem programação própria)
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tinta-2)" }}>
            <input
              type="checkbox"
              checked={eventoNovo}
              disabled={padraoNovo}
              onChange={(e) => setEventoNovo(e.target.checked)}
            />
            É um <strong>modelo de evento</strong> (formatura, feira, prova…)
          </label>
          {eventoNovo && (
            <p style={{ fontSize: 11, color: "var(--tinta-3)", margin: 0, paddingLeft: 22 }}>
              Programe o evento <strong>com antecedência</strong> (ex.: na sexta, para o fim de
              semana). No dia, gere a rota padrão normalmente e aplique o evento por cima — o que
              conflitar de horário é pulado e informado.
            </p>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label className="campo" style={{ flex: 1 }}>
              <span className="rotulo">Aplicar modelo existente</span>
              <select value={modeloEscolhido} onChange={(e) => { setModeloEscolhido(e.target.value); setConfirmandoExclusao(false); }}>
                <option value="">— escolher —</option>
                {(() => {
                  const todos = modelos ?? [];
                  const rotulo = (m: ResumoModelo) =>
                    `${m.nome_modelo} (${m.itens} tarefas${m.inicio ? ` · ${m.inicio}–${m.fim}` : ""}${
                      m.dias_semana ? ` · ${rotularDiasSemana(m.dias_semana)}` : ""
                    }${m.substitui ? " · substitui o dia" : ""})`;
                  const rotas = todos.filter((m) => !m.evento);
                  const eventos = todos.filter((m) => m.evento);
                  return (
                    <>
                      {rotas.length > 0 && (
                        <optgroup label="Rotas">
                          {rotas.map((m) => (
                            <option key={m.nome_modelo} value={m.nome_modelo}>
                              {m.padrao ? "★ " : ""}
                              {rotulo(m)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {eventos.length > 0 && (
                        <optgroup label="Eventos">
                          {eventos.map((m) => (
                            <option key={m.nome_modelo} value={m.nome_modelo}>
                              {rotulo(m)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
            </label>
            <button className="btn btn-primario" onClick={aplicarModelo} disabled={ocupado || !modeloEscolhido}>
              Aplicar
            </button>
            <button
              className="btn btn-fantasma"
              style={{ color: "var(--vermelho)" }}
              onClick={excluirModelo}
              disabled={ocupado || !modeloEscolhido}
              title={confirmandoExclusao ? "Clique de novo para confirmar" : "Excluir modelo"}
            >
              {confirmandoExclusao ? "Confirmar exclusão" : "✕"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--tinta-3)" }}>
            O modelo é aplicado no período acima — ou só em {dataAtual}, se nenhum período for escolhido.
          </p>
        </section>

        {erro && <div className="alerta alerta-erro">{erro}</div>}
      </div>
    </Modal>
  );
}
