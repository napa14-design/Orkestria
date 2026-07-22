"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useSessao } from "@/components/SessaoContext";
import { apiPost, ErroApi } from "@/lib/clientApi";
import {
  atualizarPreferenciasOperacionais,
  chavePreferenciasOperacionais,
  lerPreferenciasOperacionais,
  type PadraoCadastroRapido,
} from "@/lib/preferenciasOperacionais";
import type { Categoria, Local, Tarefa } from "@/types";

const TIPOS_LOCAL = [
  ["sala", "Sala"],
  ["banheiro", "Banheiro"],
  ["corredor", "Corredor"],
  ["area_comum", "Área comum"],
  ["area_externa", "Área externa"],
  ["copa", "Copa"],
  ["escada", "Escada"],
  ["recepcao", "Recepção"],
  ["auditorio", "Auditório"],
  ["almoxarifado", "Almoxarifado"],
  ["outros", "Outros"],
] as const;

export default function CadastroRapidoAgenda({
  aberto,
  sedeId,
  locais,
  categorias,
  aoFechar,
  aoLocalCriado,
  aoTarefaCriada,
}: {
  aberto: boolean;
  sedeId: string;
  locais: Local[];
  categorias: Categoria[];
  aoFechar: () => void;
  aoLocalCriado: (local: Local) => Promise<void> | void;
  aoTarefaCriada: (tarefa: Tarefa) => Promise<void> | void;
}) {
  const sessao = useSessao();
  const [etapa, setEtapa] = useState<"tarefa" | "local">("tarefa");
  const [nomeTarefa, setNomeTarefa] = useState("");
  const [localId, setLocalId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tempo, setTempo] = useState("30");
  const [frequencia, setFrequencia] = useState("diaria");
  const [nomeLocal, setNomeLocal] = useState("");
  const [tipoLocal, setTipoLocal] = useState("sala");
  const [andar, setAndar] = useState("Térreo");
  const [metragem, setMetragem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [padraoRetomado, setPadraoRetomado] = useState<PadraoCadastroRapido | null>(null);
  const preferenciaAplicadaRef = useRef("");

  const chavePreferencias = useMemo(
    () => chavePreferenciasOperacionais(sessao.id, sedeId),
    [sessao.id, sedeId],
  );

  const locaisAtivos = locais.filter((local) => local.ativo);

  useEffect(() => {
    if (!aberto) {
      preferenciaAplicadaRef.current = "";
      return;
    }
    if (preferenciaAplicadaRef.current === chavePreferencias) return;
    preferenciaAplicadaRef.current = chavePreferencias;
    const padrao = lerPreferenciasOperacionais(chavePreferencias).cadastro_rapido;
    if (!padrao) {
      setPadraoRetomado(null);
      return;
    }
    setTempo(padrao.tempo);
    setFrequencia(padrao.frequencia);
    setCategoriaId(padrao.categoria_id);
    setPadraoRetomado(padrao);
  }, [aberto, chavePreferencias]);

  useEffect(() => {
    if (!aberto || !categoriaId || categorias.length === 0) return;
    if (!categorias.some((categoria) => categoria.ativo && categoria.id === categoriaId)) {
      setCategoriaId("");
    }
  }, [aberto, categoriaId, categorias]);

  useEffect(() => {
    if (!aberto || localId || locaisAtivos.length !== 1) return;
    setLocalId(locaisAtivos[0].id);
  }, [aberto, localId, locaisAtivos]);

  function fechar() {
    if (salvando) return;
    setEtapa("tarefa");
    setErro("");
    aoFechar();
  }

  async function salvarLocal(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const novo = await apiPost<Local>("/api/locais", {
        sede_id: sedeId,
        nome_local: nomeLocal.trim(),
        andar: andar.trim() || "Térreo",
        tipo_local: tipoLocal,
        metragem: Number(metragem || 0),
        fator_intensidade: 0,
        ativo: true,
        observacoes: "",
      });
      await aoLocalCriado(novo);
      setLocalId(novo.id);
      setNomeLocal("");
      setMetragem("");
      setEtapa("tarefa");
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : "Não foi possível cadastrar o local.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarTarefa(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const nova = await apiPost<Tarefa>("/api/tarefas", {
        nome_tarefa: nomeTarefa.trim(),
        tipo_tarefa: "",
        local_id: localId,
        categoria_id: categoriaId,
        regra_calculo: "fixo",
        tipo_servico: "rotina",
        tempo_base_min: Number(tempo),
        quantidade: 1,
        frequencia,
        prioridade: "media",
        restricao_genero: "",
        tempo_referencia: false,
        presenca: false,
        critica: false,
        requisitos: "",
        janela_inicio: "",
        janela_fim: "",
        dias_semana: "",
        depende_calendario: false,
        ativo: true,
        observacoes: "",
      });
      atualizarPreferenciasOperacionais(chavePreferencias, {
        cadastro_rapido: { tempo, frequencia, categoria_id: categoriaId },
      });
      await aoTarefaCriada(nova);
      setNomeTarefa("");
      setCategoriaId("");
      setTempo("30");
      setFrequencia("diaria");
      setEtapa("tarefa");
      aoFechar();
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : "Não foi possível cadastrar a tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={etapa === "local" ? "Novo local, sem sair da Agenda" : "Nova tarefa rápida"}
      aberto={aberto}
      aoFechar={fechar}
      larguraMax={620}
    >
      <div className="cadastro-rapido-intro">
        <span className="num">{etapa === "tarefa" ? "01" : "01A"}</span>
        <div>
          <strong>{etapa === "tarefa" ? "Cadastre o essencial" : "Crie o ambiente que está faltando"}</strong>
          <small>
            {etapa === "tarefa"
              ? "Ao salvar, a tarefa fica selecionada para você clicar diretamente no horário da grade."
              : "A sede atual será usada automaticamente e o novo local voltará selecionado na tarefa."}
          </small>
        </div>
      </div>

      {etapa === "tarefa" && padraoRetomado && (
        <div className="cadastro-rapido-memoria">
          <span aria-hidden="true">↻</span>
          <div>
            <strong>Seu último padrão foi retomado</strong>
            <small>
              {padraoRetomado.tempo} min · {padraoRetomado.frequencia.replace("_", " ")}
              {padraoRetomado.categoria_id
                ? ` · ${categorias.find((categoria) => categoria.id === padraoRetomado.categoria_id)?.nome ?? "categoria anterior"}`
                : " · sem categoria"}
            </small>
          </div>
          <button
            type="button"
            onClick={() => {
              setTempo("30");
              setFrequencia("diaria");
              setCategoriaId("");
              setPadraoRetomado(null);
            }}
          >
            Usar padrão inicial
          </button>
        </div>
      )}

      {etapa === "local" ? (
        <form className="cadastro-rapido-form" onSubmit={salvarLocal}>
          <label className="campo inteira">
            <span className="rotulo">Nome do local *</span>
            <input autoFocus required value={nomeLocal} onChange={(e) => setNomeLocal(e.target.value)} placeholder="Ex.: Banheiro do térreo" />
          </label>
          <label className="campo">
            <span className="rotulo">Tipo *</span>
            <select value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value)}>
              {TIPOS_LOCAL.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </label>
          <label className="campo">
            <span className="rotulo">Andar</span>
            <input value={andar} onChange={(e) => setAndar(e.target.value)} />
          </label>
          <label className="campo inteira">
            <span className="rotulo">Metragem aproximada</span>
            <input type="number" min="0" step="0.1" value={metragem} onChange={(e) => setMetragem(e.target.value)} placeholder="Pode completar depois" />
          </label>
          {erro && <div className="alerta alerta-erro inteira">{erro}</div>}
          <div className="cadastro-rapido-acoes inteira">
            <button type="button" className="btn" disabled={salvando} onClick={() => { setErro(""); setEtapa("tarefa"); }}>Voltar à tarefa</button>
            <button type="submit" className="btn btn-primario" disabled={salvando}>{salvando ? "Criando…" : "Criar e usar este local"}</button>
          </div>
        </form>
      ) : (
        <form className="cadastro-rapido-form" onSubmit={salvarTarefa}>
          <label className="campo inteira">
            <span className="rotulo">O que será feito? *</span>
            <input autoFocus required value={nomeTarefa} onChange={(e) => setNomeTarefa(e.target.value)} placeholder="Ex.: Higienizar banheiro" />
          </label>
          <label className="campo inteira">
            <span className="rotulo">Onde? *</span>
            <select required value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">— selecionar local —</option>
              {locaisAtivos.map((local) => <option key={local.id} value={local.id}>{local.nome_local} · {local.andar}</option>)}
            </select>
            <button type="button" className="cadastro-rapido-link" onClick={() => { setErro(""); setEtapa("local"); }}>＋ O local ainda não existe</button>
          </label>
          <label className="campo">
            <span className="rotulo">Tempo previsto *</span>
            <select value={tempo} onChange={(e) => setTempo(e.target.value)}>
              {[[15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 h"], [90, "1 h 30"], [120, "2 h"]].map(([min, rotulo]) => <option key={min} value={min}>{rotulo}</option>)}
            </select>
          </label>
          <label className="campo">
            <span className="rotulo">Frequência</span>
            <select value={frequencia} onChange={(e) => setFrequencia(e.target.value)}>
              <option value="diaria">Diária</option>
              <option value="semanal">Semanal</option>
              <option value="quinzenal">Quinzenal</option>
              <option value="mensal">Mensal</option>
              <option value="sob_demanda">Sob demanda</option>
            </select>
          </label>
          <label className="campo inteira">
            <span className="rotulo">Categoria</span>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sem categoria por enquanto</option>
              {categorias.filter((categoria) => categoria.ativo).map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
            </select>
          </label>
          {erro && <div className="alerta alerta-erro inteira">{erro}</div>}
          <div className="cadastro-rapido-acoes inteira">
            <button type="button" className="btn" disabled={salvando} onClick={fechar}>Cancelar</button>
            <button type="submit" className="btn btn-primario" disabled={salvando || !sedeId}>{salvando ? "Criando…" : "Criar e usar na Agenda"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
