"use client";

/** Lado esquerdo da tela de rotina: tarefas disponíveis para arrastar. */
import { useMemo, useState } from "react";
import { tempoPrevistoMin, blocosOcupados } from "@/lib/calculations";
import { formatarDuracao } from "@/lib/dateUtils";
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
  fatorDoTipo,
  funcionarios = [],
  qualificacoes = [],
  requisitos = [],
  data = "",
  ausentes = SEM_AUSENTES,
  aoIniciarArrasto,
  aoTerminarArrasto,
}: {
  tarefas: Tarefa[];
  locais: Local[];
  categorias?: Categoria[];
  blocoMin: number;
  /** Fator de intensidade por tipo de local, do catálogo. */
  fatorDoTipo?: ReadonlyMap<string, number>;
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
  /** Informa quantos blocos o item arrastado ocupa (para o fantasma da agenda). */
  aoIniciarArrasto?: (blocos: number) => void;
  aoTerminarArrasto?: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtroAndar, setFiltroAndar] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");

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

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tarefas.filter((t) => {
      if (!t.ativo) return false;
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
  }, [tarefas, localPorId, busca, filtroAndar, filtroCategoria, filtroPrioridade]);

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
    <aside className="painel entra paleta-tarefas" data-tour="paleta-tarefas">
      <div className="painel-cabecalho" style={{ padding: "10px 12px" }}>
        <span className="rotulo">Tarefas disponíveis</span>
        <span className="selo selo-cinza num">{visiveis.length}</span>
      </div>

      <div style={{ padding: 10, display: "grid", gap: 6, borderBottom: "1px solid var(--linha)" }}>
        <input
          placeholder="Buscar tarefa/local…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ padding: "6px 8px", border: "1.5px solid var(--tinta)", borderRadius: 3, background: "var(--cartao)", fontSize: 13, width: "100%", boxSizing: "border-box" }}
        />
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
            Nenhuma tarefa para os filtros atuais.
          </p>
        )}
        {visiveis.map((t) => {
          const local = localPorId.get(t.local_id);
          const previsto = tempoPrevistoMin(t, local, fatorDoTipo);
          const blocos = blocosOcupados(previsto, blocoMin);
          return (
            <div
              key={t.id}
              className="agenda-card-tarefa"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "text/plain",
                  JSON.stringify({ tipo: "nova", tarefa_id: t.id }),
                );
                e.dataTransfer.effectAllowed = "copy";
                aoIniciarArrasto?.(blocos);
              }}
              onDragEnd={() => aoTerminarArrasto?.()}
              style={{ background: "var(--cartao)", padding: "8px 10px", borderLeft: `5px solid ${COR_PRIORIDADE[t.prioridade] ?? "var(--cinza-bloco)"}` }}
              title="Arraste para a agenda de um funcionário"
            >
              <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25 }}>
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
                  {blocos} bloco{blocos > 1 ? "s" : ""} · ⠿
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
