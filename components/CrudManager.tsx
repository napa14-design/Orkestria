"use client";

/**
 * CRUD genérico: tabela + modal de criação/edição + exclusão.
 * Cada tela de cadastro (funcionários, sedes, locais, tarefas) apenas
 * declara campos e colunas — o comportamento é todo daqui.
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { apiDelete, apiPost, apiPut, ErroApi, fetcher } from "@/lib/clientApi";
import Carregando from "./Carregando";
import Modal from "./Modal";

export interface OpcaoCampo {
  valor: string;
  rotulo: string;
}

export interface CampoForm {
  key: string;
  rotulo: string;
  tipo: "texto" | "numero" | "hora" | "data" | "select" | "checkbox" | "textarea";
  opcoes?: OpcaoCampo[];
  obrigatorio?: boolean;
  padrao?: unknown;
  inteira?: boolean; // ocupa a linha toda do formulário
  passo?: string; // step para campos numéricos
  ajuda?: string; // dica curta exibida abaixo do campo
  /** Explicação completa, mostrada ao clicar no (?) ao lado do rótulo. */
  dica?: string;
}

export interface ColunaTabela<T> {
  key: string;
  rotulo: string;
  render?: (item: T) => React.ReactNode;
}

type Registro = { id: string };

function valorDe(item: Registro, key: string): unknown {
  return (item as unknown as Record<string, unknown>)[key];
}

