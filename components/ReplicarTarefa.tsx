"use client";

import { useEffect, useMemo, useState } from "react";
import { apiPost, ErroApi } from "@/lib/clientApi";
import type { Local, Tarefa } from "@/types";
import Modal from "./Modal";

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export default function ReplicarTarefa({
  tarefa,
  locais,
  tarefas,
  aoFechar,
  aoConcluir,
}: {
  tarefa: Tarefa | null;
  locais: Local[];
  tarefas: Tarefa[];
  aoFechar: () => void;
  aoConcluir: () => Promise<void> | void;
}) {
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState("");

  const destinos = useMemo(
    () => locais.filter((local) => local.ativo && local.sede_id === tarefa?.sede_id && local.id !== tarefa?.local_id),
    [locais, tarefa?.sede_id, tarefa?.local_id],
  );
  const locaisComTarefa = useMemo(() => {
    if (!tarefa) return new Set<string>();
    const nome = normalizar(tarefa.nome_tarefa);
    return new Set(
      tarefas
        .filter((item) => item.sede_id === tarefa.sede_id && normalizar(item.nome_tarefa) === nome)
        .map((item) => item.local_id),
    );
  }, [tarefas, tarefa]);
  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return destinos;
    return destinos.filter((local) =>
      normalizar(`${local.nome_local} ${local.andar} ${local.tipo_local}`).includes(termo),
    );
  }, [destinos, busca]);
  const selecionaveisVisiveis = visiveis.filter((local) => !locaisComTarefa.has(local.id));
  const todosVisiveisSelecionados =
    selecionaveisVisiveis.length > 0 &&
    selecionaveisVisiveis.every((local) => selecionados.has(local.id));

  useEffect(() => {
    setBusca("");
    setSelecionados(new Set());
    setErro("");
    setResultado("");
  }, [tarefa?.id]);

  function alternar(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  function alternarVisiveis() {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      for (const local of selecionaveisVisiveis) {
        if (todosVisiveisSelecionados) proximos.delete(local.id);
        else proximos.add(local.id);
      }
      return proximos;
    });
  }

  async function replicar() {
    if (!tarefa || selecionados.size === 0) return;
    setSalvando(true);
    setErro("");
    setResultado("");
    try {
      const resposta = await apiPost<{ criadas: number; ignoradas: Array<{ nome_local: string }> }>(
        `/api/tarefas/${tarefa.id}/replicar`,
        { locais_ids: [...selecionados] },
      );
      await aoConcluir();
      setSelecionados(new Set());
      setResultado(
        resposta.criadas > 0
          ? `${resposta.criadas} cópia(s) criada(s) e pronta(s) para aparecer na Agenda.`
          : "Nenhuma cópia foi criada; os locais selecionados já possuíam esta tarefa.",
      );
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : "Não foi possível replicar a tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  function fechar() {
    if (!salvando) aoFechar();
  }

  return (
    <Modal
      titulo={tarefa ? `Replicar — ${tarefa.nome_tarefa}` : "Replicar tarefa"}
      aberto={Boolean(tarefa)}
      aoFechar={fechar}
      larguraMax={760}
    >
      <div className="replicar-tarefa-intro">
        <span aria-hidden="true">↗</span>
        <div>
          <span className="rotulo">Uma tarefa, vários ambientes</span>
          <h3>Escolha os locais de destino.</h3>
          <p>Tempo, frequência, categoria, requisitos e demais regras serão copiados. A sede permanece a mesma.</p>
        </div>
      </div>

      <div className="replicar-tarefa-filtros">
        <label className="campo">
          <span className="rotulo">Buscar local</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, andar ou tipo…" />
        </label>
        <button type="button" className="btn btn-mini btn-fantasma" disabled={selecionaveisVisiveis.length === 0 || salvando} onClick={alternarVisiveis}>
          {todosVisiveisSelecionados ? "Desmarcar visíveis" : `Selecionar visíveis (${selecionaveisVisiveis.length})`}
        </button>
      </div>

      <div className="replicar-tarefa-lista">
        {visiveis.length === 0 && (
          <div className="replicar-tarefa-vazio">Nenhum local encontrado para esta busca.</div>
        )}
        {visiveis.map((local) => {
          const existente = locaisComTarefa.has(local.id);
          return (
            <label key={local.id} className={`replicar-tarefa-local${existente ? " existente" : ""}`}>
              <input
                type="checkbox"
                checked={existente || selecionados.has(local.id)}
                disabled={existente || salvando}
                onChange={() => alternar(local.id)}
              />
              <span>
                <strong>{local.nome_local}</strong>
                <small>{local.andar} · {local.tipo_local.replaceAll("_", " ")}</small>
              </span>
              {existente && <b className="selo selo-verde">Já possui</b>}
            </label>
          );
        })}
      </div>

      {resultado && <div className="alerta alerta-ok" style={{ marginTop: 14 }}>{resultado}</div>}
      {erro && <div className="alerta alerta-erro" style={{ marginTop: 14 }}>{erro}</div>}

      <div className="replicar-tarefa-acoes">
        <span><strong className="num">{selecionados.size}</strong> local(is) selecionado(s)</span>
        <div>
          <button type="button" className="btn" disabled={salvando} onClick={fechar}>Fechar</button>
          <button type="button" className="btn btn-primario" disabled={salvando || selecionados.size === 0} onClick={replicar}>
            {salvando ? "Replicando…" : `Criar ${selecionados.size} ${selecionados.size === 1 ? "cópia" : "cópias"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
