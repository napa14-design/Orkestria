"use client";

/**
 * "Registrar atividade adicional" (18/11/2026, Consulta 6): o trabalho fora da rota a que a
 * pessoa foi puxada — montar/desmontar evento do colégio — lançado UMA vez por pessoa, direto,
 * sem precisar declarar antes um desvio numa tarefa. Grava um serviço eventual de "Apoio a
 * outro setor" com o tipo do que ela fez; a demanda, o déficit e o perfil do período o
 * sistema deriva. O mesmo formulário abre do Acompanhamento e da agenda.
 */
import { useState } from "react";
import Modal from "@/components/Modal";
import { EXIGENCIAS, type ExigenciaAtividade } from "@/lib/atividadeAdicional";
import { CATEGORIA_APOIO_OUTRO_SETOR } from "@/lib/calculations";
import { apiPost, ErroApi } from "@/lib/clientApi";
import { formatarDataBR, hhmmParaMin } from "@/lib/dateUtils";

export interface PessoaParaAtividade {
  id: string;
  nome: string;
}

export default function RegistrarAtividadeAdicional({
  sedeId,
  data,
  pessoas,
  pessoaInicial,
  aoSalvar,
  classeBotao = "btn",
}: {
  sedeId: string;
  data: string;
  /** Quem pode receber o lançamento (as pessoas do dia na sede). */
  pessoas: PessoaParaAtividade[];
  pessoaInicial?: string;
  aoSalvar?: () => void;
  /** A barra da agenda usa botão pequeno. */
  classeBotao?: string;
}) {
  const vazio = { pessoa: "", inicio: "", fim: "", descricao: "", exigencia: "" as ExigenciaAtividade | "", emprestimo: false, ate: "" };
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState("");

  function abrir() {
    // Nada pré-marcado no tipo: quem lança diz o que a pessoa fez (ou "Não sei informar").
    setForm({ ...vazio, pessoa: pessoaInicial && pessoas.some((p) => p.id === pessoaInicial) ? pessoaInicial : "" });
    setErro("");
    setFeito("");
    setAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!form.pessoa) return setErro("Escolha a pessoa.");
    if (!(hhmmParaMin(form.fim) > hhmmParaMin(form.inicio))) return setErro("Informe início e fim, com o fim depois do início.");
    if (!form.descricao.trim()) return setErro("Escreva o que foi feito (ex.: desmontagem do evento do colégio).");
    if (!form.exigencia) return setErro("Escolha o tipo do que a pessoa fez, ou “Não sei informar”.");
    if (form.emprestimo && form.ate && form.ate < data) return setErro("O “até” precisa ser depois do dia do lançamento.");
    setSalvando(true);
    try {
      const r = await apiPost<{ dias?: number; remanejos?: string[] }>("/api/servicos-eventuais", {
        sede_id: sedeId,
        funcionario_id: form.pessoa,
        local_id: "",
        categoria_id: CATEGORIA_APOIO_OUTRO_SETOR,
        data,
        tipo: "eventual",
        descricao: form.descricao.trim(),
        inicio: form.inicio,
        fim: form.fim,
        tempo_min: hhmmParaMin(form.fim) - hhmmParaMin(form.inicio),
        observacao: "",
        exigencia: form.exigencia,
        ...(form.emprestimo ? { libera_rota: true, ate: form.ate || undefined } : {}),
      });
      const nome = pessoas.find((p) => p.id === form.pessoa)?.nome ?? "";
      const dias = r?.dias ?? 1;
      const passadas = r?.remanejos?.length ?? 0;
      // Fica aberto para lançar a próxima pessoa do mesmo evento: o tipo é de cada uma.
      setFeito(
        `Registrado para ${nome}${dias > 1 ? ` em ${dias} dias` : ""}.` +
          (form.emprestimo
            ? ` ${passadas ? `${passadas} tarefa(s) crítica(s) passaram para outra pessoa.` : "Nenhuma tarefa crítica no horário."} As outras tarefas do horário aparecem na Central do dia.`
            : " Lance a próxima pessoa ou feche."),
      );
      setForm({ ...form, pessoa: "", exigencia: "" });
      aoSalvar?.();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível registrar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <button type="button" className={classeBotao} onClick={abrir} disabled={!sedeId}>
        + Atividade adicional
      </button>
      <Modal titulo={`Atividade adicional — ${formatarDataBR(data)}`} aberto={aberto} aoFechar={() => setAberto(false)} larguraMax={560}>
        <form onSubmit={salvar} style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 13, color: "var(--tinta-2)" }}>
            Trabalho fora da rota a que a pessoa foi puxada (ex.: montar ou desmontar evento, pintura para a manutenção). Soma na
            demanda do dia dela; a rota daquele horário continua contando, a não ser que você a cancele.
          </p>
          <label className="campo" style={{ gridColumn: "1 / -1" }}>
            <span className="rotulo">Pessoa *</span>
            <select value={form.pessoa} onChange={(e) => setForm({ ...form, pessoa: e.target.value })}>
              <option value="">Escolha…</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span className="rotulo">Início *</span>
            <input type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
          </label>
          <label className="campo">
            <span className="rotulo">Fim *</span>
            <input type="time" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
          </label>
          <label className="campo" style={{ gridColumn: "1 / -1" }}>
            <span className="rotulo">O que foi feito *</span>
            <input
              type="text"
              value={form.descricao}
              placeholder="Ex.: desmontagem do evento do colégio"
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </label>
          {/* Empréstimo (23/11/2026): a pessoa sai da rota nesse horário — as críticas passam sozinhas. */}
          <label style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.emprestimo}
              onChange={(e) => setForm({ ...form, emprestimo: e.target.checked })}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Emprestado(a) a outra unidade</strong>
              <span style={{ color: "var(--tinta-3)" }}>
                {" "}
                — tira a pessoa da rota nesse horário: as tarefas críticas passam sozinhas para outra pessoa e a Central
                propõe as demais.
              </span>
            </span>
          </label>
          {form.emprestimo && (
            <label className="campo" style={{ gridColumn: "1 / -1" }}>
              <span className="rotulo">Até (opcional, para vários dias)</span>
              <input type="date" value={form.ate} min={data} onChange={(e) => setForm({ ...form, ate: e.target.value })} />
              <span style={{ fontSize: 11, color: "var(--tinta-3)" }}>
                Mesmo horário em cada dia de trabalho da pessoa até esta data (pula folga e feriado). Para o dia todo, use o
                horário de entrada e saída dela.
              </span>
            </label>
          )}
          {/* Sem a classe "campo": o estilo dela estica todo input, e o botão de opção virava uma barra. */}
          <fieldset style={{ gridColumn: "1 / -1", border: 0, padding: 0, margin: 0, display: "grid", gap: 4, minWidth: 0 }}>
            <legend className="rotulo">O que esta pessoa fez *</legend>
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              {EXIGENCIAS.map((x) => (
                <label key={x.valor} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input
                    type="radio"
                    name="exigencia"
                    value={x.valor}
                    checked={form.exigencia === x.valor}
                    onChange={() => setForm({ ...form, exigencia: x.valor })}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>{x.rotulo}</strong>
                    <span style={{ color: "var(--tinta-3)" }}> — {x.dica}</span>
                  </span>
                </label>
              ))}
            </div>
            <span style={{ fontSize: 11, color: "var(--tinta-3)" }}>
              Se a pessoa fez mais de um tipo, marque o de maior exigência. O tipo não muda a conta do tempo.
            </span>
          </fieldset>
          {erro && (
            <div className="alerta alerta-erro" style={{ gridColumn: "1 / -1" }}>
              {erro}
            </div>
          )}
          {feito && (
            <div className="alerta alerta-ok" style={{ gridColumn: "1 / -1" }} role="status">
              {feito}
            </div>
          )}
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn" onClick={() => setAberto(false)}>
              Fechar
            </button>
            <button type="submit" className="btn btn-primario" disabled={salvando}>
              {salvando ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
