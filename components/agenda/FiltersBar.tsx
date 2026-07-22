"use client";

/** Topo da tela de rotina: data, sede, turno e ações do dia. */
import Link from "next/link";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import type { Sede } from "@/types";

export default function FiltersBar({
  data,
  sedeId,
  turno,
  sedes,
  modo,
  busca,
  contextoRetomado = false,
  modoFoco = false,
  aoMudarData,
  aoMudarSede,
  aoMudarTurno,
  aoMudarModo,
  aoMudarBusca,
  aoAlternarFoco,
  aoDuplicar,
}: {
  data: string;
  sedeId: string;
  turno: string;
  sedes: Sede[];
  modo: "dia" | "semana";
  busca: string;
  /** Indica por alguns segundos que o estado anterior da sessão foi restaurado. */
  contextoRetomado?: boolean;
  modoFoco?: boolean;
  aoMudarData: (v: string) => void;
  aoMudarSede: (v: string) => void;
  aoMudarTurno: (v: string) => void;
  aoMudarModo: (v: "dia" | "semana") => void;
  aoMudarBusca: (v: string) => void;
  aoAlternarFoco: () => void;
  aoDuplicar: () => void;
}) {
  return (
    <div
      className="painel entra"
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 14,
        padding: "12px 16px",
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>Rotina do dia</h1>
          {contextoRetomado && (
            <span className="selo contexto-retomado" role="status">
              ↺ Contexto retomado
            </span>
          )}
        </div>
        <span className="rotulo" style={{ color: "var(--acento)" }}>
          arraste tarefas para a agenda · salvamento automático
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        className={`btn btn-mini${modoFoco ? " btn-primario" : ""}`}
        onClick={aoAlternarFoco}
        title={modoFoco ? "Sair do modo foco (Esc)" : "Ocultar navegação e ampliar a agenda"}
      >
        {modoFoco ? "◉ Sair do foco" : "◎ Modo foco"}
      </button>

      <div className="campo">
        <span className="rotulo">Visão</span>
        <div style={{ display: "flex" }}>
          {(["dia", "semana"] as const).map((m) => (
            <button
              key={m}
              onClick={() => aoMudarModo(m)}
              className="btn btn-mini"
              style={{
                borderRadius: m === "dia" ? "4px 0 0 4px" : "0 4px 4px 0",
                background: modo === m ? "var(--tinta)" : "var(--cartao)",
                color: modo === m ? "var(--papel)" : "var(--tinta)",
                boxShadow: "none",
              }}
            >
              {m === "dia" ? "Dia" : "Semana"}
            </button>
          ))}
        </div>
      </div>

      <div className="campo">
        <span className="rotulo">Data</span>
        <div className="controle-data-rapido">
          <button
            type="button"
            className="btn btn-mini"
            aria-label="Dia anterior"
            title="Dia anterior"
            onClick={() => aoMudarData(somarDias(data, -1))}
          >
            ‹
          </button>
          <input
            aria-label="Data da agenda"
            type="date"
            value={data}
            onChange={(e) => aoMudarData(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-mini"
            onClick={() => aoMudarData(hojeISO())}
            disabled={data === hojeISO()}
          >
            Hoje
          </button>
          <button
            type="button"
            className="btn btn-mini"
            aria-label="Próximo dia"
            title="Próximo dia"
            onClick={() => aoMudarData(somarDias(data, 1))}
          >
            ›
          </button>
        </div>
      </div>

      <label className="campo">
        <span className="rotulo">Sede</span>
        <select value={sedeId} onChange={(e) => aoMudarSede(e.target.value)}>
          {sedes
            .filter((s) => s.ativo)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome_sede}
              </option>
            ))}
        </select>
      </label>

      <label className="campo">
        <span className="rotulo">Turno</span>
        <select value={turno} onChange={(e) => aoMudarTurno(e.target.value)}>
          <option value="">Todos</option>
          <option value="manha">Manhã</option>
          <option value="tarde">Tarde</option>
          <option value="noite">Noite</option>
          <option value="integral">Integral</option>
        </select>
      </label>

      <label className="campo">
        <span className="rotulo">Funcionário</span>
        <input
          type="search"
          placeholder="buscar nome…"
          value={busca}
          onChange={(e) => aoMudarBusca(e.target.value)}
          style={{ width: 140 }}
        />
      </label>

      <button
        className="btn"
        onClick={aoDuplicar}
        title="Duplicar este dia para outras datas ou salvar/aplicar modelos de rotina"
      >
        ⧉ Duplicar / Modelos
      </button>
      <Link href="/dashboard" className="btn btn-primario" style={{ textDecoration: "none" }}>
        Dashboard →
      </Link>
    </div>
  );
}
