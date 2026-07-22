"use client";

/**
 * CRUD genérico: tabela + modal de criação/edição + exclusão.
 * Cada tela de cadastro (funcionários, sedes, locais, tarefas) apenas
 * declara campos e colunas — o comportamento é todo daqui.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { apiDelete, apiPost, apiPut, ErroApi, fetcher } from "@/lib/clientApi";
import { DIAS_SEMANA, DIAS_SEMANA_CURTO, parseDiasSemana, serializarDiasSemana } from "@/lib/dateUtils";
import Carregando from "./Carregando";
import Modal from "./Modal";
import { useSessao } from "./SessaoContext";

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
  opcoes?: OpcaoCampo[];
  obrigatorio?: boolean;
  padrao?: unknown;
  inteira?: boolean; // ocupa a linha toda do formulário
  passo?: string; // step para campos numéricos
  ajuda?: string; // dica curta exibida abaixo do campo
  /** Explicação completa, mostrada ao clicar no (?) ao lado do rótulo. */
  dica?: string;
  /** Exibe o campo só quando a condição (sobre o estado atual do form) for verdadeira. */
  mostrarSe?: (form: Record<string, unknown>) => boolean;
  /** Agrupa formulários longos em blocos operacionais legíveis. */
  secao?: string;
  descricaoSecao?: string;
  /** Fica recolhido na criação rápida; ao editar, todas as opções aparecem. */
  avancado?: boolean;
  /** Com uma única opção permitida, preenche e bloqueia o seletor automaticamente. */
  automaticoSeUnico?: boolean;
  /** Cria uma opção dependente sem fechar este formulário e devolve o novo id. */
  acaoAuxiliar?: {
    rotulo: string;
    executar: (definirValor: (valor: string) => void) => void;
  };
}

export interface ColunaTabela<T> {
  key: string;
  rotulo: string;
  render?: (item: T) => React.ReactNode;
}

export interface FiltroRapido<T> {
  valor: string;
  rotulo: string;
  testar: (item: T) => boolean;
}

type Registro = { id: string };

function valorDe(item: Registro, key: string): unknown {
  return (item as unknown as Record<string, unknown>)[key];
}

