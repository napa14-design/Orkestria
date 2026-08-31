"use client";

/**
 * Planejamento em lote, em DUAS telas — uma por vez.
 *
 * Antes era uma caixa só, "Duplicar dia e modelos de rotina", com três passos
 * numerados. O "e" do título era a confissão: o "1 · Período de destino" valia
 * para duplicar e para aplicar, mas **não** para salvar (que sempre salva o dia
 * atual); salvar e aplicar são operações inversas e dividiam a mesma seção; e o
 * ✕ de excluir ficava pendurado no seletor do aplicar. Relato de 31/08: *"acho
 * muito confuso"*.
 *
 * A divisão é por intenção, e nasce de uma percepção: **duplicar o dia e aplicar
 * um modelo são a MESMA operação com origens diferentes** — copiar tarefas para
 * um período. Então:
 *
 *  · **Preencher dias** — de onde (este dia | uma rota salva) → para quando → um
 *    botão. É o uso frequente.
 *  · **Rotas salvas** — a biblioteca: salvar este dia com nome, marcar se é a
 *    rota padrão da sede (e em que dias vale) ou um evento, e apagar. Aqui não
 *    existe período, porque período não se aplica a guardar.
 *
 * Uma tela por vez, com link entre elas: a barra continua com um botão só.
 */
import { useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import { apiDelete, apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import {
  formatarDataBR,
  proximoDiaMarcado,
  rotularDiasSemana,
  serializarDiasSemana,
} from "@/lib/dateUtils";
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

/** Valor da origem que significa "as tarefas que já estão na tela". */
const ORIGEM_DIA = "__dia__";

/** ISO do dia, no fuso local (meio-dia evita a virada por UTC). */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lista de datas YYYY-MM-DD entre de/até, filtrada pelos dias da semana. */
function datasDoPeriodo(de: string, ate: string, diasAtivos: Set<number>): string[] {
  if (!de || !ate || de > ate) return [];
  const datas: string[] = [];
  const cursor = new Date(`${de}T12:00:00`);
  const fim = new Date(`${ate}T12:00:00`);
  while (cursor <= fim && datas.length < 62) {
    if (diasAtivos.has(cursor.getDay())) datas.push(iso(cursor));
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

/** Uma linha da biblioteca: o que é a rota e o ✕ que apaga ELA. */
function LinhaRota({
  modelo,
  confirmando,
  ocupado,
  aoExcluir,
}: {
  modelo: ResumoModelo;
  confirmando: boolean;
  ocupado: boolean;
  aoExcluir: () => void;
}) {
  const marcas = [
    modelo.padrao ? "★ rota padrão" : "",
    modelo.evento ? "evento" : "",
    modelo.dias_semana ? rotularDiasSemana(modelo.dias_semana) : modelo.padrao ? "todo dia" : "",
    modelo.substitui ? "substitui o dia" : "",
    modelo.inicio ? `${modelo.inicio}–${modelo.fim}` : "",
  ].filter(Boolean);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderTop: "1px solid var(--linha)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--tinta)" }}>{modelo.nome_modelo}</div>
        <div style={{ fontSize: 11, color: "var(--tinta-3)" }}>
          {modelo.itens} tarefa{modelo.itens === 1 ? "" : "s"}
          {marcas.length > 0 && ` · ${marcas.join(" · ")}`}
        </div>
      </div>
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

  const [tela, setTela] = useState<"preencher" | "salvas">("preencher");
  const [origem, setOrigem] = useState(ORIGEM_DIA);
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
  /** Nome da rota aguardando o segundo clique do excluir (dois toques). */
  const [confirmandoExclusao, setConfirmandoExclusao] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const rotas = (modelos ?? []).filter((m) => !m.evento);
  const eventos = (modelos ?? []).filter((m) => m.evento);

  const copiandoODia = origem === ORIGEM_DIA;
  /**
   * O período é **opcional**. Preencher só uma das duas datas vale por um dia
   * só; não preencher nenhuma tem um destino padrão, e o botão sempre diz qual
   * é — copiar o dia vai para o próximo dia marcado, aplicar uma rota entra no
   * dia que está na tela (o comportamento de sempre).
   */
  const periodoInformado = Boolean(de || ate);
  const datas = periodoInformado ? datasDoPeriodo(de || ate, ate || de, dias) : [];
  const destinoPadrao = copiandoODia ? proximoDiaMarcado(dataAtual, dias) : dataAtual;
  // O destino padrão vale SÓ para quem não informou período. Quem informou um
  // período que não rende data nenhuma fica sem destino de propósito: cair no
  // padrão aqui mandaria o dia para uma data que a pessoa não pediu, e o botão
  // diria isso em letra pequena enquanto o aviso vermelho dizia o contrário.
  const alvos = periodoInformado ? datas : destinoPadrao ? [destinoPadrao] : [];

  function fechar() {
    setErro("");
    setConfirmandoExclusao("");
    setTela("preencher");
    aoFechar();
  }

  async function executar(fn: () => Promise<string>) {
    setErro("");
    setOcupado(true);
    try {
      const mensagem = await fn();
      aoConcluir(mensagem);
      fechar();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Um botão, dois caminhos: copiar o dia da tela ou aplicar uma rota salva.
   * Para quem usa é a mesma frase — "põe estas tarefas nestes dias".
   */
  function preencher() {
    if (alvos.length === 0) {
      setErro("Marque ao menos um dia da semana, ou escolha um período.");
      return;
    }
    if (copiandoODia) {
      executar(async () => {
        const r = await apiPost<{ copiadas: number; puladas: number }>("/api/rotinas/duplicar", {
          data_origem: dataAtual,
          datas_destino: alvos,
          sede_id: sedeId,
        });
        return `${r.copiadas} tarefa(s) copiada(s)${r.puladas > 0 ? `, ${r.puladas} pulada(s) por conflito` : ""}.`;
      });
      return;
    }
    executar(async () => {
      const r = await apiPost<ResultadoAplicacao>("/api/modelos/aplicar", {
        nome: origem,
        sede_id: sedeId,
        datas: alvos,
      });
      const extra = r.detalhes.length > 0 ? ` Ex.: ${r.detalhes[0]}` : "";
      return `Rota aplicada: ${r.criadas} criada(s), ${r.puladas} pulada(s) por conflito.${extra}`;
    });
  }

  function salvarRota() {
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
      // Zera os flags: o modal fica montado, e um "padrão" esquecido faria a
      // PRÓXIMA rota salva roubar a rota padrão da sede sem ninguém notar.
      setNomeNovoModelo("");
      setPadraoNovo(false);
      setEventoNovo(false);
      setDiasPadrao(new Set());
      const modoSalvo = modoCamada;
      setModoCamada("");
      return `Rota "${nome}" salva com ${r.itens} tarefa(s)${
        padraoNovo
          ? ` (rota padrão da sede${diasSalvos ? `, ${rotularDiasSemana(diasSalvos)}${modoSalvo === "substitui" ? ", substituindo o dia" : ""}` : ", todo dia"})`
          : eraEvento
            ? " (modelo de evento)"
            : ""
      }.`;
    });
  }

  async function excluirRota(nome: string) {
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
      if (origem === nome) setOrigem(ORIGEM_DIA);
      return "Rota excluída.";
    });
  }

  // O botão nomeia o destino: uma data quando é uma só, a contagem quando são
  // várias. Assim ninguém clica sem saber onde as tarefas vão cair.
  const rotuloDestino =
    alvos.length === 0
      ? "…"
      : alvos.length === 1
        ? formatarDataBR(alvos[0])
        : `${alvos.length} dias`;
  const rotuloBotao = copiandoODia ? `⧉ Copiar para ${rotuloDestino}` : `Aplicar em ${rotuloDestino}`;

  return (
    <Modal
      titulo={tela === "preencher" ? "Preencher dias" : "Rotas salvas"}
      aberto={aberto}
      aoFechar={fechar}
      larguraMax={560}
    >
      {tela === "preencher" ? (
        <div style={{ display: "grid", gap: 18 }}>
          <section style={{ display: "grid", gap: 6 }}>
            <label className="campo">
              <span className="rotulo">De onde vêm as tarefas</span>
              <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                <option value={ORIGEM_DIA}>Deste dia ({formatarDataBR(dataAtual)})</option>
                {rotas.length > 0 && (
                  <optgroup label="Rotas salvas">
                    {rotas.map((m) => (
                      <option key={m.nome_modelo} value={m.nome_modelo}>
                        {m.padrao ? "★ " : ""}
                        {m.nome_modelo} ({m.itens} tarefas)
                      </option>
                    ))}
                  </optgroup>
                )}
                {eventos.length > 0 && (
                  <optgroup label="Eventos">
                    {eventos.map((m) => (
                      <option key={m.nome_modelo} value={m.nome_modelo}>
                        {m.nome_modelo} ({m.itens} tarefas)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <p style={{ fontSize: 12, color: "var(--tinta-2)", margin: 0 }}>
              {copiandoODia
                ? "Copia as tarefas que estão na tela hoje. Conflito de horário no destino é pulado."
                : "Aplica as tarefas guardadas nesta rota. Conflito de horário no destino é pulado."}
            </p>
          </section>

          <section style={{ borderTop: "1px solid var(--linha)", paddingTop: 14, display: "grid", gap: 8 }}>
            <span className="rotulo">
              Para quais dias{" "}
              <span style={{ fontWeight: 400 }}>
                {periodoInformado
                  ? `(${datas.length} data${datas.length === 1 ? "" : "s"})`
                  : "(opcional)"}
              </span>
            </span>
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
            {/* Nunca ficar em silêncio: ou explica o destino padrão, ou diz por
                que não há destino nenhum. */}
            {periodoInformado && datas.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--vermelho)", margin: 0 }}>
                Nenhuma data no período: os dias da semana marcados não caem entre essas datas.
              </p>
            ) : !periodoInformado ? (
              <p style={{ fontSize: 11, color: "var(--tinta-3)", margin: 0 }}>
                {alvos.length === 0
                  ? "Marque ao menos um dia da semana."
                  : copiandoODia
                    ? `Sem período, copia para o próximo dia marcado: ${formatarDataBR(alvos[0])}.`
                    : `Sem período, a rota entra só em ${formatarDataBR(alvos[0])}.`}
              </p>
            ) : null}
          </section>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <button className="btn btn-fantasma" type="button" onClick={() => setTela("salvas")}>
              Rotas salvas →
            </button>
            <button
              className="btn btn-primario"
              onClick={preencher}
              disabled={ocupado || alvos.length === 0}
            >
              {rotuloBotao}
            </button>
          </div>

          {erro && <div className="alerta alerta-erro">{erro}</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          <section>
            <span className="rotulo">Guardadas nesta sede</span>
            {(modelos ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 6 }}>
                Nenhuma rota salva ainda. Monte um dia como ele deve ser e salve abaixo.
              </p>
            ) : (
              <div style={{ marginTop: 6 }}>
                {[...rotas, ...eventos].map((m) => (
                  <LinhaRota
                    key={m.nome_modelo}
                    modelo={m}
                    ocupado={ocupado}
                    confirmando={confirmandoExclusao === m.nome_modelo}
                    aoExcluir={() => excluirRota(m.nome_modelo)}
                  />
                ))}
              </div>
            )}
          </section>

          <section style={{ borderTop: "1px solid var(--linha)", paddingTop: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <label className="campo" style={{ flex: 1 }}>
                <span className="rotulo">Salvar {formatarDataBR(dataAtual)} como rota</span>
                <input
                  placeholder='Ex.: "Padrão segunda a sexta"'
                  value={nomeNovoModelo}
                  onChange={(e) => setNomeNovoModelo(e.target.value)}
                />
              </label>
              <button className="btn" onClick={salvarRota} disabled={ocupado || !nomeNovoModelo.trim()}>
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
          </section>

          <button
            className="btn btn-fantasma"
            type="button"
            style={{ justifySelf: "start" }}
            onClick={() => setTela("preencher")}
          >
            ← Preencher dias
          </button>

          {erro && <div className="alerta alerta-erro">{erro}</div>}
        </div>
      )}
    </Modal>
  );
}
