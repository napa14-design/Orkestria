"use client";

/**
 * Centro da tela de rotina: colunas por funcionário, linhas por bloco de
 * horário. Aceita soltar tarefas novas (paleta) e mover cards existentes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { intervalosDoFuncionario, jornadaLiquidaMin } from "@/lib/calculations";
import { formatarDuracao, hhmmParaMin, minParaHHMM } from "@/lib/dateUtils";
import { agruparRuns, type Run } from "@/lib/agenda";
import type { Categoria, Funcionario, Local, RotinaPlanejada, StatusRotina, Tarefa } from "@/types";
import CardRotina from "./CardRotina";
import BalaoDetalhe from "./BalaoDetalhe";

export const ALTURA_BLOCO_PADRAO = 48; // px por bloco na densidade normal (mais respiro p/ tarefas curtas)

/**
 * Estilo do cartão por status. A direção "Partitura": cartão de papel (marfim),
 * texto em tinta, e uma "espinha" colorida à esquerda. Em `planejada` (o normal)
 * a espinha é a cor da CATEGORIA da tarefa; nas exceções (realizada/não/…) o
 * cartão ganha um tom suave e a espinha vira a cor do status.
 */
const ESTILO_STATUS: Record<StatusRotina, { fundo: string; espinha?: string; selo?: string }> = {
  planejada: { fundo: "var(--cartao)" },
  realizada: { fundo: "#e9f2ec", espinha: "var(--verde)", selo: "✓ feita" },
  nao_realizada: { fundo: "#fbe9e6", espinha: "var(--vermelho)", selo: "não feita" },
  remanejada: { fundo: "#fdf1e3", espinha: "var(--laranja)", selo: "remanejada" },
  pendente: { fundo: "#fdf1e3", espinha: "var(--laranja)" },
  cancelada: { fundo: "var(--papel-2)", espinha: "var(--tinta-3)" },
};

interface DadosArrasto {
  tipo: "nova" | "mover";
  tarefa_id?: string;
  rotina_id?: string;
}