function normalizarBusca(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export default function CrudManager<T extends Registro>({
  titulo,
  subtitulo,
  endpoint,
  campos,
  colunas,
  textoNovo = "+ Novo",
  abrirNovoAoMontar = false,
  chaveRascunho,
  acoesExtra,
  filtrosRapidos,
  textoBusca,
  permitirDuplicar = false,
  rotuloRegistro,
  vazio,
}: {
  titulo: string;
  subtitulo?: string;
  endpoint: string;
  campos: CampoForm[];
  colunas: ColunaTabela<T>[];
  textoNovo?: string;
  /** Abre o formulário de criação uma vez, usado por atalhos globais. */
  abrirNovoAoMontar?: boolean;
  /** Mantém rascunho de criação na sessão atual do navegador. */
  chaveRascunho?: string;
  /** Controles adicionais por linha, à esquerda de Editar/Excluir. */
  acoesExtra?: (item: T) => React.ReactNode;
  filtrosRapidos?: FiltroRapido<T>[];
  textoBusca?: (item: T) => string;
  permitirDuplicar?: boolean;
  rotuloRegistro?: (item: T) => string;
  /** Mensagem amigável quando ainda não há nada cadastrado. */
  vazio?: string;
}) {
  const sessao = useSessao();
  const podeEscrever = sessao.perfil !== "visualizador";
  const { data, mutate, isLoading } = useSWR<T[]>(endpoint, fetcher);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [filtroRapido, setFiltroRapido] = useState("todos");
  const [ordem, setOrdem] = useState<"original" | "az" | "za">("original");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [rascunhoRetomado, setRascunhoRetomado] = useState(false);
  const [excluindo, setExcluindo] = useState<T | null>(null);
  const [erroExclusao, setErroExclusao] = useState("");
  const [exclusaoEmAndamento, setExclusaoEmAndamento] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [statusEmMassa, setStatusEmMassa] = useState<boolean | null>(null);
  const [processandoMassa, setProcessandoMassa] = useState(false);
  const [progressoMassa, setProgressoMassa] = useState(0);
  const [erroMassa, setErroMassa] = useState("");
  const [mensagemLista, setMensagemLista] = useState("");
  const [mostrarAvancados, setMostrarAvancados] = useState(false);
  const abriuAutomaticamente = useRef(false);
  const pularProximaPersistencia = useRef(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
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
    const q = normalizarBusca(busca.trim());
    const filtroSelecionado = filtrosRapidos?.find((filtro) => filtro.valor === filtroRapido);
    const filtrados = data.filter((item) => {
      const registro = item as unknown as Record<string, unknown>;
      if (status === "ativos" && registro.ativo !== true) return false;
      if (status === "inativos" && registro.ativo !== false) return false;
      if (filtroSelecionado && !filtroSelecionado.testar(item)) return false;
      if (!q) return true;
      const valores = [...Object.values(item), textoBusca?.(item) ?? ""];
      return valores.some((valor) => normalizarBusca(valor).includes(q));
    });
    if (ordem === "original") return filtrados;
    const chavePrincipal = colunas[0]?.key ?? "id";
    return filtrados.toSorted((a, b) => {
      const comparacao = normalizarBusca(valorDe(a, chavePrincipal)).localeCompare(
        normalizarBusca(valorDe(b, chavePrincipal)),
        "pt-BR",
      );
      return ordem === "az" ? comparacao : -comparacao;
    });
  }, [data, busca, status, filtroRapido, filtrosRapidos, textoBusca, ordem, colunas]);

  const temStatus = useMemo(
    () => data?.some((item) => typeof (item as unknown as Record<string, unknown>).ativo === "boolean") ?? false,
    [data],
  );
  const temCamposAvancados = campos.some((campo) => campo.avancado);
  const temSelecao = podeEscrever && temStatus;
  const temAcoes = podeEscrever || Boolean(acoesExtra);

  const itensSelecionados = useMemo(
    () => (data ?? []).filter((item) => selecionados.has(item.id)),
    [data, selecionados],
  );
  const selecionaveisVisiveis = useMemo(
    () =>
      itens.filter(
        (item) =>
          typeof (item as unknown as Record<string, unknown>).ativo === "boolean",
      ),
    [itens],
  );
  const todosVisiveisSelecionados =
    selecionaveisVisiveis.length > 0 &&
    selecionaveisVisiveis.every((item) => selecionados.has(item.id));
  const quantidadeSelecionadaVisivel = selecionaveisVisiveis.filter((item) =>
    selecionados.has(item.id),
  ).length;

  useEffect(() => {
    if (!data) return;
    const idsAtuais = new Set(data.map((item) => item.id));
    setSelecionados((atuais) => {
      const validos = new Set([...atuais].filter((id) => idsAtuais.has(id)));
      if (validos.size === atuais.size) return atuais;
      return validos;
    });
  }, [data]);

  function alternarSelecao(id: string) {
    setMensagemLista("");
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  function alternarTodosVisiveis() {
    setMensagemLista("");
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (todosVisiveisSelecionados) {
        for (const item of selecionaveisVisiveis) proximos.delete(item.id);
      } else {
        for (const item of selecionaveisVisiveis) proximos.add(item.id);
      }
      return proximos;
    });
  }

  function prepararStatusEmMassa(ativo: boolean) {
    setStatusEmMassa(ativo);
    setErroMassa("");
    setProgressoMassa(0);
  }

  async function aplicarStatusEmMassa() {
    if (statusEmMassa === null || itensSelecionados.length === 0) return;
    setProcessandoMassa(true);
    setErroMassa("");
    setProgressoMassa(0);
    const idsConcluidos: string[] = [];
    const falhas: string[] = [];
    const base = endpoint.split("?")[0];

    for (const item of itensSelecionados) {
      try {
        await apiPut(`${base}/${item.id}`, { ativo: statusEmMassa });
        idsConcluidos.push(item.id);
      } catch (err) {
        const nome =
          rotuloRegistro?.(item) ??
          String(valorDe(item, colunas[0]?.key ?? "id"));
        falhas.push(
          `${nome}: ${err instanceof ErroApi ? err.message : "não foi possível atualizar"}`,
        );
      }
      setProgressoMassa((atual) => atual + 1);
    }

    await mutate();
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      for (const id of idsConcluidos) proximos.delete(id);
      return proximos;
    });
    setProcessandoMassa(false);

    if (falhas.length > 0) {
      setErroMassa(
        `${idsConcluidos.length} atualizado(s). ${falhas.length} falharam: ${falhas.join(" · ")}`,
      );
      return;
    }

    const acao = statusEmMassa ? "ativado" : "inativado";
    setStatusEmMassa(null);
    setMensagemLista(
      `${idsConcluidos.length} registro(s) ${acao}(s) com sucesso. Cada alteração foi auditada individualmente.`,
    );
  }

  function criarFormInicial(): Record<string, unknown> {
    const inicial: Record<string, unknown> = {};
    for (const c of campos) {
      inicial[c.key] =
        c.padrao ??
        (c.tipo === "select" && c.opcoes?.length === 1
          ? c.opcoes[0].valor
          : c.tipo === "checkbox"
            ? true
            : c.tipo === "numero"
              ? 0
              : "");
    }
    return inicial;
  }

  function abrirNovo() {
    let inicial = criarFormInicial();
    let retomado = false;
    if (chaveRascunho) {
      try {
        const salvo = sessionStorage.getItem(`orkestria:rascunho:${chaveRascunho}`);
        if (salvo) {
          inicial = { ...inicial, ...(JSON.parse(salvo) as Record<string, unknown>) };
          retomado = true;
        }
      } catch {
        sessionStorage.removeItem(`orkestria:rascunho:${chaveRascunho}`);
      }
    }
    setForm(inicial);
    setRascunhoRetomado(retomado);
    setEditando(null);
    setErro("");
    setSucesso("");
    setTip(null);
    setMostrarAvancados(false);
    setAberto(true);
  }

  useEffect(() => {
    if (!abrirNovoAoMontar || abriuAutomaticamente.current) return;
    abriuAutomaticamente.current = true;
    abrirNovo();
    // Executa somente na transição do atalho; os campos usados são os da mesma renderização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirNovoAoMontar]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const buscaInicial = params.get("busca");
    const filtroInicial = params.get("filtro");
    if (buscaInicial) setBusca(buscaInicial);
    if (filtroInicial && filtrosRapidos?.some((filtro) => filtro.valor === filtroInicial)) {
      setFiltroRapido(filtroInicial);
    }
    if (!buscaInicial && !filtroInicial) return;
    params.delete("busca");
    params.delete("filtro");
    const novaUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", novaUrl);
    // A URL só fornece o estado inicial; não deve resetar filtros escolhidos pelo usuário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const focarBuscaLocal = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo?.matches("input, textarea, select, [contenteditable='true']");
      if (e.key === "Escape" && document.activeElement === buscaRef.current && busca) {
        e.preventDefault();
        setBusca("");
        buscaRef.current?.blur();
        return;
      }
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || digitando || aberto) return;
      e.preventDefault();
      buscaRef.current?.focus();
    };
    window.addEventListener("keydown", focarBuscaLocal);
    return () => window.removeEventListener("keydown", focarBuscaLocal);
  }, [aberto, busca]);

  useEffect(() => {
    if (!chaveRascunho || !aberto || editando) return;
    if (pularProximaPersistencia.current) {
      pularProximaPersistencia.current = false;
      return;
    }
    sessionStorage.setItem(
      `orkestria:rascunho:${chaveRascunho}`,
      JSON.stringify(form),
    );
  }, [chaveRascunho, aberto, editando, form]);

  // A leitura de sedes pode terminar depois da abertura do modal. Quando só
  // existe uma opção permitida, preenche o vínculo sem exigir mais um clique.
  useEffect(() => {
    if (!aberto || editando) return;
    setForm((atual) => {
      let mudou = false;
      const proximo = { ...atual };
      for (const campo of campos) {
        if (campo.tipo === "select" && campo.opcoes?.length === 1 && !proximo[campo.key]) {
          proximo[campo.key] = campo.opcoes[0].valor;
          mudou = true;
        }
      }
      return mudou ? proximo : atual;
    });
  }, [aberto, editando, campos]);

  function abrirEdicao(item: T) {
    const inicial: Record<string, unknown> = {};
    for (const c of campos) inicial[c.key] = valorDe(item, c.key) ?? "";
    setForm(inicial);
    setEditando(item);
    setRascunhoRetomado(false);
    setErro("");
    setSucesso("");
    setTip(null);
    setMostrarAvancados(true);
    setAberto(true);
  }

  function abrirDuplicacao(item: T) {
    const inicial = criarFormInicial();
    for (const c of campos) inicial[c.key] = valorDe(item, c.key) ?? inicial[c.key];
    setForm(inicial);
    setEditando(null);
    setRascunhoRetomado(false);
    setErro("");
    setSucesso("Cópia preparada. Revise os dados e salve como um novo registro.");
    setTip(null);
    setMostrarAvancados(true);
    setAberto(true);
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvando(true);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const continuarCadastrando = !editando && submitter?.dataset.continuar === "true";
    const corpo: Record<string, unknown> = { ...form };
    for (const c of campos) {
      if (c.tipo === "numero") corpo[c.key] = Number(corpo[c.key] ?? 0);
    }
    try {
      if (editando) await apiPut(`${endpoint.split("?")[0]}/${editando.id}`, corpo);
      else {
        await apiPost(endpoint.split("?")[0], corpo);
        if (chaveRascunho)
          sessionStorage.removeItem(`orkestria:rascunho:${chaveRascunho}`);
      }
      await mutate();
      if (continuarCadastrando) {
        setForm(criarFormInicial());
        setRascunhoRetomado(false);
        setSucesso("Registro salvo. O formulário está pronto para o próximo.");
        requestAnimationFrame(() => {
          const primeiroCampo = formRef.current?.querySelector<HTMLElement>(
            "input:not([type='checkbox']), select, textarea",
          );
          primeiroCampo?.focus();
        });
      } else {
        setMensagemLista(editando ? "Alterações salvas com sucesso." : "Registro criado com sucesso.");
        setAberto(false);
      }
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setExclusaoEmAndamento(true);
    setErroExclusao("");
    try {
      await apiDelete(`${endpoint.split("?")[0]}/${excluindo.id}`);
      await mutate();
      setExcluindo(null);
      setMensagemLista("Registro excluído com sucesso.");
    } catch (err) {
      setErroExclusao(err instanceof ErroApi ? err.message : "Erro ao excluir.");
    } finally {
      setExclusaoEmAndamento(false);
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
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 28, fontWeight: 800 }}>{titulo}</h1>
            {data && <span className="selo selo-cinza">{data.length} registro{data.length === 1 ? "" : "s"}</span>}
          </div>
          {subtitulo && (
            <p style={{ color: "var(--tinta-2)", marginTop: 2 }}>{subtitulo}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="crud-busca-local">
            <span aria-hidden="true">⌕</span>
            <input
              ref={buscaRef}
              aria-label={`Buscar em ${titulo}`}
              placeholder="Buscar…  /"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {busca && (
              <button type="button" onClick={() => { setBusca(""); buscaRef.current?.focus(); }} aria-label="Limpar busca">×</button>
            )}
          </div>
          {podeEscrever && (
            <button className="btn btn-primario" onClick={abrirNovo}>
              {textoNovo}
            </button>
          )}
        </div>
      </div>

      {busca && data && (
        <div className="crud-resultado-busca rotulo" role="status">
          Mostrando {itens.length} de {data.length} — pressione <kbd>Esc</kbd> ou limpe para voltar
        </div>
      )}

      {mensagemLista && (
        <div className="alerta alerta-ok crud-mensagem-lista" role="status">
          {mensagemLista}
          <button type="button" aria-label="Fechar mensagem" onClick={() => setMensagemLista("")}>×</button>
        </div>
      )}

      {(temStatus || (filtrosRapidos?.length ?? 0) > 0) && (
        <div className="crud-filtros" aria-label="Filtros rápidos">
          {temStatus && (
            <div className="crud-filtro-grupo">
              <span className="rotulo">Status</span>
              {(["todos", "ativos", "inativos"] as const).map((valor) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={status === valor}
                  onClick={() => setStatus(valor)}
                >
                  {valor === "todos" ? "Todos" : valor === "ativos" ? "Ativos" : "Inativos"}
                </button>
              ))}
            </div>
          )}
          {!!filtrosRapidos?.length && (
            <div className="crud-filtro-grupo">
              <span className="rotulo">Recortes</span>
              <button type="button" aria-pressed={filtroRapido === "todos"} onClick={() => setFiltroRapido("todos")}>Todos</button>
              {filtrosRapidos.map((filtro) => (
                <button
                  key={filtro.valor}
                  type="button"
                  aria-pressed={filtroRapido === filtro.valor}
                  onClick={() => setFiltroRapido(filtro.valor)}
                >
                  {filtro.rotulo}
                </button>
              ))}
            </div>
          )}
          <label className="crud-ordenacao rotulo">
            Ordenar
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar registros">
              <option value="original">Cadastro</option>
              <option value="az">A–Z</option>
              <option value="za">Z–A</option>
            </select>
          </label>
          <span className="crud-filtros-contagem rotulo">{itens.length} {itens.length === 1 ? "visível" : "visíveis"}</span>
        </div>
      )}

      {podeEscrever && temStatus && selecionados.size > 0 && (
        <div className="crud-acoes-massa" role="status">
          <div>
            <strong className="num">{selecionados.size}</strong>
            <span>{selecionados.size === 1 ? "registro selecionado" : "registros selecionados"}</span>
            {selecionados.size !== quantidadeSelecionadaVisivel && (
              <small>Alguns selecionados não estão no filtro atual.</small>
            )}
          </div>
          <div>
            <button type="button" className="btn btn-mini" onClick={() => prepararStatusEmMassa(true)}>
              Ativar selecionados
            </button>
            <button type="button" className="btn btn-mini" onClick={() => prepararStatusEmMassa(false)}>
              Inativar selecionados
            </button>
            <button type="button" className="btn btn-mini btn-fantasma" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      <div className="painel" style={{ overflow: "auto" }}>
        <table className="tabela crud-tabela">
          <thead>
            <tr>
              {temSelecao && (
                <th className="crud-col-selecao">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os registros visíveis"
                    checked={todosVisiveisSelecionados}
                    onChange={alternarTodosVisiveis}
                  />
                </th>
              )}
              {colunas.map((c) => (
                <th key={c.key}>{c.rotulo}</th>
              ))}
              {temAcoes && (
                <th style={{ width: acoesExtra || permitirDuplicar ? 280 : 140, textAlign: "right" }}>Ações</th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={colunas.length + (temAcoes ? 1 : 0) + (temSelecao ? 1 : 0)} style={{ padding: 16 }}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!isLoading && itens.length === 0 && (
              <tr>
                <td colSpan={colunas.length + (temAcoes ? 1 : 0) + (temSelecao ? 1 : 0)} style={{ textAlign: "center", padding: "40px 16px", color: "var(--tinta-3)" }}>
                  {data && data.length > 0 ? (
                    busca ? <>Nada encontrado para “{busca}”.</> : <>Nenhum registro corresponde aos filtros selecionados.</>
                  ) : (
                    <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                      <div style={{ fontSize: 26 }}>📋</div>
                      <div style={{ fontWeight: 700, color: "var(--tinta-2)", maxWidth: 420 }}>
                        {vazio ?? "Nada cadastrado aqui ainda."}
                      </div>
                      {podeEscrever && (
                        <button className="btn btn-primario" onClick={abrirNovo}>
                          {textoNovo}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}
            {itens.map((item) => (
              <tr key={item.id} className={selecionados.has(item.id) ? "crud-linha-selecionada" : undefined}>
                {temSelecao && (
                  <td className="crud-col-selecao" data-label="Selecionar">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${rotuloRegistro?.(item) ?? String(valorDe(item, colunas[0]?.key ?? "id"))}`}
                      checked={selecionados.has(item.id)}
                      onChange={() => alternarSelecao(item.id)}
                    />
                  </td>
                )}
                {colunas.map((c) => (
                  <td key={c.key} data-label={c.rotulo}>
                    {c.render ? c.render(item) : String(valorDe(item, c.key) ?? "")}
                  </td>
                ))}
                {temAcoes && (
                <td data-label="Ações" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {acoesExtra && (
                    <>
                      {acoesExtra(item)}{" "}
                    </>
                  )}
                  {podeEscrever && (
                    <button className="btn btn-mini btn-fantasma" onClick={() => abrirEdicao(item)}>
                      Editar
                    </button>
                  )}{" "}
                  {podeEscrever && permitirDuplicar && (
                    <>
                      <button className="btn btn-mini btn-fantasma" onClick={() => abrirDuplicacao(item)}>
                        Duplicar
                      </button>{" "}
                    </>
                  )}
                  {podeEscrever && (
                    <button
                      className="btn btn-mini btn-fantasma"
                      style={{ color: "var(--vermelho)" }}
                      onClick={() => { setErroExclusao(""); setExcluindo(item); }}
                    >
                      Excluir
                    </button>
                  )}
                </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        titulo={editando ? `Editar — ${titulo}` : `Novo — ${titulo}`}
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        larguraMax={campos.length > 10 ? 820 : 640}
      >
        {!editando && rascunhoRetomado && (
          <div className="rascunho-retomado" role="status">
            <span>
              <strong>Rascunho retomado.</strong> Continue de onde parou.
            </span>
            <button
              type="button"
              className="btn btn-mini btn-fantasma"
              onClick={() => {
                if (chaveRascunho)
                  sessionStorage.removeItem(`orkestria:rascunho:${chaveRascunho}`);
                pularProximaPersistencia.current = true;
                setForm(criarFormInicial());
                setRascunhoRetomado(false);
              }}
            >
              Descartar
            </button>
          </div>
        )}
        {!editando && temCamposAvancados && (
          <div className="crud-modo-rapido">
            <div>
              <span className="rotulo">Modo rápido</span>
              <strong>
                {mostrarAvancados ? "Todas as opções visíveis" : "Só o necessário para começar"}
              </strong>
              <small>
                Os padrões seguros já estão preenchidos. Ajuste os detalhes agora ou depois.
              </small>
            </div>
            <button
              type="button"
              className="btn btn-mini btn-fantasma"
              aria-expanded={mostrarAvancados}
              onClick={() => setMostrarAvancados((atual) => !atual)}
            >
              {mostrarAvancados ? "Ocultar opções" : "Mais opções"}
            </button>
          </div>
        )}
        <form ref={formRef} onSubmit={salvar} className="form-grade">
          {campos.map((c, indice) => {
            if (c.mostrarSe && !c.mostrarSe(form)) return null;
            if (c.avancado && !mostrarAvancados) return null;
            const anteriorVisivel = campos
              .slice(0, indice)
              .reverse()
              .find(
                (anterior) =>
                  (!anterior.mostrarSe || anterior.mostrarSe(form)) &&
                  (!anterior.avancado || mostrarAvancados),
              );
            const iniciaSecao = Boolean(c.secao && anteriorVisivel?.secao !== c.secao);
            return (
            <div key={c.key} style={{ display: "contents" }}>
            {iniciaSecao && (
              <div className="crud-secao-form">
                <strong>{c.secao}</strong>
                {c.descricaoSecao && <span>{c.descricaoSecao}</span>}
              </div>
            )}
            <label
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
                  disabled={c.automaticoSeUnico && c.opcoes?.length === 1}
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
              ) : c.tipo === "multiselect" ? (
                <span style={{ display: "flex", gap: 6, paddingTop: 4, flexWrap: "wrap" }}>
                  {(c.opcoes ?? []).length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>Nenhuma opção disponível.</span>
                  )}
                  {(c.opcoes ?? []).map((o) => {
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
              {c.ajuda && (
                <span style={{ fontSize: 11, color: "var(--tinta-3)" }}>{c.ajuda}</span>
              )}
              {c.acaoAuxiliar && (
                <button
                  type="button"
                  className="crud-acao-campo"
                  onClick={() =>
                    c.acaoAuxiliar?.executar((valor) =>
                      setForm((atual) => {
                        if (c.tipo !== "multiselect") return { ...atual, [c.key]: valor };
                        const existentes = String(atual[c.key] ?? "").split(",").filter(Boolean);
                        return {
                          ...atual,
                          [c.key]: existentes.includes(valor) ? existentes.join(",") : [...existentes, valor].join(","),
                        };
                      }),
                    )
                  }
                >
                  ＋ {c.acaoAuxiliar.rotulo}
                </button>
              )}
            </label>
            </div>
          );})}

          {erro && (
            <div className="alerta alerta-erro" style={{ gridColumn: "1 / -1" }}>
              {erro}
            </div>
          )}

          {sucesso && (
            <div className="alerta alerta-ok" role="status" style={{ gridColumn: "1 / -1" }}>
              {sucesso}
            </div>
          )}

          {salvando ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <Carregando texto="Salvando…" style={{ padding: 8 }} />
            </div>
          ) : (
            <div className="crud-acoes-form">
              <button type="button" className="btn" onClick={() => setAberto(false)}>
                Cancelar
              </button>
              {!editando && (
                <button type="submit" className="btn" data-continuar="true">
                  Salvar e adicionar outro
                </button>
              )}
              <button type="submit" className="btn btn-primario">
                Salvar
              </button>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        titulo={`${statusEmMassa ? "Ativar" : "Inativar"} registros`}
        aberto={statusEmMassa !== null}
        aoFechar={() => !processandoMassa && setStatusEmMassa(null)}
        larguraMax={500}
      >
        <div className="crud-confirmacao-massa">
          <span className="crud-confirmacao-sinal" aria-hidden="true">
            {statusEmMassa ? "↑" : "↓"}
          </span>
          <div>
            <p>
              Você vai <strong>{statusEmMassa ? "ativar" : "inativar"}</strong>{" "}
              {itensSelecionados.length} {itensSelecionados.length === 1 ? "registro" : "registros"}.
            </p>
            <small>
              O sistema aplicará as mesmas validações da edição individual e registrará cada mudança no histórico.
            </small>
          </div>
        </div>
        {processandoMassa && (
          <div className="crud-progresso-massa" role="status">
            <div>
              <span
                style={{
                  width: `${itensSelecionados.length > 0 ? (progressoMassa / itensSelecionados.length) * 100 : 0}%`,
                }}
              />
            </div>
            <small>
              Atualizando {progressoMassa} de {itensSelecionados.length}…
            </small>
          </div>
        )}
        {erroMassa && <div className="alerta alerta-erro" style={{ marginTop: 14 }}>{erroMassa}</div>}
        <div className="crud-confirmacao-acoes">
          <button type="button" className="btn" disabled={processandoMassa} onClick={() => setStatusEmMassa(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className={statusEmMassa ? "btn btn-primario" : "btn btn-perigo"}
            disabled={processandoMassa || itensSelecionados.length === 0}
            onClick={aplicarStatusEmMassa}
          >
            {processandoMassa
              ? "Atualizando…"
              : `${statusEmMassa ? "Ativar" : "Inativar"} ${itensSelecionados.length}`}
          </button>
        </div>
      </Modal>

      <Modal
        titulo="Confirmar exclusão"
        aberto={!!excluindo}
        aoFechar={() => !exclusaoEmAndamento && setExcluindo(null)}
        larguraMax={480}
      >
        <div className="crud-confirmacao-exclusao">
          <div className="crud-confirmacao-sinal" aria-hidden="true">!</div>
          <div>
            <p>Você está prestes a excluir definitivamente:</p>
            <strong>
              {excluindo
                ? rotuloRegistro?.(excluindo) ?? String(valorDe(excluindo, colunas[0]?.key ?? "id"))
                : ""}
            </strong>
            <small>
              Se este registro estiver sendo usado por outro cadastro, o sistema poderá bloquear a exclusão e explicar o vínculo.
            </small>
          </div>
        </div>
        {erroExclusao && <div className="alerta alerta-erro" style={{ marginTop: 14 }}>{erroExclusao}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button type="button" className="btn" disabled={exclusaoEmAndamento} onClick={() => setExcluindo(null)}>
            Manter registro
          </button>
          <button type="button" className="btn btn-perigo" disabled={exclusaoEmAndamento} onClick={confirmarExclusao}>
            {exclusaoEmAndamento ? "Excluindo…" : "Excluir definitivamente"}
          </button>
        </div>
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
