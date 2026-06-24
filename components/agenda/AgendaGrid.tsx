"use client";

/**
 * Centro da tela de rotina: colunas por funcionário, linhas por bloco de
 * horário. Aceita soltar tarefas novas (paleta) e mover cards existentes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { jornadaLiquidaMin } from "@/lib/calculations";
import { formatarDuracao, hhmmParaMin, minParaHHMM } from "@/lib/dateUtils";
import type { Funcionario, Local, RotinaPlanejada, StatusRotina, Tarefa } from "@/types";

export const ALTURA_BLOCO_PADRAO = 30; // px por bloco (15 min) na densidade normal

const COR_STATUS: Record<StatusRotina, { fundo: string; texto: string }> = {
  planejada: { fundo: "var(--azul)", texto: "#fff" },
  realizada: { fundo: "var(--verde)", texto: "#fff" },
  nao_realizada: { fundo: "var(--vermelho)", texto: "#fff" },
  remanejada: { fundo: "var(--laranja)", texto: "#fff" },
  cancelada: { fundo: "var(--cinza-bloco)", texto: "var(--tinta)" },
  pendente: { fundo: "var(--laranja)", texto: "#fff" },
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
    if (!Number.isFinite(ini) || !Number.isFinite(fim)) return [360, 1080]; // 06:00–18:00
    return [ini, fim];
  }, [funcionarios]);

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
        {/* régua de horários */}
        <div style={{ width: 64, flexShrink: 0, borderRight: "2px solid var(--tinta)" }}>
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
              {min % 60 === 0 ? <strong>{minParaHHMM(min)}</strong> : minParaHHMM(min)}
            </div>
          ))}
        </div>

        {/* colunas dos funcionários */}
        {funcionarios.map((f, idxCol) => {
          const rotinasDoFunc = rotinas.filter((r) => r.funcionario_id === f.id);
          // "Runs": tarefas iguais e contíguas (fim de uma = início da próxima)
          // viram UM card único (altura cheia, sem linhas internas). As rotinas
          // seguem individuais por baixo (leitura OMR/realizado intactas).
          const ordenadas = [...rotinasDoFunc].sort((a, b) =>
            a.inicio_planejado.localeCompare(b.inicio_planejado),
          );
          type Run = {
            id: string;
            tarefa_id: string;
            local_id: string;
            status: StatusRotina;
            inicio: string;
            fim: string;
            membros: RotinaPlanejada[];
          };
          const runs: Run[] = [];
          for (const r of ordenadas) {
            const ult = runs[runs.length - 1];
            if (ult && ult.tarefa_id === r.tarefa_id && ult.fim === r.inicio_planejado) {
              ult.fim = r.fim_planejado;
              ult.membros.push(r);
            } else {
              runs.push({
                id: r.id,
                tarefa_id: r.tarefa_id,
                local_id: r.local_id,
                status: r.status,
                inicio: r.inicio_planejado,
                fim: r.fim_planejado,
                membros: [r],
              });
            }
          }
          const entradaF = hhmmParaMin(f.entrada);
          const saidaF = hhmmParaMin(f.saida);
          const intIni = hhmmParaMin(f.intervalo_inicio);
          const intFim = hhmmParaMin(f.intervalo_fim);
          const selecionado = funcionarioSelecionado === f.id;
          const motivoAusencia = ausencias?.get(f.id);

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
                {/* células de fundo */}
                {slots.map((min) => {
                  const foraJornada =
                    Number.isNaN(entradaF) || min < entradaF || min + blocoMin > saidaF;
                  const noIntervalo =
                    !Number.isNaN(intIni) && min >= intIni && min < intFim;
                  return (
                    <div
                      key={min}
                      className={
                        noIntervalo
                          ? "celula-intervalo"
                          : foraJornada
                            ? "celula-fora-jornada"
                            : undefined
                      }
                      style={{
                        height: ALTURA_BLOCO,
                        borderBottom: "1px solid var(--linha)",
                        borderTop: min % 60 === 0 ? "1px solid var(--tinta-3)" : undefined,
                      }}
                    >
                      {noIntervalo && min === intIni && (
                        <span
                          className="rotulo"
                          style={{ color: "var(--papel-3)", paddingLeft: 8, fontSize: 9, lineHeight: `${ALTURA_BLOCO}px` }}
                        >
                          ▦ Intervalo
                        </span>
                      )}
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
                  const topo = ((ini - inicioGrade) / blocoMin) * ALTURA_BLOCO;
                  const durMin = hhmmParaMin(run.fim) - ini;
                  // Altura pela duração REAL do bloco inteiro (piso p/ clicabilidade).
                  const altura = emResize
                    ? resize.blocos * ALTURA_BLOCO
                    : Math.max(11, (durMin / blocoMin) * ALTURA_BLOCO);
                  const compacto = altura < 30;
                  const medio = altura < 48;
                  const visualBlocos = Math.max(1, Math.round(durMin / blocoMin));
                  const tarefa = tarefaPorId.get(run.tarefa_id);
                  const local = localPorId.get(run.local_id);
                  const cor = COR_STATUS[run.status] ?? COR_STATUS.planejada;
                  return (
                    <div
                      key={run.id}
                      className="agenda-card-tarefa pop-card"
                      draggable={unico && !emResize}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ tipo: "mover", rotina_id: run.id }),
                        );
                        e.dataTransfer.effectAllowed = "move";
                        aoIniciarArrasto?.(visualBlocos);
                      }}
                      onDragEnd={() => {
                        setPrevia(null);
                        aoTerminarArrasto?.();
                      }}
                      style={{
                        position: "absolute",
                        top: topo + 1,
                        left: 3,
                        right: 3,
                        height: altura - 2,
                        boxSizing: "border-box",
                        background: cor.fundo,
                        color: cor.texto,
                        padding: "2px 8px",
                        overflow: "hidden",
                        zIndex: 5,
                        borderRadius: 3,
                        border: "1px solid rgba(0,0,0,0.22)",
                        borderLeft: "4px solid rgba(0,0,0,0.34)",
                        boxShadow: "1.5px 1.5px 0 rgba(0,0,0,0.16)",
                      }}
                      title={`${tarefa?.nome_tarefa ?? "Tarefa"} · ${run.inicio}–${run.fim} · ${formatarDuracao(durMin)}${
                        run.membros.length > 1 ? ` (${run.membros.length} blocos contíguos)` : ""
                      }\nArraste para mover.`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          run.membros.forEach((m) => aoRemover(m.id));
                        }}
                        aria-label="Remover"
                        className="card-x"
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 4,
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        ×
                      </button>
                      <div style={{ fontWeight: 700, fontSize: compacto ? 11 : 12, lineHeight: compacto ? 1.1 : 1.2, paddingRight: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {tarefa?.nome_tarefa ?? "Tarefa"}
                      </div>
                      {!compacto && (
                        <div className="num" style={{ fontSize: 10, opacity: 0.85 }}>
                          {run.inicio}–{run.fim} · {formatarDuracao(durMin)}
                        </div>
                      )}
                      {!medio && local && (
                        <div style={{ fontSize: 10, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {local.nome_local} · {local.andar}
                        </div>
                      )}
                      {aoRedimensionar && unico && (
                        <div
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setResize({
                              rotinaId: run.id,
                              blocosOrig: visualBlocos,
                              yInicial: e.clientY,
                              blocos: visualBlocos,
                            });
                          }}
                          title="Arraste para mudar a duração (blocos de agenda)"
                          className="card-alca"
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 9,
                            cursor: "ns-resize",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            lineHeight: 1,
                            touchAction: "none",
                          }}
                        >
                          ⠿⠿
                        </div>
                      )}
                      {emResize && (
                        <div
                          className="num"
                          style={{ position: "absolute", bottom: 10, right: 6, fontSize: 10, fontWeight: 700 }}
                        >
                          {formatarDuracao(resize.blocos * blocoMin)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
