"use client";

/**
 * Troca as tarefas do dia entre duas pessoas, de uma vez (antes era bloco a bloco).
 * Mostra o que cada uma passa a fazer e o que esbarra no expediente ou no intervalo do
 * outro; só grava depois do "Trocar", e o servidor confere de novo.
 */
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { apiPost, ErroApi } from "@/lib/clientApi";
import type { Funcionario } from "@/types";
import type { PropostaTroca } from "@/services/rotinasService";

export default function TrocarTarefas({
  de,
  colegas,
  data,
  sedeId,
  aoFechar,
  aoConcluir,
}: {
  /** Quem abriu a troca; `null` fecha o modal. */
  de: Funcionario | null;
  /** Quem pode receber: presentes no dia, sem `de`. */
  colegas: Funcionario[];
  data: string;
  sedeId: string;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [com, setCom] = useState("");
  const [forcar, setForcar] = useState(false);
  /** Trocar também na rota padrão: escolha explícita, desmarcada a cada pessoa nova. */
  const [naRota, setNaRota] = useState(false);
  const [proposta, setProposta] = useState<PropostaTroca | null>(null);
  const [erro, setErro] = useState("");
  const [estado, setEstado] = useState<"parado" | "montando" | "gravando">("parado");

  useEffect(() => {
    setCom("");
    setForcar(false);
    setNaRota(false);
    setProposta(null);
    setErro("");
  }, [de?.id, data]);

  // A proposta sai sempre sem autorização, para mostrar o que a pede; o "autorizar" só
  // vai junto na confirmação, e vale só para a proposta que está na tela: toda proposta
  // nova (outra pessoa ou 409) desmarca. Depende do id, não do objeto `de`: o SWR troca o
  // objeto ao recarregar a lista, e isso remontava a proposta em silêncio com a caixa
  // marcada; agora a recarga não remonta, e a agenda mudada vira 409 na confirmação.
  // `rodada` refaz a proposta depois de um 409.
  const [rodada, setRodada] = useState(0);
  const deId = de?.id;
  useEffect(() => {
    setForcar(false);
    if (!deId || !com) return;
    let valendo = true;
    setEstado("montando");
    apiPost<PropostaTroca>("/api/rotinas/trocar", { data, sede_id: sedeId, a: deId, b: com })
      .then((p) => {
        if (!valendo) return;
        setForcar(false);
        setProposta(p);
      })
      .catch((e) => {
        if (!valendo) return;
        setProposta(null);
        setErro(e instanceof ErroApi ? e.message : "Não foi possível montar a troca.");
      })
      .finally(() => valendo && setEstado("parado"));
    return () => {
      valendo = false;
    };
  }, [deId, com, data, sedeId, rodada]);

  async function trocar() {
    if (!de || !proposta) return;
    setEstado("gravando");
    setErro("");
    try {
      await apiPost("/api/rotinas/trocar", {
        data,
        sede_id: sedeId,
        a: de.id,
        b: com,
        forcar,
        rota: naRota,
        confirmar: true,
        assinatura: proposta.assinatura,
      });
      aoConcluir();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível trocar.");
      setEstado("parado");
      // A agenda mudou: monta de novo com o que está gravado, e a autorização volta a ser pedida.
      if (e instanceof ErroApi && e.status === 409) {
        setForcar(false);
        setNaRota(false);
        setRodada((n) => n + 1);
      }
    }
  }

  const nome = (id: string) => (proposta && id === proposta.a.id ? proposta.a.nome : proposta?.b.nome ?? "");
  const comAlerta = proposta?.blocos.filter((b) => b.alertas.length) ?? [];
  const temRota = !!proposta && proposta.rota.a + proposta.rota.b > 0;
  const podeTrocar =
    !!proposta &&
    !proposta.bloqueia &&
    (!proposta.pedeAutorizacao || forcar) &&
    (proposta.blocos.length > 0 || naRota) &&
    estado === "parado";

  return (
    <Modal titulo={`Trocar as tarefas de ${de?.nome ?? ""}`} aberto={!!de} aoFechar={estado === "gravando" ? () => {} : aoFechar} larguraMax={560}>
      <label className="campo" style={{ marginBottom: 12 }}>
        <span className="rotulo">Com quem</span>
        <select
          value={com}
          onChange={(e) => {
            setCom(e.target.value);
            setNaRota(false);
            setErro("");
          }}
          disabled={estado === "gravando"}
        >
          <option value="">— escolher —</option>
          {colegas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} ({f.entrada}–{f.saida})
            </option>
          ))}
        </select>
      </label>

      {estado === "montando" && <p style={{ fontSize: 13, color: "var(--tinta-2)" }}>Montando a troca…</p>}

      {proposta && estado !== "montando" && (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            {proposta.blocos.length > 0 ? (
              <>
                <strong>{proposta.b.nome}</strong> passa a fazer {proposta.b.recebe} tarefa(s) de {proposta.a.nome}, e{" "}
                <strong>{proposta.a.nome}</strong> passa a fazer {proposta.a.recebe} de {proposta.b.nome}, nos mesmos horários.
              </>
            ) : (
              "Nenhum dos dois tem tarefa planejada para trocar neste dia."
            )}
            {proposta.ficam > 0 && ` ${proposta.ficam} ficam onde estão: já têm realizado, foram canceladas ou remanejadas.`}
          </p>
          {comAlerta.length > 0 && (
            <div className={`alerta ${proposta.bloqueia ? "alerta-erro" : "alerta-aviso"}`} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {proposta.bloqueia ? "Assim não dá para trocar:" : "Atenção nestes horários:"}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>
                {comAlerta.map((b) => (
                  <li key={b.rotina_id}>
                    <span className="num">{b.inicio}</span> {b.tarefa} → {nome(b.para)}: {b.alertas.map((a) => a.mensagem).join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {proposta.pedeAutorizacao && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 6 }}>
              <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} disabled={estado !== "parado"} />
              Autorizar mesmo assim (fica registrado na tarefa)
            </label>
          )}
          {temRota && proposta.rotaRecusas.length > 0 && (
            <div className="alerta alerta-aviso" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Na rota padrão não dá para trocar:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {proposta.rotaRecusas.map((r) => (
                  <li key={r.item_id}>
                    <span className="num">{r.inicio}</span>
                    {r.dias && ` (${r.dias})`} {r.tarefa} → {r.para}: {r.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {temRota && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={naRota}
                onChange={(e) => setNaRota(e.target.checked)}
                disabled={estado !== "parado" || proposta.rotaRecusas.length > 0}
                style={{ marginTop: 3 }}
              />
              <span>
                Trocar também na rota padrão ({proposta.rota.a} item(ns) de {proposta.a.nome}, {proposta.rota.b} de {proposta.b.nome}).
                <span style={{ display: "block", fontSize: 12, color: "var(--tinta-2)" }}>
                  Vale para os dias gerados daqui em diante; os que já estão na agenda não mudam.
                </span>
              </span>
            </label>
          )}
        </>
      )}

      {erro && (
        <div className="alerta alerta-erro" style={{ marginTop: 8 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn" onClick={aoFechar} disabled={estado === "gravando"}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primario" onClick={() => void trocar()} disabled={!podeTrocar}>
          {estado === "gravando" ? "Trocando…" : "Trocar"}
        </button>
      </div>
    </Modal>
  );
}
