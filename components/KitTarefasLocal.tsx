"use client";

import { useEffect, useMemo, useState } from "react";
import { apiPost, ErroApi } from "@/lib/clientApi";
import { formatarDuracao } from "@/lib/dateUtils";
import { kitTarefasPorTipo } from "@/lib/kitsTarefas";
import type { Local, Tarefa } from "@/types";
import Modal from "./Modal";

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

const ROTULO_FREQUENCIA: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  sob_demanda: "Sob demanda",
};

export default function KitTarefasLocal({
  local,
  tarefas,
  aoFechar,
  aoConcluir,
}: {
  local: Local | null;
  tarefas: Tarefa[];
  aoFechar: () => void;
  aoConcluir: () => Promise<void> | void;
}) {
  const kit = useMemo(() => (local ? kitTarefasPorTipo(local.tipo_local) : []), [local]);
  const nomesExistentes = useMemo(
    () => new Set(tarefas.filter((tarefa) => tarefa.local_id === local?.id).map((tarefa) => normalizar(tarefa.nome_tarefa))),
    [tarefas, local?.id],
  );
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState("");

  useEffect(() => {
    if (!local) return;
    setSelecionados(
      new Set(kit.filter((item) => !nomesExistentes.has(normalizar(item.nome))).map((item) => item.id)),
    );
    setErro("");
    setResultado("");
    // Reinicia somente ao abrir/trocar o local; a revalidação após criar não
    // deve apagar a mensagem de sucesso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local?.id]);

  function alternar(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  async function aplicar() {
    if (!local || selecionados.size === 0) return;
    setSalvando(true);
    setErro("");
    setResultado("");
    try {
      const resposta = await apiPost<{ criadas: number; ignoradas: string[] }>(
        `/api/locais/${local.id}/kit`,
        { itens: [...selecionados] },
      );
      await aoConcluir();
      setSelecionados(new Set());
      setResultado(
        resposta.criadas > 0
          ? `${resposta.criadas} tarefa(s) criada(s). O local já está mais perto de ficar pronto.`
          : "Nenhuma duplicação foi criada; as tarefas escolhidas já existiam.",
      );
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : "Não foi possível aplicar o kit.");
    } finally {
      setSalvando(false);
    }
  }

  function fechar() {
    if (!salvando) aoFechar();
  }

  const faltantes = kit.filter((item) => !nomesExistentes.has(normalizar(item.nome))).length;

  return (
    <Modal
      titulo={local ? `Preparar — ${local.nome_local}` : "Preparar local"}
      aberto={Boolean(local)}
      aoFechar={fechar}
      larguraMax={700}
    >
      <div className="kit-tarefas-intro">
        <span className="kit-tarefas-marca" aria-hidden="true">♩</span>
        <div>
          <span className="rotulo">Kit sugerido para {local?.tipo_local.replaceAll("_", " ")}</span>
          <h3>Escolha o que este local realmente precisa.</h3>
          <p>Tempos e frequências são pontos de partida. Tudo continua editável depois.</p>
        </div>
      </div>

      <div className="kit-tarefas-lista">
        {kit.map((item) => {
          const existente = nomesExistentes.has(normalizar(item.nome));
          return (
            <label key={item.id} className={`kit-tarefa-item${existente ? " existente" : ""}`}>
              <input
                type="checkbox"
                checked={existente || selecionados.has(item.id)}
                disabled={existente || salvando}
                onChange={() => alternar(item.id)}
              />
              <span>
                <strong>{item.nome}</strong>
                <small>{item.descricao}</small>
              </span>
              <span className="kit-tarefa-meta">
                {existente ? (
                  <b className="selo selo-verde">Já existe</b>
                ) : (
                  <>
                    <b className="num">{formatarDuracao(item.tempo_base_min)}</b>
                    <small>{ROTULO_FREQUENCIA[item.frequencia]}</small>
                    {item.critica && <i className="selo selo-vermelho">essencial</i>}
                  </>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {faltantes === 0 && !resultado && (
        <div className="alerta alerta-ok" style={{ marginTop: 14 }}>
          Este local já possui todas as tarefas sugeridas pelo kit.
        </div>
      )}
      {resultado && <div className="alerta alerta-ok" style={{ marginTop: 14 }}>{resultado}</div>}
      {erro && <div className="alerta alerta-erro" style={{ marginTop: 14 }}>{erro}</div>}

      <div className="kit-tarefas-acoes">
        <button type="button" className="btn" disabled={salvando} onClick={fechar}>Fechar</button>
        <button
          type="button"
          className="btn btn-primario"
          disabled={salvando || selecionados.size === 0}
          onClick={aplicar}
        >
          {salvando ? "Criando tarefas…" : `Criar ${selecionados.size} ${selecionados.size === 1 ? "tarefa" : "tarefas"}`}
        </button>
      </div>
    </Modal>
  );
}
