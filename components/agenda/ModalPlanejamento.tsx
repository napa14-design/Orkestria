"use client";

/**
 * Modal de planejamento em lote: duplicar o dia para outra data ou período
 * (com escolha de dias da semana) e salvar/aplicar/excluir modelos de rotina.
 */
import { useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import { apiDelete, apiPost, ErroApi, fetcher } from "@/lib/clientApi";
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
  const [eventoNovo, setEventoNovo] = useState(false);
  const [modeloEscolhido, setModeloEscolhido] = useState("");
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
    executar(async () => {
      const r = await apiPost<{ itens: number }>("/api/modelos", {
        nome: nomeNovoModelo,
        data_origem: dataAtual,
        sede_id: sedeId,
        padrao: padraoNovo,
        com_duracao: true,
        evento: eventoNovo,
      });
      await mutateModelos();
      const nome = nomeNovoModelo;
      const eraEvento = eventoNovo;
      // Zera os flags: o modal fica montado, e um "padrão" esquecido faria o
      // PRÓXIMO modelo salvo roubar a rota padrão da sede sem ninguém notar.
      setNomeNovoModelo("");
      setPadraoNovo(false);
      setEventoNovo(false);
      return `Modelo "${nome}" salvo com ${r.itens} tarefa(s)${
        padraoNovo ? " (rota padrão da sede)" : eraEvento ? " (modelo de evento)" : ""
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
    if (!window.confirm(`Excluir o modelo "${modeloEscolhido}"?`)) return;
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
              <select value={modeloEscolhido} onChange={(e) => setModeloEscolhido(e.target.value)}>
                <option value="">— escolher —</option>
                {(() => {
                  const todos = modelos ?? [];
                  const rotulo = (m: ResumoModelo) =>
                    `${m.nome_modelo} (${m.itens} tarefas${m.inicio ? ` · ${m.inicio}–${m.fim}` : ""})`;
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
              title="Excluir modelo"
            >
              ✕
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
