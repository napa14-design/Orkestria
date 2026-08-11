"use client";

/**
 * Lançamento em lote de qualificações: **várias pessoas × várias capacitações**.
 *
 * Existe porque o cadastro era um registro por modal. Uma pessoa com 20
 * treinamentos custava 20 rodadas reescolhendo a pessoa; e uma **turma** de 15
 * pessoas no mesmo NR custava 15 rodadas reescolhendo o treinamento. A doutrina
 * põe ação em massa na **implantação**, que pode ser pesada — o ato diário do
 * supervisor não passa por aqui.
 *
 * Fica recolhido por padrão: quem só quer conferir uma validade não tropeça nele.
 */
import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { apiPost, ErroApi } from "@/lib/clientApi";
import { hojeISO } from "@/lib/dateUtils";
import { NIVEIS_QUALIFICACAO } from "@/types";
import type { Funcionario, Requisito, Sede } from "@/types";

interface Resultado {
  criadas: number;
  ja_tinham: number;
  recusadas: number;
  detalhes: string[];
}

export default function LoteQualificacoes({
  funcionarios,
  requisitos,
  sedes,
}: {
  funcionarios: Funcionario[];
  requisitos: Requisito[];
  sedes: Sede[];
}) {
  const { mutate } = useSWRConfig();
  const [aberto, setAberto] = useState(false);
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [pessoas, setPessoas] = useState<Set<string>>(new Set());
  const [capacitacoes, setCapacitacoes] = useState<Set<string>>(new Set());
  const [validade, setValidade] = useState("");
  const [nivel, setNivel] = useState("apto");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);

  const nomeSede = (id: string) => sedes.find((s) => s.id === id)?.nome_sede ?? id;
  const daSede = useMemo(
    () =>
      funcionarios
        .filter((f) => f.ativo && (!sedeFiltro || f.sede_id === sedeFiltro))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [funcionarios, sedeFiltro],
  );
  // EPI não é qualificação possuída — é exigido pela tarefa e declarado na ficha.
  const possiveis = useMemo(
    () => requisitos.filter((r) => r.ativo && r.tipo !== "epi").sort((a, b) => a.nome.localeCompare(b.nome)),
    [requisitos],
  );
  const total = pessoas.size * capacitacoes.size;

  const alternar = (conjunto: Set<string>, id: string) => {
    const proximo = new Set(conjunto);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    return proximo;
  };

  async function lancar() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    setMensagem(null);
    setSalvando(true);
    try {
      const r = await apiPost<Resultado>("/api/qualificacoes/lote", {
        funcionario_ids: [...pessoas],
        requisito_ids: [...capacitacoes],
        validade,
        nivel,
      });
      await mutate("/api/qualificacoes");
      setPessoas(new Set());
      setCapacitacoes(new Set());
      setMensagem({
        texto:
          `${r.criadas} qualificação(ões) lançada(s)` +
          (r.ja_tinham > 0 ? ` · ${r.ja_tinham} já existiam (validade preservada)` : "") +
          (r.recusadas > 0 ? ` · ${r.recusadas} recusada(s): ${r.detalhes[0] ?? ""}` : "") +
          ".",
      });
    } catch (err) {
      setMensagem({
        texto: err instanceof ErroApi ? err.message : "Não foi possível lançar o lote.",
        erro: true,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="painel" style={{ marginBottom: 16, padding: "12px 16px" }}>
      <button
        type="button"
        className="btn btn-mini"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
      >
        {aberto ? "▾" : "▸"} Lançar em lote (turma ou pessoa com vários treinamentos)
      </button>

      {mensagem && (
        <div className={`alerta ${mensagem.erro ? "alerta-erro" : "alerta-ok"}`} role="status" style={{ marginTop: 10 }}>
          {mensagem.texto}
        </div>
      )}

      {aberto && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "var(--tinta-3)", margin: 0 }}>
            Marque as pessoas e as capacitações: o sistema cruza as duas listas. Quem já tem a
            capacitação é <strong>pulado</strong>, com a validade preservada — renovar é editar na
            lista abaixo.
          </p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="campo">
              <span className="rotulo">Sede (filtra a lista)</span>
              <select
                value={sedeFiltro}
                onChange={(e) => {
                  setSedeFiltro(e.target.value);
                  setPessoas(new Set());
                  setConfirmando(false);
                }}
              >
                <option value="">Todas</option>
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
              <span className="rotulo">Validade (vazio = não expira)</span>
              <input type="date" value={validade} min={hojeISO()} onChange={(e) => setValidade(e.target.value)} />
            </label>
            <label className="campo">
              <span className="rotulo">Nível</span>
              <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
                {NIVEIS_QUALIFICACAO.map((n) => (
                  <option key={n.valor} value={n.valor}>
                    {n.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span className="rotulo">Pessoas ({pessoas.size})</span>
                <button
                  type="button"
                  className="btn btn-mini btn-fantasma"
                  onClick={() => {
                    setPessoas(pessoas.size === daSede.length ? new Set() : new Set(daSede.map((f) => f.id)));
                    setConfirmando(false);
                  }}
                >
                  {pessoas.size === daSede.length && daSede.length > 0 ? "limpar" : "marcar todas"}
                </button>
              </div>
              <div style={{ maxHeight: 190, overflowY: "auto", border: "1px solid var(--linha)", padding: 8, display: "grid", gap: 4 }}>
                {daSede.map((f) => (
                  <label key={f.id} style={{ display: "flex", gap: 6, fontSize: 12, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={pessoas.has(f.id)}
                      onChange={() => {
                        setPessoas(alternar(pessoas, f.id));
                        setConfirmando(false);
                      }}
                    />
                    {f.nome}
                    {!sedeFiltro && (
                      <span style={{ color: "var(--tinta-3)" }}>· {nomeSede(f.sede_id)}</span>
                    )}
                  </label>
                ))}
                {daSede.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>Nenhuma pessoa ativa aqui.</span>
                )}
              </div>
            </div>

            <div>
              <span className="rotulo">Capacitações ({capacitacoes.size})</span>
              <div style={{ maxHeight: 190, overflowY: "auto", border: "1px solid var(--linha)", padding: 8, display: "grid", gap: 4, marginTop: 4 }}>
                {possiveis.map((r) => (
                  <label key={r.id} style={{ display: "flex", gap: 6, fontSize: 12, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={capacitacoes.has(r.id)}
                      onChange={() => {
                        setCapacitacoes(alternar(capacitacoes, r.id));
                        setConfirmando(false);
                      }}
                    />
                    {r.tipo === "aptidao" ? "🩺" : "🎓"} {r.nome}
                  </label>
                ))}
                {possiveis.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>
                    Nenhuma capacitação no catálogo — cadastre em Requisitos.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primario" disabled={total === 0 || salvando} onClick={() => void lancar()}>
              {salvando
                ? "Lançando…"
                : confirmando
                  ? `Confirmar ${total} lançamento(s)?`
                  : `Lançar ${pessoas.size} pessoa(s) × ${capacitacoes.size} capacitação(ões)`}
            </button>
            {confirmando && (
              <button className="btn btn-mini" onClick={() => setConfirmando(false)}>
                cancelar
              </button>
            )}
            {total > 0 && !confirmando && (
              <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>= {total} registro(s)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
