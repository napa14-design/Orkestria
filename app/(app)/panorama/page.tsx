"use client";

/**
 * Panorama de sedes: visão agregada de ocupação e ociosidade por GRUPO
 * (ex.: "Sul") ou por TIPO de sede (ex.: educação infantil), para comparar
 * unidades parecidas e enxergar onde há folga × sobrecarga (apoio ao remanejo).
 * Só leitura — agrega o que já existe (cadastro de sede + rotinas).
 */
import { useMemo } from "react";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import { CartaoKpi, ListaBarras, type ItemBarra } from "@/components/DashboardCards";
import { classificarOcupacao, jornadaLiquidaMin, PARAMETROS_PADRAO } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { formatarDuracao, hojeISO } from "@/lib/dateUtils";
import { usePreferenciaTela } from "@/lib/usePreferenciaTela";
import type { Funcionario, ParametrosResolvidos, RotinaPlanejada, Sede } from "@/types";

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TIPO_ROTULO: Record<string, string> = {
  educacao_infantil: "Educação infantil",
  escola: "Escola",
  faculdade: "Faculdade",
  administrativo: "Administrativo",
  outros: "Outros",
};

function corOcupacao(classe: string): string {
  return classe === "sobrecarga"
    ? "var(--vermelho)"
    : classe === "alta_ocupacao"
      ? "var(--amarelo)"
      : classe === "adequado"
        ? "var(--verde)"
        : "var(--cinza-bloco)";
}

type MetricaSede = {
  sede: Sede;
  funcs: number;
  comPlan: number;
  ocupMedia: number;
  ociosidade: number;
  sobrecarga: number;
};