export default function CrudManager<T extends Registro>({
  titulo,
  subtitulo,
  endpoint,
  campos,
  colunas,
  textoNovo = "+ Novo",
}: {
  titulo: string;
  subtitulo?: string;
  endpoint: string;
  campos: CampoForm[];
  colunas: ColunaTabela<T>[];
  textoNovo?: string;
}) {
  const { data, mutate, isLoading } = useSWR<T[]>(endpoint, fetcher);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Balão de ajuda flutuante (hover/foco no "?"). Posição em coordenadas
  // de tela, renderizado em portal para nunca ser cortado pelo modal.
  const [tip, setTip] = useState<{ texto: string; x: number; y: number; acima: boolean } | null>(null);

  function mostrarDica(el: HTMLElement, texto: string) {
    const r = el.getBoundingClientRect();
    const acima = r.bottom + 130 > window.innerHeight;
    setTip({
      texto,
      x: Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140),
      y: acima ? r.top - 8 : r.bottom + 8,
      acima,
    });
  }
  const esconderDica = () => setTip(null);

  const itens = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) =>
      Object.values(item).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, busca]);

  function abrirNovo() {
    const inicial: Record<string, unknown> = {};
    for (const c of campos) {
      inicial[c.key] =
        c.padrao ?? (c.tipo === "checkbox" ? true : c.tipo === "numero" ? 0 : "");
    }
    setForm(inicial);
    setEditando(null);
    setErro("");
    setTip(null);
    setAberto(true);
  }

  function abrirEdicao(item: T) {
    const inicial: Record<string, unknown> = {};
    for (const c of campos) inicial[c.key] = valorDe(item, c.key) ?? "";
    setForm(inicial);
    setEditando(item);
    setErro("");
    setTip(null);
    setAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    const corpo: Record<string, unknown> = { ...form };
    for (const c of campos) {
      if (c.tipo === "numero") corpo[c.key] = Number(corpo[c.key] ?? 0);
    }
    try {
      if (editando) await apiPut(`${endpoint.split("?")[0]}/${editando.id}`, corpo);
      else await apiPost(endpoint.split("?")[0], corpo);
      await mutate();
      setAberto(false);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(item: T) {
    if (!window.confirm(`Excluir definitivamente este registro?`)) return;
    try {
      await apiDelete(`${endpoint.split("?")[0]}/${item.id}`);
      await mutate();
    } catch (err) {
      window.alert(err instanceof ErroApi ? err.message : "Erro ao excluir.");
    }
  }

  return (
    <div className="entra">
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>{titulo}</h1>
          {subtitulo && (
            <p style={{ color: "var(--tinta-2)", marginTop: 2 }}>{subtitulo}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            placeholder="Buscar…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1.5px solid var(--tinta)",
              borderRadius: 4,
              background: "var(--cartao)",
              width: 200,
            }}
          />
          <button className="btn btn-primario" onClick={abrirNovo}>
            {textoNovo}
          </button>
        </div>
      </div>

      <div className="painel" style={{ overflow: "auto" }}>
        <table className="tabela">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.key}>{c.rotulo}</th>
              ))}
              <th style={{ width: 110, textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={colunas.length + 1} style={{ padding: 16 }}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!isLoading && itens.length === 0 && (
              <tr>
                <td colSpan={colunas.length + 1} style={{ textAlign: "center", padding: 32, color: "var(--tinta-3)" }}>
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {itens.map((item) => (
              <tr key={item.id}>
                {colunas.map((c) => (
                  <td key={c.key}>
                    {c.render ? c.render(item) : String(valorDe(item, c.key) ?? "")}
                  </td>
                ))}
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-mini btn-fantasma" onClick={() => abrirEdicao(item)}>
                    Editar
                  </button>{" "}
                  <button
                    className="btn btn-mini btn-fantasma"
                    style={{ color: "var(--vermelho)" }}
                    onClick={() => excluir(item)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        titulo={editando ? `Editar — ${titulo}` : `Novo — ${titulo}`}
        aberto={aberto}
        aoFechar={() => setAberto(false)}
      >
        <form onSubmit={salvar} className="form-grade">
          {campos.map((c) => (
            <label
              key={c.key}
              className="campo"
              style={{ gridColumn: c.inteira ? "1 / -1" : undefined }}
            >
              <span className="rotulo" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>
                  {c.rotulo}
                  {c.obrigatorio ? " *" : ""}
                </span>
                {c.dica && (
                  <button
                    type="button"
                    aria-label={`Ajuda: ${c.rotulo}`}
                    onMouseEnter={(e) => mostrarDica(e.currentTarget, c.dica!)}
                    onMouseLeave={esconderDica}
                    onFocus={(e) => mostrarDica(e.currentTarget, c.dica!)}
                    onBlur={esconderDica}
                    onClick={(e) => e.preventDefault()}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "1.5px solid var(--acento)",
                      background: "transparent",
                      color: "var(--acento)",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "help",
                      padding: 0,
                    }}
                  >
                    ?
                  </button>
                )}
              </span>
              {c.tipo === "select" ? (
                <select
                  value={String(form[c.key] ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                  required={c.obrigatorio}
                >
                  <option value="">— selecionar —</option>
                  {c.opcoes?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              ) : c.tipo === "checkbox" ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form[c.key])}
                    onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: "var(--acento)" }}
                  />
                  <span style={{ fontSize: 13 }}>Sim</span>
                </span>
              ) : c.tipo === "textarea" ? (
                <textarea
                  value={String(form[c.key] ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                />
              ) : (
                <input
                  type={
                    c.tipo === "numero"
                      ? "number"
                      : c.tipo === "hora"
                        ? "time"
                        : c.tipo === "data"
                          ? "date"
                          : "text"
                  }
                  step={c.passo}
                  value={String(form[c.key] ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                  required={c.obrigatorio}
                />
              )}
              {c.ajuda && (
                <span style={{ fontSize: 11, color: "var(--tinta-3)" }}>{c.ajuda}</span>
              )}
            </label>
          ))}

          {erro && (
            <div className="alerta alerta-erro" style={{ gridColumn: "1 / -1" }}>
              {erro}
            </div>
          )}

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primario" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>

      {tip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: tip.x,
              top: tip.y,
              transform: `translate(-50%, ${tip.acima ? "-100%" : "0"})`,
              maxWidth: 270,
              background: "var(--cartao)",
              color: "var(--tinta-2)",
              fontSize: 12,
              lineHeight: 1.5,
              padding: "9px 12px",
              border: "1.5px solid var(--tinta)",
              borderLeft: "5px solid var(--acento)",
              borderRadius: "var(--raio)",
              boxShadow: "var(--sombra)",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            {tip.texto}
          </div>,
          document.body,
        )}
    </div>
  );
}
