"use client";

/** Lado esquerdo da tela de rotina: tarefas disponíveis para arrastar. */
import { useEffect, useMemo, useState } from "react";
import { useSessao } from "@/components/SessaoContext";
import { tempoPrevistoMin, blocosOcupados } from "@/lib/calculations";
import { formatarDuracao } from "@/lib/dateUtils";
import {
  atualizarPreferenciasOperacionais,
  chavePreferenciasOperacionais,
  lerPreferenciasOperacionais,
} from "@/lib/preferenciasOperacionais";
import { sugerirPorHabilitacao } from "@/lib/validations";
import type {
  Categoria,
  Funcionario,
  Local,
  NivelQualificacao,
  QualificacaoFuncionario,
  Requisito,
  Tarefa,
} from "@/types";

/** Constante de módulo: um Set novo por render invalidaria a memoização. */
const SEM_AUSENTES: { has(id: string): boolean } = { has: () => false };

const COR_PRIORIDADE: Record<string, string> = {
  alta: "var(--vermelho)",
  media: "var(--amarelo)",
  baixa: "var(--cinza-bloco)",
};

export default function TaskPalette({
  tarefas,
  locais,
  categorias = [],
  blocoMin,
  funcionarios = [],
  qualificacoes = [],
  requisitos = [],
  data = "",
  ausentes = SEM_AUSENTES,
  tarefaSelecionadaId,
  aoSelecionarTarefa,
  podeCriar = false,
  aoCriarTarefa,
  aoIniciarArrasto,
  aoTerminarArrasto,
}: {
  tarefas: Tarefa[];
  locais: Local[];
  categorias?: Categoria[];
  blocoMin: number;
  /** Para sugerir quem chamar nas tarefas que exigem requisito (ata 17/07). */
  funcionarios?: Funcionario[];
  qualificacoes?: QualificacaoFuncionario[];
  requisitos?: Requisito[];
  data?: string;
  /**
   * Quem está ausente no dia (férias/atestado/folga) — fora das sugestões.
   * Aceita Set ou Map (a agenda já tem um Map id→motivo, de referência estável;
   * criar um Set novo a cada render invalidaria a memoização).
   */
  ausentes?: { has(id: string): boolean };
  /** Modo rápido: seleciona uma tarefa para aplicá-la clicando na grade. */
  tarefaSelecionadaId?: string | null;
  aoSelecionarTarefa?: (tarefaId: string) => void;
  /** Cadastro contextual: cria sem abandonar a agenda e já ativa o carimbo. */
  podeCriar?: boolean;
  aoCriarTarefa?: () => void;
  /** Informa quantos blocos o item arrastado ocupa (para o fantasma da agenda). */
  aoIniciarArrasto?: (blocos: number) => void;
  aoTerminarArrasto?: () => void;
}) {
  const sessao = useSessao();
  const [busca, setBusca] = useState("");
  const [filtroAndar, setFiltroAndar] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [filtroUso, setFiltroUso] = useState<"todas" | "favoritas" | "recentes">("todas");
  const [favoritas, setFavoritas] = useState<string[]>([]);
  const [recentes, setRecentes] = useState<string[]>([]);

  const sedeDaPaleta = tarefas[0]?.sede_id ?? locais[0]?.sede_id ?? sessao.sede_id;
  const chavePreferencias = useMemo(
    () => chavePreferenciasOperacionais(sessao.id, sedeDaPaleta),
    [sessao.id, sedeDaPaleta],
  );

  useEffect(() => {
    const salvas = lerPreferenciasOperacionais(chavePreferencias);
    setFavoritas(salvas.favoritas);
    setRecentes(salvas.recentes);
  }, [chavePreferencias]);

  function alternarFavorita(tarefaId: string) {
    setFavoritas((atuais) => {
      const proximas = atuais.includes(tarefaId)
        ? atuais.filter((id) => id !== tarefaId)
        : [tarefaId, ...atuais].slice(0, 50);
      atualizarPreferenciasOperacionais(chavePreferencias, { favoritas: proximas });
      return proximas;
    });
  }

  function registrarRecente(tarefaId: string) {
    setRecentes((atuais) => {
      const proximas = [tarefaId, ...atuais.filter((id) => id !== tarefaId)].slice(0, 8);
      atualizarPreferenciasOperacionais(chavePreferencias, { recentes: proximas });
      return proximas;
    });
  }

  const localPorId = useMemo(
    () => new Map(locais.map((l) => [l.id, l])),
    [locais],
  );
  const categoriaPorId = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias],
  );

  const andares = useMemo(
    () => [...new Set(locais.map((l) => l.andar).filter(Boolean))].sort(),
    [locais],
  );
  // categorias efetivamente usadas por alguma tarefa, na ordem do catálogo
  const categoriasUsadas = useMemo(() => {
    const ids = new Set(tarefas.map((t) => t.categoria_id).filter(Boolean));
    return categorias.filter((c) => ids.has(c.id));
  }, [tarefas, categorias]);

  const quantidadeFavoritas = useMemo(
    () => tarefas.filter((tarefa) => tarefa.ativo && favoritas.includes(tarefa.id)).length,
    [tarefas, favoritas],
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = tarefas.filter((t) => {
      if (!t.ativo) return false;
      if (filtroUso === "favoritas" && !favoritas.includes(t.id)) return false;
      if (filtroUso === "recentes" && !recentes.includes(t.id)) return false;
      const local = localPorId.get(t.local_id);
      if (filtroAndar && local?.andar !== filtroAndar) return false;
      if (filtroCategoria && t.categoria_id !== filtroCategoria) return false;
      if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false;
      if (q) {
        const texto = `${t.nome_tarefa} ${local?.nome_local ?? ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
    if (filtroUso === "recentes") {
      return filtradas.sort((a, b) => recentes.indexOf(a.id) - recentes.indexOf(b.id));
    }
    if (filtroUso === "favoritas") {
      return filtradas.sort((a, b) => favoritas.indexOf(a.id) - favoritas.indexOf(b.id));
    }
    return filtradas;
  }, [tarefas, localPorId, busca, filtroAndar, filtroCategoria, filtroPrioridade, filtroUso, favoritas, recentes]);

  // Quem chamar primeiro nas tarefas que exigem requisito (ata 17/07). O nível
  // só ORDENA a lista — quem decide se pode é o bloqueio, na hora de alocar.
  // Depende de `tarefas` (não de `visiveis`): a sugestão não muda com busca/
  // filtro, e recalcular a cada tecla digitada travaria a paleta.
  const sugeridosPorTarefa = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string; nivel: NivelQualificacao }[]>();
    if (!data || !funcionarios.length || !requisitos.length) return mapa;
    // Ausente no dia não é sugestão útil — a alocação recusaria.
    const elegiveis = funcionarios.filter((f) => f.ativo && !ausentes.has(f.id));
    for (const t of tarefas) {
      if (!t.requisitos) continue;
      const s = sugerirPorHabilitacao({
        tarefa: t,
        funcionarios: elegiveis,
        qualificacoes,
        requisitosCatalogo: requisitos,
        data,
      });
      if (s.length)
        mapa.set(
          t.id,
          s.slice(0, 3).map((x) => ({ id: x.funcionario.id, nome: x.funcionario.nome, nivel: x.nivel })),
        );
    }
    return mapa;
  }, [tarefas, funcionarios, qualificacoes, requisitos, data, ausentes]);

  return (
    <aside className="painel entra paleta-tarefas">
      <div className="painel-cabecalho" style={{ padding: "10px 12px" }}>
        <span className="rotulo">Tarefas · clique ou arraste</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="selo selo-cinza num">{visiveis.length}</span>
          {podeCriar && (
            <button
              type="button"
              className="btn btn-mini btn-primario"
              onClick={aoCriarTarefa}
              title="Cadastrar uma tarefa sem sair da Agenda"
            >
              ＋ Criar
            </button>
          )}
        </span>
      </div>

      <div style={{ padding: 10, display: "grid", gap: 6, borderBottom: "1px solid var(--linha)" }}>
        <input
          placeholder="Buscar tarefa/local…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ padding: "6px 8px", border: "1.5px solid var(--tinta)", borderRadius: 3, background: "var(--cartao)", fontSize: 13, width: "100%", boxSizing: "border-box" }}
        />
        <div className="paleta-filtros-uso" aria-label="Atalhos de tarefas">
          <button
            type="button"
            className={filtroUso === "todas" ? "ativo" : ""}
            aria-pressed={filtroUso === "todas"}
            onClick={() => setFiltroUso("todas")}
          >
            Todas
          </button>
          <button
            type="button"
            className={filtroUso === "favoritas" ? "ativo" : ""}
            aria-pressed={filtroUso === "favoritas"}
            onClick={() => setFiltroUso("favoritas")}
            title="Tarefas que você marcou para acesso rápido"
          >
            ★ Favoritas <span className="num">{quantidadeFavoritas}</span>
          </button>
          <button
            type="button"
            className={filtroUso === "recentes" ? "ativo" : ""}
            aria-pressed={filtroUso === "recentes"}
            onClick={() => setFiltroUso("recentes")}
            title="Últimas tarefas usadas por você nesta sede"
          >
            ↻ Recentes
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
          <select value={filtroAndar} onChange={(e) => setFiltroAndar(e.target.value)} style={{ fontSize: 12, padding: 4, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            <option value="">Andar: todos</option>
            {andares.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ fontSize: 12, padding: 4, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            <option value="">Categoria: todas</option>
            {categoriasUsadas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <select
            value={filtroPrioridade}
            onChange={(e) => setFiltroPrioridade(e.target.value)}
            style={{ fontSize: 12, padding: 4, gridColumn: "1 / -1", width: "100%", minWidth: 0, boxSizing: "border-box" }}
          >
            <option value="">Prioridade: todas</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: 10, display: "grid", gap: 8 }}>
        {visiveis.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--tinta-3)", textAlign: "center", padding: 12 }}>
            {filtroUso === "favoritas" && quantidadeFavoritas === 0
              ? "Nenhuma favorita ainda. Use a estrela de uma tarefa para fixá-la aqui."
              : filtroUso === "recentes" && recentes.length === 0
                ? "Use uma tarefa por clique ou arraste e ela ficará disponível aqui."
                : "Nenhuma tarefa para os filtros atuais."}
          </p>
        )}
        {visiveis.map((t) => {
          const local = localPorId.get(t.local_id);
          const previsto = tempoPrevistoMin(t, local);
          const blocos = blocosOcupados(previsto, blocoMin);
          const selecionada = tarefaSelecionadaId === t.id;
          const favorita = favoritas.includes(t.id);
          return (
            <div
              key={t.id}
              className={`agenda-card-tarefa${selecionada ? " tarefa-selecionada" : ""}${favorita ? " tarefa-favorita" : ""}`}
              draggable
              role="button"
              tabIndex={0}
              aria-pressed={selecionada}
              aria-label={`${selecionada ? "Tarefa selecionada" : "Selecionar tarefa"}: ${t.nome_tarefa}`}
              onClick={() => {
                registrarRecente(t.id);
                aoSelecionarTarefa?.(t.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  registrarRecente(t.id);
                  aoSelecionarTarefa?.(t.id);
                }
              }}
              onDragStart={(e) => {
                registrarRecente(t.id);
                e.dataTransfer.setData(
                  "text/plain",
                  JSON.stringify({ tipo: "nova", tarefa_id: t.id }),
                );
                e.dataTransfer.effectAllowed = "copy";
                aoIniciarArrasto?.(blocos);
              }}
              onDragEnd={() => aoTerminarArrasto?.()}
              style={{ background: "var(--cartao)", padding: "8px 10px", borderLeft: `5px solid ${selecionada ? "var(--acento)" : COR_PRIORIDADE[t.prioridade] ?? "var(--cinza-bloco)"}` }}
              title="Clique para usar no modo rápido ou arraste para a agenda"
            >
              <button
                type="button"
                className={`paleta-favorito${favorita ? " ativo" : ""}`}
                aria-label={favorita ? `Remover ${t.nome_tarefa} das favoritas` : `Adicionar ${t.nome_tarefa} às favoritas`}
                aria-pressed={favorita}
                title={favorita ? "Remover das favoritas" : "Fixar nas favoritas"}
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation();
                  alternarFavorita(t.id);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {favorita ? "★" : "☆"}
              </button>
              <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25, paddingRight: 24 }}>
                {t.nome_tarefa}
                {t.restricao_genero && (
                  <span
                    title={`Restrita a ASG ${t.restricao_genero === "feminino" ? "mulheres" : "homens"}`}
                    style={{ marginLeft: 5, color: t.restricao_genero === "feminino" ? "var(--vermelho)" : "var(--azul)", fontWeight: 700 }}
                  >
                    {t.restricao_genero === "feminino" ? "♀" : "♂"}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--tinta-2)", marginTop: 2 }}>
                {local ? `${local.nome_local} · ${local.andar}` : "local?"}
              </div>
              {(() => {
                const cat = categoriaPorId.get(t.categoria_id ?? "");
                if (!cat) return null;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.cor || "var(--tinta-3)", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "var(--tinta-3)", textTransform: "uppercase", letterSpacing: 0.3 }}>
                      {cat.nome}
                    </span>
                  </div>
                );
              })()}
              {(() => {
                const sug = sugeridosPorTarefa.get(t.id);
                if (!sug?.length) return null;
                return (
                  <div
                    style={{ fontSize: 10, color: "var(--tinta-3)", marginTop: 4, lineHeight: 1.3 }}
                    title="Quem já tem a habilitação exigida por esta tarefa, ordenado pelo degrau de habilitação. É só uma sugestão — qualquer pessoa habilitada pode receber a tarefa."
                  >
                    ★ Habilitados:{" "}
                    {sug.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ", "}
                        {s.nome}
                        {s.nivel !== "apto" && (
                          <span style={{ opacity: 0.75 }}>
                            {" "}
                            ({s.nivel === "referencia" ? "referência" : "experiente"})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })()}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, alignItems: "center" }}>
                <span className="num" style={{ fontSize: 11, fontWeight: 700 }}>
                  {formatarDuracao(previsto)}
                </span>
                <span className="rotulo" style={{ fontSize: 9 }}>
                  {selecionada ? "✓ clique na grade" : `${blocos} bloco${blocos > 1 ? "s" : ""} · ⠿`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