export default function PaginaPanorama() {
  const [de, setDe] = usePreferenciaTela("panorama", "de", diasAtras(6));
  const [ate, setAte] = usePreferenciaTela("panorama", "ate", hojeISO());
  const [dimPreferida, setDim] = usePreferenciaTela("panorama", "dimensao", "grupo");
  const dim: "grupo" | "tipo" = dimPreferida === "tipo" ? "tipo" : "grupo";

  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: rotinas } = useSWR<RotinaPlanejada[]>(`/api/rotinas?de=${de}&ate=${ate}`, fetcher);
  const { data: parametros } = useSWR<ParametrosResolvidos>("/api/parametros?resolvidos=1", fetcher);
  const params = parametros ?? PARAMETROS_PADRAO;

  // Métricas por sede (mesma lógica do Dashboard, mas para todas as sedes).
  const porSede = useMemo<MetricaSede[]>(() => {
    const rs = (rotinas ?? []).filter((r) => r.status !== "cancelada");
    const funcs = (funcionarios ?? []).filter((f) => f.ativo);
    return (sedes ?? [])
      .filter((s) => s.ativo)
      .map((s) => {
        const fs = funcs.filter((f) => f.sede_id === s.id);
        const perF = fs.map((f) => {
          const minhas = rs.filter((r) => r.funcionario_id === f.id);
          const dias = new Set(minhas.map((r) => r.data)).size;
          const jornada = jornadaLiquidaMin(f);
          const planejado = minhas.reduce((a, r) => a + r.tempo_previsto_min, 0);
          const ocup = dias > 0 && jornada > 0 ? (planejado / (jornada * dias)) * 100 : 0;
          const ocios = dias > 0 ? Math.max(0, jornada * dias - planejado) : 0;
          return { dias, ocup, ocios };
        });
        const comPlan = perF.filter((p) => p.dias > 0);
        const ocupMedia = comPlan.length ? comPlan.reduce((a, p) => a + p.ocup, 0) / comPlan.length : 0;
        return {
          sede: s,
          funcs: fs.length,
          comPlan: comPlan.length,
          ocupMedia,
          ociosidade: comPlan.reduce((a, p) => a + p.ocios, 0),
          sobrecarga: comPlan.filter((p) => classificarOcupacao(p.ocup, params) === "sobrecarga").length,
        };
      });
  }, [sedes, funcionarios, rotinas, params]);

  // Agrupa as sedes por grupo ou por tipo.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; sedes: MetricaSede[] }>();
    for (const m of porSede) {
      const chave =
        dim === "grupo"
          ? m.sede.grupo?.trim() || "Sem grupo"
          : m.sede.tipo_sede
            ? TIPO_ROTULO[m.sede.tipo_sede] ?? m.sede.tipo_sede
            : "Sem tipo";
      if (!mapa.has(chave)) mapa.set(chave, { rotulo: chave, sedes: [] });
      mapa.get(chave)!.sedes.push(m);
    }
    return [...mapa.values()]
      .map((g) => {
        const totalComPlan = g.sedes.reduce((a, s) => a + s.comPlan, 0);
        // ocupação média ponderada por funcionário (com planejamento)
        const ocupMedia = totalComPlan
          ? g.sedes.reduce((a, s) => a + s.ocupMedia * s.comPlan, 0) / totalComPlan
          : 0;
        const ativas = g.sedes.filter((s) => s.comPlan > 0).sort((a, b) => b.ocupMedia - a.ocupMedia);
        return {
          rotulo: g.rotulo,
          sedes: g.sedes,
          nSedes: g.sedes.length,
          nFuncs: g.sedes.reduce((a, s) => a + s.funcs, 0),
          ocupMedia,
          ociosidade: g.sedes.reduce((a, s) => a + s.ociosidade, 0),
          sobrecarga: g.sedes.reduce((a, s) => a + s.sobrecarga, 0),
          maisFolga: ativas.length ? ativas[ativas.length - 1] : null,
          maisCheia: ativas.length ? ativas[0] : null,
        };
      })
      .sort((a, b) => b.ocupMedia - a.ocupMedia);
  }, [porSede, dim]);

  const carregando = !sedes || !funcionarios || !rotinas;

  return (
    <div className="entra">
      {/* filtros */}
      <div
        className="painel"
        style={{ display: "flex", alignItems: "flex-end", gap: 14, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>Panorama de sedes</h1>
          <span className="rotulo" style={{ color: "var(--acento)" }}>
            ocupação e ociosidade agregadas por grupo / tipo
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="campo">
          <span className="rotulo">Agrupar por</span>
          <div style={{ display: "flex" }}>
            {(["grupo", "tipo"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDim(d)}
                className="btn btn-mini"
                style={{
                  borderRadius: d === "grupo" ? "4px 0 0 4px" : "0 4px 4px 0",
                  background: dim === d ? "var(--tinta)" : "var(--cartao)",
                  color: dim === d ? "var(--papel)" : "var(--tinta)",
                  boxShadow: "none",
                }}
              >
                {d === "grupo" ? "Grupo" : "Tipo de sede"}
              </button>
            ))}
          </div>
        </div>
        <label className="campo">
          <span className="rotulo">De</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="campo">
          <span className="rotulo">Até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>

      {carregando ? (
        <div className="painel">
          <Carregando texto="Carregando panorama…" style={{ padding: 64 }} />
        </div>
      ) : grupos.length === 0 ? (
        <div className="painel" style={{ padding: 24, color: "var(--tinta-2)" }}>
          Nenhuma sede ativa para agregar.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {grupos.map((g) => {
            const classe = classificarOcupacao(g.ocupMedia, params);
            const barras: ItemBarra[] = g.sedes.map((s) => {
              const c = classificarOcupacao(s.ocupMedia, params);
              return {
                rotulo: s.comPlan > 0 ? s.sede.nome_sede : `${s.sede.nome_sede} (sem planejamento)`,
                valor: s.ocupMedia,
                texto: s.comPlan > 0 ? `${s.ocupMedia.toFixed(0)}%` : "—",
                cor: s.comPlan > 0 ? corOcupacao(c) : "var(--linha)",
              };
            });
            return (
              <div key={g.rotulo} className="painel" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>{g.rotulo}</h2>
                  <span className="rotulo" style={{ color: "var(--tinta-3)" }}>
                    {g.nSedes} {g.nSedes === 1 ? "sede" : "sedes"} · {g.nFuncs} {g.nFuncs === 1 ? "funcionário" : "funcionários"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <CartaoKpi rotulo="Ocupação média" valor={`${g.ocupMedia.toFixed(0)}%`} cor={corOcupacao(classe)} />
                  <CartaoKpi rotulo="Ociosidade prevista" valor={formatarDuracao(g.ociosidade)} cor="var(--laranja)" detalhe="nos dias com plano" />
                  <CartaoKpi rotulo="Sobrecarga" valor={String(g.sobrecarga)} cor="var(--vermelho)" detalhe="funcionários > 100%" />
                </div>

                <ListaBarras titulo="Ocupação por sede" itens={barras} />

                {g.maisFolga && g.maisCheia && g.maisFolga.sede.id !== g.maisCheia.sede.id && (
                  <p style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 10, lineHeight: 1.5 }}>
                    💡 <strong>{g.maisFolga.sede.nome_sede}</strong> tem mais folga ({g.maisFolga.ocupMedia.toFixed(0)}% de
                    ocupação) e <strong>{g.maisCheia.sede.nome_sede}</strong> está mais cheia ({g.maisCheia.ocupMedia.toFixed(0)}%)
                    — candidata a remanejo dentro do {dim === "grupo" ? "grupo" : "tipo"}.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
