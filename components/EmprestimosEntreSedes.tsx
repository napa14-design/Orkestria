"use client";

/**
 * Emprestar uma pessoa a outra unidade (24/11/2026, decisão do dono: sai da atividade adicional e
 * vem para o "Remanejo entre sedes"). É um lançamento de "Apoio a outro setor" com `libera_rota`:
 * as horas contam como apoio, as críticas do horário passam sozinhas para outra pessoa, e a
 * Central propõe as demais. Não é ausência: não entra em Ausências nem conta como falta.
 * Coordenador vê e lança só nas sedes dele (o servidor confere de novo); administrador, em todas.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import SeletorSede from "@/components/SeletorSede";
import { useSessao } from "@/components/SessaoContexto";
import { CATEGORIA_APOIO_OUTRO_SETOR } from "@/lib/calculations";
import { apiDelete, apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { formatarDataBR, hhmmParaMin, hojeISO, somarDias } from "@/lib/dateUtils";
import { podeEscrever } from "@/lib/permissions";
import { sedeDaTela } from "@/lib/sedeDaTela";
import type { Funcionario, Sede, ServicoEventual } from "@/types";

const DESTINO_LIVRE = "outra";
const vazio = { pessoa: "", de: "", ate: "", inicio: "", fim: "", destino: "", destinoTexto: "" };

export default function EmprestimosEntreSedes() {
  const sessao = useSessao();
  const [sedeEscolhida, setSedeEscolhida] = useState("");
  const [form, setForm] = useState({ ...vazio, de: hojeISO() });
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<ServicoEventual | null>(null);

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const sedeId = sedeDaTela(sedes, sedeEscolhida, null);
  const { data: funcionarios } = useSWR<Funcionario[]>(sedeId ? `/api/funcionarios?sede=${sedeId}` : null, fetcher);
  // Hoje em diante, um mês: o que ainda importa para a operação.
  const ate = somarDias(hojeISO(), 31);
  const { data: eventuais, mutate } = useSWR<ServicoEventual[]>(
    sedeId ? `/api/servicos-eventuais?de=${hojeISO()}&ate=${ate}&sede=${sedeId}` : null,
    fetcher,
  );

  const pessoas = useMemo(
    () => (funcionarios ?? []).filter((f) => f.ativo !== false && !f.desligado_em).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [funcionarios],
  );
  const nomeDe = useMemo(() => new Map((funcionarios ?? []).map((f) => [f.id, f.nome])), [funcionarios]);
  const emprestimos = useMemo(
    () => (eventuais ?? []).filter((e) => e.libera_rota).sort((a, b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio)),
    [eventuais],
  );

  if (!sessao || !podeEscrever(sessao)) return null;

  function escolherPessoa(id: string) {
    const f = pessoas.find((p) => p.id === id);
    // Preenche com a jornada dela; para só parte do dia, é só mudar.
    setForm((s) => ({ ...s, pessoa: id, inicio: s.inicio || f?.entrada || "", fim: s.fim || f?.saida || "" }));
  }

  const destinoFinal =
    form.destino === DESTINO_LIVRE ? form.destinoTexto.trim() : (sedes ?? []).find((s) => s.id === form.destino)?.nome_sede ?? "";

  async function emprestar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setFeito("");
    if (!form.pessoa) return setErro("Escolha a pessoa.");
    if (!form.de) return setErro("Escolha o dia.");
    if (form.ate && form.ate < form.de) return setErro("O “até” precisa ser depois do início.");
    if (!(hhmmParaMin(form.fim) > hhmmParaMin(form.inicio))) return setErro("Informe início e fim, com o fim depois do início.");
    if (!destinoFinal) return setErro("Diga para onde a pessoa vai.");
    setSalvando(true);
    try {
      const r = await apiPost<{ dias?: number; remanejos?: string[] }>("/api/servicos-eventuais", {
        sede_id: sedeId,
        funcionario_id: form.pessoa,
        local_id: "",
        categoria_id: CATEGORIA_APOIO_OUTRO_SETOR,
        data: form.de,
        tipo: "eventual",
        descricao: `Emprestado(a) para ${destinoFinal}`,
        inicio: form.inicio,
        fim: form.fim,
        tempo_min: hhmmParaMin(form.fim) - hhmmParaMin(form.inicio),
        observacao: "",
        exigencia: "nao_sei",
        libera_rota: true,
        ate: form.ate || undefined,
      });
      const dias = r?.dias ?? 1;
      const passadas = r?.remanejos?.length ?? 0;
      setFeito(
        `${nomeDe.get(form.pessoa) ?? "Pessoa"} emprestado(a)${dias > 1 ? ` em ${dias} dias` : ""}. ` +
          (passadas ? `${passadas} tarefa(s) crítica(s) passaram para outra pessoa. ` : "") +
          "As demais do horário aparecem na Central do dia.",
      );
      setForm({ ...vazio, de: form.de });
      await mutate();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível registrar o empréstimo.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!excluindo) return;
    try {
      await apiDelete(`/api/servicos-eventuais/${excluindo.id}`);
      await mutate();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível excluir.");
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <section className="painel" style={{ padding: 16, display: "grid", gap: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0 }}>Emprestar uma pessoa a outra unidade</h2>
          <p style={{ color: "var(--tinta-2)", margin: "2px 0 0", fontSize: 13 }}>
            Ela sai da rota no horário: as tarefas críticas passam sozinhas para outra pessoa e a Central propõe as demais.
            As horas contam como apoio. Não é ausência.
          </p>
        </div>
        <SeletorSede sedes={sedes ?? []} valor={sedeId} aoMudar={(id) => { setSedeEscolhida(id); setForm({ ...vazio, de: form.de }); }} />
      </div>

      <form onSubmit={emprestar} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", alignItems: "end" }}>
        <label className="campo">
          <span className="rotulo">Pessoa *</span>
          <select value={form.pessoa} onChange={(e) => escolherPessoa(e.target.value)}>
            <option value="">Escolha…</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span className="rotulo">Para onde *</span>
          <select value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })}>
            <option value="">Escolha…</option>
            {(sedes ?? []).filter((s) => s.ativo && s.id !== sedeId).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome_sede}
              </option>
            ))}
            <option value={DESTINO_LIVRE}>Outra unidade (escrever)…</option>
          </select>
        </label>
        {form.destino === DESTINO_LIVRE && (
          <label className="campo">
            <span className="rotulo">Qual unidade *</span>
            <input type="text" value={form.destinoTexto} placeholder="Ex.: Aldeota" onChange={(e) => setForm({ ...form, destinoTexto: e.target.value })} />
          </label>
        )}
        <label className="campo">
          <span className="rotulo">Dia *</span>
          <input type="date" value={form.de} onChange={(e) => setForm({ ...form, de: e.target.value })} />
        </label>
        <label className="campo">
          <span className="rotulo">Até (opcional)</span>
          <input type="date" value={form.ate} min={form.de} onChange={(e) => setForm({ ...form, ate: e.target.value })} />
        </label>
        <label className="campo">
          <span className="rotulo">Início *</span>
          <input type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
        </label>
        <label className="campo">
          <span className="rotulo">Fim *</span>
          <input type="time" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
        </label>
        <button type="submit" className="btn btn-primario" disabled={salvando || !sedeId}>
          {salvando ? "Registrando…" : "Emprestar"}
        </button>
      </form>
      <p style={{ margin: 0, fontSize: 11, color: "var(--tinta-3)" }}>
        Com “Até”, vale o mesmo horário em cada dia de trabalho da pessoa (pula folga e feriado). O horário vem da jornada dela;
        para algumas horas, mude início e fim.
      </p>
      {erro && <div className="alerta alerta-erro">{erro}</div>}
      {feito && <div className="alerta alerta-ok" role="status">{feito}</div>}

      <div>
        <span className="rotulo">Empréstimos de hoje em diante</span>
        {emprestimos.length === 0 ? (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--tinta-3)" }}>Nenhum nesta sede.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "grid", gap: 6 }}>
            {emprestimos.map((e) => (
              <li key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, borderBottom: "1px dashed var(--linha)", paddingBottom: 6 }}>
                <span className="num" style={{ minWidth: 84 }}>{formatarDataBR(e.data)}</span>
                <span className="num" style={{ color: "var(--tinta-2)", minWidth: 96 }}>{e.inicio}–{e.fim}</span>
                <strong>{nomeDe.get(e.funcionario_id) ?? "?"}</strong>
                <span style={{ color: "var(--tinta-2)", flex: 1, minWidth: 160 }}>{e.descricao}</span>
                <button type="button" className="btn btn-mini btn-fantasma" onClick={() => setExcluindo(e)}>
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal titulo="Excluir empréstimo" aberto={!!excluindo} aoFechar={() => setExcluindo(null)} larguraMax={460}>
        {excluindo && (
          <div style={{ display: "grid", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              Excluir o empréstimo de <strong>{nomeDe.get(excluindo.funcionario_id) ?? "?"}</strong> em {formatarDataBR(excluindo.data)}{" "}
              ({excluindo.inicio}–{excluindo.fim})? As tarefas que já passaram para outra pessoa não voltam sozinhas: desfaça pela
              Central do dia.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-fantasma" onClick={() => setExcluindo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primario" onClick={() => void excluir()}>
                Excluir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