export default function AgendaGrid({
  funcionarios,
  rotinas,
  tarefas,
  locais,
  categorias,
  blocoMin,
  funcionarioSelecionado,
  ausencias,
  aoSelecionarFuncionario,
  aoSoltarNova,
  aoMover,
  aoRemover,
  aoRedimensionar,
  blocosArrasto,
  aoIniciarArrasto,
  aoTerminarArrasto,
  alturaBloco = ALTURA_BLOCO_PADRAO,
}: {
  funcionarios: Funcionario[];
  rotinas: RotinaPlanejada[];
  tarefas: Tarefa[];
  locais: Local[];
  categorias: Categoria[];
  blocoMin: number;
  funcionarioSelecionado: string | null;
  /** funcionario_id → rótulo da ausência (ex.: "Atestado"). */
  ausencias?: Map<string, string>;
  aoSelecionarFuncionario: (id: string) => void;
  aoSoltarNova: (tarefaId: string, funcionarioId: string, inicio: string) => void;
  aoMover: (rotinaId: string, funcionarioId: string, inicio: string) => void;
  aoRemover: (rotinaId: string) => void;
  /** Redimensionamento pela alça inferior do card (novo tempo em minutos). */
  aoRedimensionar?: (rotinaId: string, novoTempoMin: number) => void;
  /** Blocos do item sendo arrastado (paleta ou card) — dimensiona o fantasma. */
  blocosArrasto?: number | null;
  aoIniciarArrasto?: (blocos: number) => void;
  aoTerminarArrasto?: () => void;
  /** Altura de cada bloco em px (densidade da grade). */
  alturaBloco?: number;
}) {
  // Altura efetiva do bloco — todas as contas internas usam este valor.
  const ALTURA_BLOCO = alturaBloco;
  // Fantasma de drop: célula(s) exatas onde a tarefa cairá se for solta.
  const [previa, setPrevia] = useState<{ funcionarioId: string; slot: number } | null>(null);

  // Balãozinho de detalhes (clique no card): guarda o run e a âncora; o
  // BalaoDetalhe deriva o que exibe das entidades resolvidas.
  const [detalhe, setDetalhe] = useState<{ run: Run; x: number; y: number } | null>(null);
  const removerRun = (run: Run) => run.membros.forEach((m) => aoRemover(m.id));

  // ── redimensionamento por arrasto da alça inferior ────────────────────
  interface EstadoResize {
    rotinaId: string;
    blocosOrig: number;
    yInicial: number;
    blocos: number;
  }
  const [resize, setResize] = useState<EstadoResize | null>(null);
  const resizeRef = useRef<EstadoResize | null>(null);
  resizeRef.current = resize;

  useEffect(() => {
    if (!resize) return;
    const aoMoverPonteiro = (e: PointerEvent) => {
      setResize((r) => {
        if (!r) return r;
        const delta = Math.round((e.clientY - r.yInicial) / ALTURA_BLOCO);
        return { ...r, blocos: Math.max(1, r.blocosOrig + delta) };
      });
    };
    const aoSoltarPonteiro = () => {
      const r = resizeRef.current;
      if (r && r.blocos !== r.blocosOrig) {
        aoRedimensionar?.(r.rotinaId, r.blocos * blocoMin);
      }
      setResize(null);
    };
    window.addEventListener("pointermove", aoMoverPonteiro);
    window.addEventListener("pointerup", aoSoltarPonteiro);
    return () => {
      window.removeEventListener("pointermove", aoMoverPonteiro);
      window.removeEventListener("pointerup", aoSoltarPonteiro);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize !== null]);

  const tarefaPorId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);
  const localPorId = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);
  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  // Janela de horário da grade: do menor início ao maior fim entre os exibidos.
  const [inicioGrade, fimGrade] = useMemo(() => {
    let ini = Infinity;
    let fim = -Infinity;
    for (const f of funcionarios) {
      const e = hhmmParaMin(f.entrada);
      const s = hhmmParaMin(f.saida);
      if (!Number.isNaN(e)) ini = Math.min(ini, e);
      if (!Number.isNaN(s)) fim = Math.max(fim, s);
    }
    // Tarefas podem terminar (e às vezes começar) fora do expediente — a regra é
    // "pode terminar depois da saída". Estende a grade até englobar a última
    // tarefa, senão o card que passa do turno fica cortado embaixo.
    for (const r of rotinas) {
      const e = hhmmParaMin(r.inicio_planejado);
      const s = hhmmParaMin(r.fim_planejado);
      if (!Number.isNaN(e)) ini = Math.min(ini, e);
      if (!Number.isNaN(s)) fim = Math.max(fim, s);
    }
    if (!Number.isFinite(ini) || !Number.isFinite(fim)) return [360, 1080]; // 06:00–18:00
    return [ini, fim];
  }, [funcionarios, rotinas]);

  const totalBlocos = Math.max(1, Math.ceil((fimGrade - inicioGrade) / blocoMin));
  const slots = useMemo(
    () => Array.from({ length: totalBlocos }, (_, i) => inicioGrade + i * blocoMin),
    [totalBlocos, inicioGrade, blocoMin],
  );

  function lerArrasto(e: React.DragEvent): DadosArrasto | null {
    try {
      return JSON.parse(e.dataTransfer.getData("text/plain")) as DadosArrasto;
    } catch {
      return null;
    }
  }

  function slotDoEvento(e: React.DragEvent, alvo: HTMLElement): number {
    const rect = alvo.getBoundingClientRect();
    const y = e.clientY - rect.top + alvo.scrollTop;
    return Math.min(totalBlocos - 1, Math.max(0, Math.floor(y / ALTURA_BLOCO)));
  }

  if (funcionarios.length === 0) {
    return (
      <div className="painel" style={{ flex: 1, padding: 48, textAlign: "center", color: "var(--tinta-3)" }}>
        Nenhum funcionário ativo para a sede/turno selecionados.
        <br />
        Cadastre funcionários ou ajuste os filtros acima.
      </div>
    );
  }

  return (
    <div className="painel entra-2" style={{ flex: 1, overflow: "auto", maxHeight: "calc(100vh - 160px)" }}>
      <div style={{ display: "flex", minWidth: funcionarios.length * 190 + 64 }}>
        {/* régua de horários — fica fixa na rolagem horizontal (as colunas dos
            funcionários passam POR BAIXO dela, por isso z-index > 12 e fundo
            opaco nas células). */}
        <div
          style={{
            width: 64,
            flexShrink: 0,
            borderRight: "2px solid var(--tinta)",
            position: "sticky",
            left: 0,
            zIndex: 13,
          }}
        >
          <div
            style={{
              height: 56,
              borderBottom: "2px solid var(--tinta)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--papel-2)",
              position: "sticky",
              top: 0,
              zIndex: 12,
            }}
          >
            <span className="rotulo">Hora</span>
          </div>
          {slots.map((min) => (
            <div
              key={min}
              className="num"
              style={{
                height: ALTURA_BLOCO,
                fontSize: 11,
                color: "var(--tinta-2)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                paddingTop: 2,
                borderBottom: "1px solid var(--linha)",
                borderTop: min % 60 === 0 ? "1px solid var(--tinta-3)" : undefined,
                background: "var(--papel-2)",
              }}
            >
              {min % 60 === 0 ? (
                <strong>{minParaHHMM(min)}</strong>
              ) : min % 30 === 0 ? (
                <span style={{ color: "var(--tinta-3)" }}>{minParaHHMM(min)}</span>
              ) : (
                ""
              )}
            </div>
          ))}
        </div>

        {/* colunas dos funcionários */}
        {funcionarios.map((f, idxCol) => {
          const runs = agruparRuns(rotinas.filter((r) => r.funcionario_id === f.id));
          const entradaF = hhmmParaMin(f.entrada);
          const saidaF = hhmmParaMin(f.saida);
          // Todos os intervalos do dia (lanches + almoço) em minutos.
          const intervalosF = intervalosDoFuncionario(f)
            .map((iv) => ({ ini: hhmmParaMin(iv.inicio), fim: hhmmParaMin(iv.fim) }))
            .filter((iv) => !Number.isNaN(iv.ini) && !Number.isNaN(iv.fim));
          const selecionado = funcionarioSelecionado === f.id;
          const motivoAusencia = ausencias?.get(f.id);

          // Ociosidade: lacunas DENTRO do expediente não ocupadas por tarefa nem
          // pausa. Subtrai os blocos ocupados de [entrada, saída] (mescla antes).
          const ociosos: Array<[number, number]> = [];
          if (!motivoAusencia && !Number.isNaN(entradaF) && !Number.isNaN(saidaF)) {
            const ocupados = [
              ...runs.map((r) => [hhmmParaMin(r.inicio), hhmmParaMin(r.fim)] as [number, number]),
              ...intervalosF.map((iv) => [iv.ini, iv.fim] as [number, number]),
            ]
              .map(([a, b]) => [Math.max(a, entradaF), Math.min(b, saidaF)] as [number, number])
              .filter(([a, b]) => b > a)
              .sort((x, y) => x[0] - y[0]);
            let cursor = entradaF;
            for (const [a, b] of ocupados) {
              if (a > cursor) ociosos.push([cursor, a]);
              cursor = Math.max(cursor, b);
            }
            if (cursor < saidaF) ociosos.push([cursor, saidaF]);
          }

          return (
            <div
              key={f.id}
              className="col-agenda"
              style={
                {
                  width: 190,
                  flexShrink: 0,
                  borderRight: "1px solid var(--linha)",
                  "--d": `${Math.min(idxCol, 8) * 0.05}s`,
                } as React.CSSProperties
              }
            >
              {/* cabeçalho da coluna */}
              <button
                onClick={() => aoSelecionarFuncionario(f.id)}
                style={{
                  width: "100%",
                  height: 56,
                  border: "none",
                  borderBottom: "2px solid var(--tinta)",
                  background: selecionado ? "var(--tinta)" : "var(--papel-2)",
                  color: selecionado ? "var(--papel)" : "var(--tinta)",
                  textAlign: "left",
                  padding: "6px 10px",
                  position: "sticky",
                  top: 0,
                  zIndex: 12,
                  cursor: "pointer",
                }}
                title={`${f.nome} — ${f.entrada}–${f.saida}. Clique para ver ocupação e ociosidade no painel lateral.`}
              >
                <div style={{ fontFamily: "var(--fonte-display)", fontWeight: 700, fontSize: 13, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.nome}
                </div>
                {motivoAusencia ? (
                  <span className="selo selo-vermelho" style={{ fontSize: 8 }}>
                    Ausente · {motivoAusencia}
                  </span>
                ) : (
                  <div className="num" style={{ fontSize: 10, opacity: 0.75 }}>
                    {f.entrada}–{f.saida} · líq. {formatarDuracao(jornadaLiquidaMin(f))}
                  </div>
                )}
              </button>

              {/* corpo da coluna (zona de drop) */}
              <div
                style={{ position: "relative", height: totalBlocos * ALTURA_BLOCO }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const slot = slotDoEvento(e, e.currentTarget);
                  setPrevia((p) =>
                    p?.funcionarioId === f.id && p.slot === slot
                      ? p
                      : { funcionarioId: f.id, slot },
                  );
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setPrevia(null);
                  aoTerminarArrasto?.();
                  const dados = lerArrasto(e);
                  if (!dados) return;
                  const slot = slotDoEvento(e, e.currentTarget);
                  const inicio = minParaHHMM(inicioGrade + slot * blocoMin);
                  if (dados.tipo === "nova" && dados.tarefa_id)
                    aoSoltarNova(dados.tarefa_id, f.id, inicio);
                  else if (dados.tipo === "mover" && dados.rotina_id)
                    aoMover(dados.rotina_id, f.id, inicio);
                }}
              >
                {/* células de fundo (só marcam fora-da-jornada; as pausas são
                    faixas absolutas por minuto exato, abaixo) */}
                {slots.map((min) => {
                  const foraJornada =
                    Number.isNaN(entradaF) || min < entradaF || min + blocoMin > saidaF;
                  return (
                    <div
                      key={min}
                      className={foraJornada ? "celula-fora-jornada" : undefined}
                      style={{
                        height: ALTURA_BLOCO,
                        borderBottom: "1px solid var(--linha)",
                        borderTop: min % 60 === 0 ? "1px solid var(--tinta-3)" : undefined,
                      }}
                    />
                  );
                })}

                {/* ociosidade: lacunas livres no expediente (verde hachurado) */}
                {ociosos.map(([a, b]) => (
                  <div
                    key={`oc-${a}`}
                    className="faixa-ocioso"
                    title={`Tempo ocioso: ${minParaHHMM(a)}–${minParaHHMM(b)} (${formatarDuracao(b - a)})`}
                    style={{
                      position: "absolute",
                      top: ((a - inicioGrade) / blocoMin) * ALTURA_BLOCO + 1,
                      left: 3,
                      right: 3,
                      height: ((b - a) / blocoMin) * ALTURA_BLOCO - 2,
                      zIndex: 1,
                      pointerEvents: "none",
                      borderRadius: 3,
                    }}
                  />
                ))}

                {/* faixas de pausa (lanche/almoço) — altura pela duração REAL, para
                    não pintarem o bloco inteiro de 30min nem colidir com os cards */}
                {intervalosF.map((iv) => {
                  const dur = iv.fim - iv.ini;
                  return (
                    <div
                      key={iv.ini}
                      className="celula-intervalo"
                      style={{
                        position: "absolute",
                        top: ((iv.ini - inicioGrade) / blocoMin) * ALTURA_BLOCO,
                        left: 0,
                        right: 0,
                        height: (dur / blocoMin) * ALTURA_BLOCO,
                        zIndex: 2,
                        pointerEvents: "none",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        className="rotulo"
                        style={{ color: "var(--papel-3)", paddingLeft: 8, fontSize: 9, lineHeight: `${Math.max(14, (dur / blocoMin) * ALTURA_BLOCO)}px` }}
                      >
                        ▦ {dur >= 45 ? "Almoço" : "Lanche"}
                      </span>
                    </div>
                  );
                })}

                {/* véu de ausência: bloqueia visualmente a coluna inteira */}
                {motivoAusencia && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 9,
                      background:
                        "repeating-linear-gradient(-45deg, rgba(199,58,43,0.10), rgba(199,58,43,0.10) 8px, rgba(199,58,43,0.18) 8px, rgba(199,58,43,0.18) 16px)",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "center",
                      paddingTop: 24,
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      className="selo selo-vermelho"
                      style={{ transform: "rotate(-8deg)", boxShadow: "var(--sombra-leve)" }}
                    >
                      ✕ {motivoAusencia}
                    </span>
                  </div>
                )}

                {/* fantasma de drop: mostra exatamente onde a tarefa cairá.
                    Só existe enquanto há item em arrasto (blocosArrasto). */}
                {blocosArrasto != null && previa?.funcionarioId === f.id && !motivoAusencia && (
                  <div
                    style={{
                      position: "absolute",
                      top: previa.slot * ALTURA_BLOCO + 1,
                      left: 3,
                      right: 3,
                      height: (blocosArrasto ?? 1) * ALTURA_BLOCO - 3,
                      border: "2px dashed var(--acento)",
                      background: "rgba(156, 13, 56, 0.07)",
                      borderRadius: 3,
                      zIndex: 6,
                      pointerEvents: "none",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "flex-end",
                      padding: "2px 6px",
                    }}
                  >
                    <span className="num" style={{ fontSize: 10, fontWeight: 700, color: "var(--acento)" }}>
                      {minParaHHMM(inicioGrade + previa.slot * blocoMin)}
                    </span>
                  </div>
                )}

                {/* blocos de rotina — tarefas iguais e contíguas viram 1 card */}
                {runs.map((run) => {
                  const ini = hhmmParaMin(run.inicio);
                  if (Number.isNaN(ini)) return null;
                  const unico = run.membros.length === 1;
                  const emResize = unico && resize?.rotinaId === run.id;
                  const durMin = hhmmParaMin(run.fim) - ini;
                  // Altura pela duração REAL do bloco inteiro (piso p/ clicabilidade).
                  const altura = emResize
                    ? resize.blocos * ALTURA_BLOCO
                    : Math.max(14, (durMin / blocoMin) * ALTURA_BLOCO);
                  const tarefa = tarefaPorId.get(run.tarefa_id);
                  const est = ESTILO_STATUS[run.status] ?? ESTILO_STATUS.planejada;
                  return (
                    <CardRotina
                      key={run.id}
                      run={run}
                      tarefa={tarefa}
                      topo={((ini - inicioGrade) / blocoMin) * ALTURA_BLOCO}
                      altura={altura}
                      unico={unico}
                      emResize={emResize}
                      compacto={altura < 30}
                      espinha={est.espinha ?? catPorId.get(tarefa?.categoria_id ?? "")?.cor ?? "#3a6ea5"}
                      fundo={est.fundo}
                      visualBlocos={Math.max(1, Math.round(durMin / blocoMin))}
                      rotuloResize={emResize ? formatarDuracao(resize.blocos * blocoMin) : undefined}
                      podeRedimensionar={!!aoRedimensionar && unico}
                      aoIniciarArrasto={aoIniciarArrasto}
                      aoTerminarArrasto={() => {
                        setPrevia(null);
                        aoTerminarArrasto?.();
                      }}
                      aoAbrirDetalhe={(r, ancora) => setDetalhe({ run: r, x: ancora.right, y: ancora.top })}
                      aoRemoverRun={removerRun}
                      aoIniciarResize={(r, clientY, vb) =>
                        setResize({ rotinaId: r.id, blocosOrig: vb, yInicial: clientY, blocos: vb })
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {detalhe && (
        <BalaoDetalhe
          run={detalhe.run}
          x={detalhe.x}
          y={detalhe.y}
          tarefa={tarefaPorId.get(detalhe.run.tarefa_id)}
          local={localPorId.get(detalhe.run.local_id)}
          categoria={catPorId.get(tarefaPorId.get(detalhe.run.tarefa_id)?.categoria_id ?? "")}
          aoRemover={(run) => {
            removerRun(run);
            setDetalhe(null);
          }}
          aoFechar={() => setDetalhe(null)}
        />
      )}
    </div>
  );
}
