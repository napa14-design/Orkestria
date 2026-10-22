"use client";

/**
 * "Usar este dia como padrão" — o dia montado na tela vira modelo, de dois jeitos:
 *
 *  · **Rota padrão** — marca os dias da semana e este dia passa a ser a rota
 *    padrão deles, SUBSTITUINDO a anterior. Sem "acrescenta × substitui": cada
 *    dia da semana tem uma rota só.
 *  · **Evento** — guarda o dia com nome (formatura, feira…) e aplica depois,
 *    numa data, por cima da rota padrão.
 *
 * Era "Preencher dias" (copiar o dia para um período) com a biblioteca de rotas
 * numa segunda tela. Pedido do dono em 21/10/2026: *"temos que deixar mais fácil
 * a rota padrão"*. A cópia saiu: com o dia virando padrão, o "⚡ Gerar" já monta
 * os outros dias.
 */
import { useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import { apiDelete, apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { formatarDataBR, parseDiasSemana, rotularDiasSemana, serializarDiasSemana } from "@/lib/dateUtils";
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
const TODOS = [0, 1, 2, 3, 4, 5, 6];

/** Dias já marcados ao abrir: dia útil → Seg–Sex; fim de semana → só ele. */
function diasIniciais(data: string): Set<number> {
  const dow = new Date(`${data}T12:00:00`).getDay();
  return new Set(dow >= 1 && dow <= 5 ? [1, 2, 3, 4, 5] : [dow]);
}

/** O que acontece com uma rota padrão que já existe, se estes dias forem trocados. */
function efeitoNaRota(rota: ResumoModelo, marcados: Set<number>): string {
  const valia = parseDiasSemana(rota.dias_semana);
  const dias = valia.length ? valia : TODOS;
  const restam = dias.filter((d) => !marcados.has(d));
  if (restam.length === dias.length) return "continua igual";
  if (restam.length === 0) return "sai";
  return `fica só em ${rotularDiasSemana(serializarDiasSemana(restam))}`;
}

/** Um evento (ou rota antiga guardada): aplicar numa data, ou apagar. */
function LinhaEvento({
  modelo,
  dataAtual,
  confirmando,
  ocupado,
  aoAplicar,
  aoExcluir,
}: {
  modelo: ResumoModelo;
  dataAtual: string;
  confirmando: boolean;
  ocupado: boolean;
  aoAplicar: (data: string) => void;
  aoExcluir: () => void;
}) {
  const [data, setData] = useState(dataAtual);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--linha)", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 13, color: "var(--tinta)" }}>{modelo.nome_modelo}</div>
        <div style={{ fontSize: 11, color: "var(--tinta-3)" }}>
          {modelo.itens} tarefa{modelo.itens === 1 ? "" : "s"}
          {modelo.inicio ? ` · ${modelo.inicio}–${modelo.fim}` : ""}
        </div>
      </div>
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label={`Data para aplicar ${modelo.nome_modelo}`} />
      <button className="btn btn-mini" onClick={() => aoAplicar(data)} disabled={ocupado || !data}>
        Aplicar
      </button>
      <button
        className="btn btn-fantasma btn-mini"
        style={{ color: "var(--vermelho)" }}
        onClick={aoExcluir}
        disabled={ocupado}
        title={confirmando ? "Clique de novo para confirmar" : `Excluir "${modelo.nome_modelo}"`}
      >
        {confirmando ? "Confirmar exclusão" : "✕"}
      </button>
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

  const [modo, setModo] = useState<"padrao" | "evento">("padrao");
  const [dias, setDias] = useState<Set<number>>(() => diasIniciais(dataAtual));
  const [diasDoDia, setDiasDoDia] = useState(dataAtual);
  const [nomeEvento, setNomeEvento] = useState("");
  /** Nome aguardando o segundo clique do excluir (dois toques). */
  const [confirmandoExclusao, setConfirmandoExclusao] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Trocou de dia com o modal montado: os dias marcados acompanham o dia novo.
  if (diasDoDia !== dataAtual) {
    setDiasDoDia(dataAtual);
    setDias(diasIniciais(dataAtual));
  }

  const rotasPadrao = (modelos ?? []).filter((m) => m.padrao && !m.evento);
  // Rotas antigas guardadas sem ser padrão continuam aplicáveis, junto dos
  // eventos (e o dado antigo marcado padrão E evento, que o Gerar ignora).
  const guardados = (modelos ?? []).filter((m) => m.evento || !m.padrao);
  const diasCsv = serializarDiasSemana([...dias]);

  // O modal fica montado entre aberturas: fechar volta ao começo, senão o
  // "Evento" e o nome digitado reapareciam na próxima vez (auditoria).
  function fechar() {
    setErro("");
    setConfirmandoExclusao("");
    setModo("padrao");
    setNomeEvento("");
    setDias(diasIniciais(dataAtual));
    aoFechar();
  }

  async function executar(fn: () => Promise<string>, fecharDepois = true) {
    setErro("");
    setOcupado(true);
    try {
      const mensagem = await fn();
      aoConcluir(mensagem);
      if (fecharDepois) fechar();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  function salvarPadrao() {
    if (dias.size === 0) {
      setErro("Marque ao menos um dia da semana.");
      return;
    }
    executar(async () => {
      const r = await apiPost<{ itens: number; encolhidas: string[]; removidas: string[] }>("/api/modelos/padrao", {
        data_origem: dataAtual,
        sede_id: sedeId,
        dias: [...dias],
      });
      await mutateModelos();
      return `${formatarDataBR(dataAtual)} agora é a rota padrão de ${rotularDiasSemana(diasCsv)} (${r.itens} tarefa${r.itens === 1 ? "" : "s"}). Os próximos dias gerados seguem essa rota.`;
    });
  }

  function guardarEvento() {
    executar(async () => {
      const r = await apiPost<{ itens: number }>("/api/modelos", {
        nome: nomeEvento,
        data_origem: dataAtual,
        sede_id: sedeId,
        evento: true,
        com_duracao: true,
      });
      await mutateModelos();
      const nome = nomeEvento.trim();
      setNomeEvento("");
      return `Evento "${nome}" guardado com ${r.itens} tarefa(s). Aplique na data dele, aqui mesmo.`;
    }, false);
  }

  function aplicar(nome: string, data: string) {
    executar(async () => {
      const r = await apiPost<ResultadoAplicacao>("/api/modelos/aplicar", { nome, sede_id: sedeId, datas: [data] });
      const extra = r.detalhes.length > 0 ? ` Ex.: ${r.detalhes[0]}` : "";
      return `"${nome}" aplicado em ${formatarDataBR(data)}: ${r.criadas} criada(s), ${r.puladas} pulada(s) por conflito de horário.${extra}`;
    });
  }

  async function excluir(nome: string) {
    // Sem `window.confirm`: marcado o "não mostrar mensagens assim novamente"
    // do navegador, ele passa a devolver false e a exclusão morre em silêncio.
    if (confirmandoExclusao !== nome) {
      setConfirmandoExclusao(nome);
      return;
    }
    setConfirmandoExclusao("");
    executar(async () => {
      await apiDelete(`/api/modelos?nome=${encodeURIComponent(nome)}&sede=${sedeId}`);
      await mutateModelos();
      return `"${nome}" excluído.`;
    }, false);
  }

  const opcao = (valor: "padrao" | "evento", titulo: string, texto: string) => (
    <label
      style={{
        flex: 1,
        display: "flex",
        gap: 8,
        padding: "10px 12px",
        border: `2px solid ${modo === valor ? "var(--tinta)" : "var(--linha)"}`,
        background: modo === valor ? "var(--cartao)" : "transparent",
        cursor: "pointer",
      }}
    >
      <input type="radio" name="modo-padrao" checked={modo === valor} onChange={() => setModo(valor)} />
      <span>
        <strong style={{ display: "block", fontSize: 14 }}>{titulo}</strong>
        <span style={{ fontSize: 12, color: "var(--tinta-2)" }}>{texto}</span>
      </span>
    </label>
  );

  return (
    <Modal titulo={`Usar ${formatarDataBR(dataAtual)} como padrão`} aberto={aberto} aoFechar={fechar} larguraMax={560}>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {opcao("padrao", "Rota padrão", "Este dia monta os dias da semana que você marcar.")}
          {opcao("evento", "Evento", "Guarda o dia com nome, para aplicar numa data.")}
        </div>

        {modo === "padrao" ? (
          <section style={{ display: "grid", gap: 10 }}>
            <span className="rotulo">Vale em</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DIAS_SEMANA.map((d) => {
                const marcado = dias.has(d.idx);
                return (
                  <button
                    key={d.idx}
                    type="button"
                    className={`btn btn-mini ${marcado ? "btn-primario" : ""}`}
                    aria-pressed={marcado}
                    onClick={() => {
                      const novo = new Set(dias);
                      if (marcado) novo.delete(d.idx);
                      else novo.add(d.idx);
                      setDias(novo);
                    }}
                  >
                    {d.rotulo}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: "var(--tinta-2)", margin: 0 }}>
              {dias.size === 0
                ? "Marque ao menos um dia."
                : `Substitui a rota padrão de ${rotularDiasSemana(diasCsv)}. Os próximos dias gerados nesses dias seguem este.`}
            </p>
            {rotasPadrao.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--tinta-2)", borderTop: "1px solid var(--linha)", paddingTop: 8 }}>
                <span className="rotulo">Rota padrão de hoje</span>
                {rotasPadrao.map((m) => {
                  const efeito = dias.size > 0 ? efeitoNaRota(m, dias) : "";
                  return (
                    <div key={m.nome_modelo} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      {/* Os dias, não o nome: "Rota padrão" salva à mão pode ter
                          encolhido, e o nome não diz mais em que dias vale. */}
                      <span style={{ flex: 1 }}>
                        {m.dias_semana ? rotularDiasSemana(m.dias_semana) : "todo dia"} · {m.itens} tarefa
                        {m.itens === 1 ? "" : "s"}
                      </span>
                      {efeito && (
                        <span style={{ color: efeito === "continua igual" ? "var(--tinta-3)" : "var(--acento)" }}>{efeito}</span>
                      )}
                      <button
                        type="button"
                        className="btn btn-fantasma btn-mini"
                        style={{ color: "var(--vermelho)" }}
                        onClick={() => excluir(m.nome_modelo)}
                        disabled={ocupado}
                        title={confirmandoExclusao === m.nome_modelo ? "Clique de novo para confirmar" : "Apagar esta rota padrão"}
                      >
                        {confirmandoExclusao === m.nome_modelo ? "Confirmar" : "✕"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--tinta-3)", margin: 0 }}>
              Dias que já foram gerados não mudam sozinhos. Para refazer um, abra o dia, use “↺ Desfazer a geração” e
              gere de novo.
            </p>
            <button
              className="btn btn-primario"
              style={{ justifySelf: "end" }}
              onClick={salvarPadrao}
              disabled={ocupado || dias.size === 0}
            >
              {ocupado ? "Salvando…" : "★ Salvar como padrão"}
            </button>
          </section>
        ) : (
          <section style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <label className="campo" style={{ flex: 1 }}>
                <span className="rotulo">Nome do evento</span>
                <input
                  placeholder='Ex.: "Formatura", "Feira de ciências"'
                  value={nomeEvento}
                  onChange={(e) => setNomeEvento(e.target.value)}
                />
              </label>
              <button className="btn btn-primario" onClick={guardarEvento} disabled={ocupado || !nomeEvento.trim()}>
                Guardar evento
              </button>
            </div>
            <div>
              <span className="rotulo">Guardados nesta sede</span>
              {guardados.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--tinta-3)", margin: "6px 0 0" }}>
                  Nenhum evento guardado ainda. Monte o dia do evento e guarde acima.
                </p>
              ) : (
                <div style={{ marginTop: 4 }}>
                  {guardados.map((m) => (
                    <LinhaEvento
                      key={m.nome_modelo}
                      modelo={m}
                      dataAtual={dataAtual}
                      ocupado={ocupado}
                      confirmando={confirmandoExclusao === m.nome_modelo}
                      aoAplicar={(data) => aplicar(m.nome_modelo, data)}
                      aoExcluir={() => excluir(m.nome_modelo)}
                    />
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--tinta-3)", margin: "8px 0 0" }}>
                Aplicar entra por cima do que já está no dia; o que bater de horário é pulado e avisado.
              </p>
            </div>
          </section>
        )}

        {erro && <div className="alerta alerta-erro">{erro}</div>}
      </div>
    </Modal>
  );
}
