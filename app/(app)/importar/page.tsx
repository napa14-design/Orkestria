"use client";

/**
 * Importar rota por planilha: o supervisor baixa o modelo, preenche no Excel e
 * sobe. O sistema mostra o que SERÁ criado (preview, sem gravar), aponta os erros
 * linha a linha, e só então importa — criando locais, tarefas, funcionários e as
 * rotinas do dia (reaproveitando o que já existe) e salvando a rota padrão.
 */
import { useRef, useState } from "react";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import { CartaoKpi } from "@/components/DashboardCards";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { hojeISO } from "@/lib/dateUtils";
import type { Analise } from "@/lib/importacaoRota";
import type { Sede } from "@/types";

interface Resultado {
  locais: { criados: number; reaproveitados: number };
  tarefas: { criadas: number; reaproveitadas: number };
  funcionarios: { criados: number; reaproveitados: number };
  rotinas: { criadas: number; jaExistiam: number };
  rotaPadrao: number;
  avisos: string[];
}

export default function PaginaImportar() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const [sedeId, setSedeId] = useState("");
  const [data, setData] = useState(hojeISO());
  const [salvarPadrao, setSalvarPadrao] = useState(true);

  const [arquivo, setArquivo] = useState<string>("");
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sede = (sedes ?? []).find((s) => s.id === sedeId);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErro("");
    setAnalise(null);
    setResultado(null);
    setArquivo(f.name);
    setLendo(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", f);
      const res = await fetch("/api/importar/analisar", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok || body.erro) {
        setErro(body.erro ?? "Não consegui ler a planilha.");
        return;
      }
      setAnalise(body.analise as Analise);
    } catch {
      setErro("Falha ao enviar a planilha.");
    } finally {
      setLendo(false);
    }
  }

  async function importar() {
    if (!analise || !sedeId) return;
    setImportando(true);
    setErro("");
    try {
      const r = await apiPost<Resultado>("/api/importar/aplicar", {
        sede_id: sedeId,
        data,
        analise,
        salvar_padrao: salvarPadrao,
      });
      setResultado(r);
      setAnalise(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao importar.");
    } finally {
      setImportando(false);
    }
  }

  const temErros = (analise?.erros.length ?? 0) > 0;
  const podeImportar = !!analise && !temErros && !!sedeId && !importando;

  return (
    <div className="entra" style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Importar rota (planilha)</h1>
      <p style={{ color: "var(--tinta-2)", marginTop: 2, marginBottom: 18 }}>
        Baixe o modelo, preencha a rota no Excel e suba aqui. O sistema cria os{" "}
        <strong>locais, tarefas, funcionários</strong> e as <strong>rotinas do dia</strong> —
        reaproveitando o que já existe na sede. Uma linha por tarefa.
      </p>

      {/* passo 1 — modelo */}
      <div className="painel" style={{ padding: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <span className="rotulo" style={{ color: "var(--acento)" }}>Passo 1 — o modelo</span>
          <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 2 }}>
            Tem a aba <strong>“Como preencher”</strong> explicando cada coluna. A duração da tarefa
            sai de <strong>Fim − Início</strong>.
          </div>
        </div>
        <a href="/api/importar/modelo" className="btn btn-primario" style={{ textDecoration: "none" }}>
          ⬇ Baixar modelo (.xlsx)
        </a>
      </div>

      {/* passo 2 — destino + arquivo */}
      <div className="painel" style={{ padding: 16, marginBottom: 14 }}>
        <span className="rotulo" style={{ color: "var(--acento)" }}>Passo 2 — para onde vai</span>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
          <label className="campo" style={{ minWidth: 240, flex: 1 }}>
            <span className="rotulo">Sede *</span>
            <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              <option value="">— selecionar —</option>
              {(sedes ?? []).filter((s) => s.ativo).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo ? `${s.codigo} · ` : ""}{s.nome_sede}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span className="rotulo">Dia da rota *</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 8 }}>
            <input type="checkbox" checked={salvarPadrao} onChange={(e) => setSalvarPadrao(e.target.checked)} style={{ width: "auto" }} />
            Salvar como <strong>rota padrão</strong> da sede
          </label>
        </div>

        <input ref={inputRef} type="file" accept=".xlsx" onChange={aoEscolher} style={{ display: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => inputRef.current?.click()} disabled={lendo || !sedeId}>
            {lendo ? "Lendo…" : "📄 Escolher planilha preenchida"}
          </button>
          {!sedeId && <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>Escolha a sede primeiro.</span>}
          {arquivo && <span className="num" style={{ fontSize: 12, color: "var(--tinta-3)" }}>{arquivo}</span>}
        </div>
      </div>

      {erro && <div className="alerta alerta-erro" style={{ marginBottom: 14 }}>{erro}</div>}
      {lendo && <div className="painel"><Carregando texto="Lendo a planilha…" style={{ padding: 40 }} /></div>}

      {/* passo 3 — preview */}
      {analise && (
        <div className="painel" style={{ padding: 16, marginBottom: 14 }}>
          <span className="rotulo" style={{ color: "var(--acento)" }}>
            Passo 3 — confira antes de gravar{sede ? ` · ${sede.nome_sede}` : ""}
          </span>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0" }}>
            <CartaoKpi rotulo="Funcionários" valor={String(analise.funcionarios.length)} />
            <CartaoKpi rotulo="Locais" valor={String(analise.locais.length)} />
            <CartaoKpi rotulo="Tarefas" valor={String(analise.tarefas.length)} />
            <CartaoKpi rotulo="Rotinas do dia" valor={String(analise.rotinas.length)} cor="var(--verde)" />
          </div>

          {temErros && (
            <div className="alerta alerta-erro" style={{ marginBottom: 12 }}>
              <strong>{analise.erros.length} erro(s) — corrija na planilha e suba de novo.</strong>
              <ul style={{ margin: "8px 0 0 18px", fontSize: 13 }}>
                {analise.erros.slice(0, 12).map((e, i) => (
                  <li key={i}>
                    {e.linha > 0 && <strong>Linha {e.linha + 1}: </strong>}
                    {e.mensagem}
                  </li>
                ))}
                {analise.erros.length > 12 && <li>…e mais {analise.erros.length - 12}.</li>}
              </ul>
            </div>
          )}

          {analise.avisos.length > 0 && (
            <div className="alerta alerta-aviso" style={{ marginBottom: 12 }}>
              <strong>{analise.avisos.length} aviso(s)</strong> — não impedem a importação.
              <ul style={{ margin: "8px 0 0 18px", fontSize: 13 }}>
                {analise.avisos.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    {a.linha > 0 && <strong>Linha {a.linha + 1}: </strong>}
                    {a.mensagem}
                  </li>
                ))}
                {analise.avisos.length > 8 && <li>…e mais {analise.avisos.length - 8}.</li>}
              </ul>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="btn btn-primario" onClick={importar} disabled={!podeImportar}>
              {importando ? "Importando…" : `✅ Importar para ${sede?.nome_sede ?? "a sede"}`}
            </button>
            <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>
              Reimportar a mesma planilha é seguro — não duplica nada.
            </span>
          </div>
        </div>
      )}

      {/* resultado */}
      {resultado && (
        <div className="painel" style={{ padding: 16 }}>
          <div className="alerta alerta-ok" style={{ marginBottom: 12 }}>
            <strong>Importação concluída.</strong>
            {resultado.rotaPadrao > 0 && ` Rota padrão salva com ${resultado.rotaPadrao} tarefa(s).`}
          </div>
          <div className="tabela-rolavel">
          <table className="tabela" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>O quê</th><th style={{ width: 110 }}>Criados</th><th style={{ width: 150 }}>Já existiam</th></tr>
            </thead>
            <tbody>
              <tr><td>Locais</td><td className="num">{resultado.locais.criados}</td><td className="num">{resultado.locais.reaproveitados}</td></tr>
              <tr><td>Tarefas</td><td className="num">{resultado.tarefas.criadas}</td><td className="num">{resultado.tarefas.reaproveitadas}</td></tr>
              <tr><td>Funcionários</td><td className="num">{resultado.funcionarios.criados}</td><td className="num">{resultado.funcionarios.reaproveitados}</td></tr>
              <tr><td><strong>Rotinas do dia</strong></td><td className="num"><strong>{resultado.rotinas.criadas}</strong></td><td className="num">{resultado.rotinas.jaExistiam}</td></tr>
            </tbody>
          </table>
          </div>
          {resultado.avisos.length > 0 && (
            <div className="alerta alerta-aviso" style={{ marginTop: 12 }}>
              <ul style={{ margin: "0 0 0 18px", fontSize: 13 }}>
                {resultado.avisos.slice(0, 10).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
