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
import { DIAS_SEMANA, DIAS_SEMANA_CURTO, parseDiasSemana, serializarDiasSemana } from "@/lib/dateUtils";
import Carregando from "./Carregando";
import Modal from "./Modal";

export interface OpcaoCampo {
  valor: string;
  rotulo: string;
}

export interface CampoForm {
  key: string;
  rotulo: string;
  tipo:
    | "texto"
    | "numero"
    | "hora"
    | "data"
    | "select"
    | "checkbox"
    | "textarea"
    | "dias_semana"
    | "multiselect";
  /**
   * Opções do select/multiselect. Como função, recalcula a cada digitação —
   * usado para oferecer "manter o valor atual" quando o registro tem um valor
   * fora da escala oferecida.
   */
  opcoes?: OpcaoCampo[] | ((form: Record<string, unknown>) => OpcaoCampo[]);
  obrigatorio?: boolean;
  padrao?: unknown;
  inteira?: boolean; // ocupa a linha toda do formulário
  passo?: string; // step para campos numéricos
  /**
   * Dica curta abaixo do campo. Como função, vira cálculo ao vivo — é o que
   * mata a dúvida em campo numérico: em vez de explicar a regra, mostrar a
   * conta ("20 min × 3 unidades = 60 min").
   */
  ajuda?: string | ((form: Record<string, unknown>) => string);
  /** Converte para número ao salvar mesmo não sendo `tipo: "numero"`. */
  numerico?: boolean;
  /** Explicação completa, mostrada ao clicar no (?) ao lado do rótulo. */
  dica?: string;
  /** Exibe o campo só quando a condição (sobre o estado atual do form) for verdadeira. */
  mostrarSe?: (form: Record<string, unknown>) => boolean;
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

/** Opções e ajuda podem ser função do formulário — aqui elas viram valor. */
function opcoesDe(campo: CampoForm, form: Record<string, unknown>): OpcaoCampo[] {
  const o = campo.opcoes;
  return (typeof o === "function" ? o(form) : o) ?? [];
}
function ajudaDe(campo: CampoForm, form: Record<string, unknown>): string {
  const a = campo.ajuda;
  return (typeof a === "function" ? a(form) : a) ?? "";
}

/**
 * Como chamar o registro na confirmação de exclusão.
 *
 * "Excluir definitivamente este registro?" não diz qual — e quem clicou errado
 * não tem como perceber antes de confirmar. Procura o campo de nome mais
 * provável e cai em "este registro" só se não achar nenhum.
 */
function rotuloDoItem(item: Registro): string {
  const candidatos = [
    "nome",
    "nome_local",
    "nome_tarefa",
    "nome_sede",
    "nome_modelo",
    "descricao",
    "email",
    "chave",
  ];
  for (const key of candidatos) {
    const valor = valorDe(item, key);
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return "este registro";
}

export default function CrudManager<T extends Registro>({
  titulo,
  subtitulo,
  endpoint,
  campos,
  colunas,
  textoNovo = "+ Novo",
  acoesExtra,
  aoCriar,
  vazio,
}: {
  titulo: string;
  subtitulo?: string;
  endpoint: string;
  campos: CampoForm[];
  colunas: ColunaTabela<T>[];
  textoNovo?: string;
  /** Controles adicionais por linha, à esquerda de Editar/Excluir. */
  acoesExtra?: (item: T) => React.ReactNode;
  /** Chamado com o registro recém-criado (não roda em edição). */
  aoCriar?: (criado: T) => void;
  /** Mensagem amigável quando ainda não há nada cadastrado. */
  vazio?: string;
}) {
  const { data, mutate, isLoading } = useSWR<T[]>(endpoint, fetcher);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<T | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState("");
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
      if (c.tipo === "numero" || c.numerico) corpo[c.key] = Number(corpo[c.key] ?? 0);
    }
    try {
      if (editando) await apiPut(`${endpoint.split("?")[0]}/${editando.id}`, corpo);
      else {
        const criado = await apiPost<T>(endpoint.split("?")[0], corpo);
        // Deixa a tela reagir ao registro novo — Usuários usa isto para gerar e
        // mostrar o código de primeiro acesso logo depois do cadastro.
        aoCriar?.(criado);
      }
      await mutate();
      setAberto(false);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Confirmação em modal do sistema, não no `confirm` do navegador.
   *
   * O nativo tem dois problemas: é feio fora da identidade, e o Chrome oferece
   * "não mostrar mensagens assim novamente" — marcado isso, `confirm` passa a
   * devolver `false` e **excluir para de funcionar em silêncio**, sem ninguém
   * entender o motivo.
   */
  async function confirmarExclusao() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErroExcluir("");
    try {
      await apiDelete(`${endpoint.split("?")[0]}/${paraExcluir.id}`);
      await mutate();
      setParaExcluir(null);
    } catch (err) {
      setErroExcluir(err instanceof ErroApi ? err.message : "Erro ao excluir.");
    } finally {
      setExcluindo(false);
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
          <button className="btn btn-primario" data-tour="crud-novo" onClick={abrirNovo}>
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
                <td colSpan={colunas.length + 1} style={{ textAlign: "center", padding: "40px 16px", color: "var(--tinta-3)" }}>
                  {data && data.length > 0 ? (
                    <>Nada encontrado para “{busca}”.</>
                  ) : (
                    <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                      <div style={{ fontSize: 26 }}>📋</div>
                      <div style={{ fontWeight: 700, color: "var(--tinta-2)", maxWidth: 420 }}>
                        {vazio ?? "Nada cadastrado aqui ainda."}
                      </div>
                      <button className="btn btn-primario" onClick={abrirNovo}>
                        {textoNovo}
                      </button>
                    </div>
                  )}
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
                  {acoesExtra && (
                    <>
                      {acoesExtra(item)}{" "}
                    </>
                  )}
                  <button className="btn btn-mini btn-fantasma" onClick={() => abrirEdicao(item)}>
                    Editar
                  </button>{" "}
                  <button
                    className="btn btn-mini btn-fantasma"
                    style={{ color: "var(--vermelho)" }}
                    onClick={() => { setParaExcluir(item); setErroExcluir(""); }}
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
          {campos.map((c) =>
            c.mostrarSe && !c.mostrarSe(form) ? null : (
            <label
              key={c.key}
              className="campo"
              // Todo campo de cadastro vira alvo possível do tutorial sem
              // trabalho manual: o roteiro só precisa citar "campo-<chave>".
              data-tour={`campo-${c.key}`}
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
                  {/* O campo pode trazer a própria opção de valor vazio, com
                      rótulo que explica o que "vazio" significa (ex.: "herdar
                      do tipo do local"). Nesse caso o genérico sobraria — e
                      duas opções com o mesmo valor deixariam a do campo
                      inalcançável, porque o navegador seleciona a primeira. */}
                  {!opcoesDe(c, form).some((o) => o.valor === "") && (
                    <option value="">— selecionar —</option>
                  )}
                  {opcoesDe(c, form).map((o) => (
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
              ) : c.tipo === "multiselect" ? (
                <span style={{ display: "flex", gap: 6, paddingTop: 4, flexWrap: "wrap" }}>
                  {opcoesDe(c, form).length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>Nenhuma opção disponível.</span>
                  )}
                  {opcoesDe(c, form).map((o) => {
                    const sel = String(form[c.key] ?? "").split(",").filter(Boolean);
                    const ativo = sel.includes(o.valor);
                    return (
                      <button
                        key={o.valor}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() =>
                          setForm((f) => {
                            const atuais = String(f[c.key] ?? "").split(",").filter(Boolean);
                            const proximos = ativo
                              ? atuais.filter((v) => v !== o.valor)
                              : [...atuais, o.valor];
                            return { ...f, [c.key]: proximos.join(",") };
                          })
                        }
                        style={{
                          padding: "4px 10px",
                          borderRadius: 4,
                          border: "1.5px solid var(--tinta)",
                          background: ativo ? "var(--acento)" : "var(--cartao)",
                          color: ativo ? "#fff" : "var(--tinta-2)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {o.rotulo}
                      </button>
                    );
                  })}
                </span>
              ) : c.tipo === "dias_semana" ? (
                <span style={{ display: "flex", gap: 6, paddingTop: 4, flexWrap: "wrap" }}>
                  {DIAS_SEMANA_CURTO.map((letra, idx) => {
                    const sel = parseDiasSemana(String(form[c.key] ?? ""));
                    const ativo = sel.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        title={DIAS_SEMANA[idx]}
                        aria-pressed={ativo}
                        onClick={() =>
                          setForm((f) => {
                            const atuais = parseDiasSemana(String(f[c.key] ?? ""));
                            const proximos = ativo
                              ? atuais.filter((d) => d !== idx)
                              : [...atuais, idx];
                            return { ...f, [c.key]: serializarDiasSemana(proximos) };
                          })
                        }
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 4,
                          border: "1.5px solid var(--tinta)",
                          background: ativo ? "var(--acento)" : "var(--cartao)",
                          color: ativo ? "var(--marfim, #fff)" : "var(--tinta-2)",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {letra}
                      </button>
                    );
                  })}
                </span>
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
              {ajudaDe(c, form) && (
                <span style={{ fontSize: 11, color: "var(--tinta-3)" }}>{ajudaDe(c, form)}</span>
              )}
            </label>
          ))}

          {erro && (
            <div className="alerta alerta-erro" style={{ gridColumn: "1 / -1" }}>
              {erro}
            </div>
          )}

          {salvando ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <Carregando texto="Salvando…" style={{ padding: 8 }} />
            </div>
          ) : (
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn" onClick={() => setAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primario" data-tour="crud-salvar">
                Salvar
              </button>
            </div>
          )}
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

      <Modal
        titulo="Excluir registro"
        aberto={!!paraExcluir}
        aoFechar={() => setParaExcluir(null)}
        larguraMax={420}
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--tinta-2)" }}>
          Excluir <strong>{paraExcluir ? rotuloDoItem(paraExcluir) : ""}</strong>{" "}
          definitivamente? Esta ação não tem desfazer — o registro sai da lista e
          fica apenas no histórico.
        </p>
        {erroExcluir && (
          <div className="alerta alerta-erro" style={{ marginTop: 12 }}>
            {erroExcluir}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn" onClick={() => setParaExcluir(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primario"
            onClick={() => void confirmarExclusao()}
            disabled={excluindo}
          >
            {excluindo ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
