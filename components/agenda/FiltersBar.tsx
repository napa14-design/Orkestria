"use client";

/** Topo da tela de rotina: contexto que define qual agenda está aberta. */
import type { Sede } from "@/types";

export default function FiltersBar({
  data,
  sedeId,
  turno,
  sedes,
  modo,
  busca,
  aoMudarData,
  aoMudarSede,
  aoMudarTurno,
  aoMudarModo,
  aoMudarBusca,
  aoPlanejarPeriodo,
}: {
  data: string;
  sedeId: string;
  turno: string;
  sedes: Sede[];
  modo: "dia" | "semana";
  busca: string;
  aoMudarData: (v: string) => void;
  aoMudarSede: (v: string) => void;
  aoMudarTurno: (v: string) => void;
  aoMudarModo: (v: "dia" | "semana") => void;
  aoMudarBusca: (v: string) => void;
  aoPlanejarPeriodo: () => void;
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
        <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>Rotina do dia</h1>
        <span className="rotulo" style={{ color: "var(--acento)" }}>
          arraste tarefas para a agenda · salvamento automático
        </span>
      </div>

      <div style={{ flex: 1 }} />

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

      <label className="campo" data-tour="campo-data">
        <span className="rotulo">Data</span>
        <input type="date" value={data} onChange={(e) => aoMudarData(e.target.value)} />
      </label>

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

      {/* Vale nos dois modos: quem monta um evento monta no DIA e precisa salvar
          a rota ali mesmo — exigir trocar para a semana escondia o caminho.
          O rótulo é o verbo, não o mecanismo: a pessoa quer encher os dias. */}
      <button
        className="btn"
        data-tour="duplicar-modelos"
        onClick={aoPlanejarPeriodo}
        title="Copiar este dia (ou uma rota salva) para um período; e a biblioteca de rotas salvas"
      >
        ⧉ Preencher dias
      </button>
    </div>
  );
}
