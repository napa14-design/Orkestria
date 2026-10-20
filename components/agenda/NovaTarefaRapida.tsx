"use client";

/**
 * "+ Nova tarefa" da paleta da Rotina: cria a tarefa (e, se faltar, o local)
 * sem sair da agenda. Pedido da reunião de coordenadores de 19/10/2026 — quem
 * monta o dia descobria ali que a tarefa ("plantão do esporte") não existia e
 * tinha de largar a agenda, ir a Estrutura › Locais, depois a Tarefas, e voltar.
 *
 * ⚠️ Exceção à doutrina decidida pelo dono (docs/00-doutrina.md: ferramenta de
 * implantação não mora no fluxo da Agenda): o botão é fixo de propósito. Só o
 * essencial fica aqui (nome, local, tempo, categoria); o resto da tarefa —
 * regra de cálculo, frequência, requisitos, janela — continua em Estrutura ›
 * Tarefas, com os padrões do cadastro (tempo fixo, diária, prioridade média).
 */
import { useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import { locaisDoFormulario } from "@/lib/agenda";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import type { Categoria, Local, Tarefa, TipoLocalCatalogo } from "@/types";

export default function NovaTarefaRapida({
  aberto,
  aoFechar,
  sedeId,
  nomeInicial,
  locais,
  aoCriada,
  aoLocalCriado,
}: {
  aberto: boolean;
  aoFechar: () => void;
  sedeId: string;
  /** O que estava digitado na busca da paleta — quem procurou e não achou. */
  nomeInicial: string;
  /** Locais da sede da agenda. */
  locais: Local[];
  aoCriada: (tarefa: Tarefa) => void;
  /** O local nasceu (a tarefa pode ainda falhar): o pai revalida a lista. */
  aoLocalCriado?: () => void;
}) {
  const { data: categorias } = useSWR<Categoria[]>(aberto ? "/api/categorias" : null, fetcher);
  const { data: tipos } = useSWR<TipoLocalCatalogo[]>(aberto ? "/api/tipos-local" : null, fetcher);
  const [nome, setNome] = useState(nomeInicial);
  const [localId, setLocalId] = useState("");
  const [tempo, setTempo] = useState("30");
  const [categoriaId, setCategoriaId] = useState("");
  // Local que ainda não existe: nasce junto com a tarefa.
  const [novoLocal, setNovoLocal] = useState(false);
  const [nomeLocal, setNomeLocal] = useState("");
  const [andar, setAndar] = useState("Térreo");
  const [tipoLocal, setTipoLocal] = useState("sala");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Local criado aqui: entra na lista na hora, mesmo que a tarefa falhe depois.
  const [localCriado, setLocalCriado] = useState<Local | null>(null);

  const ativos = locaisDoFormulario(locais, sedeId, localCriado);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Dê um nome à tarefa.");
    if (novoLocal ? !nomeLocal.trim() : !localId) return setErro("Escolha o local — ou crie um novo.");
    const minutos = Number(tempo);
    if (!(minutos > 0)) return setErro("O tempo precisa ser maior que zero.");
    setSalvando(true);
    try {
      let local = localId;
      if (novoLocal) {
        const criado = await apiPost<Local>("/api/locais", {
          sede_id: sedeId,
          nome_local: nomeLocal.trim(),
          andar: andar.trim() || "Térreo",
          tipo_local: tipoLocal,
          metragem: 0,
          ativo: true,
          observacoes: "",
        });
        local = criado.id;
        // Daqui em diante é um local que existe: um erro na tarefa não o recria
        // — ele aparece escolhido na lista, e o pai já fica sabendo dele.
        setLocalCriado(criado);
        setNovoLocal(false);
        setNomeLocal("");
        setLocalId(criado.id);
        aoLocalCriado?.();
      }
      const tarefa = await apiPost<Tarefa>("/api/tarefas", {
        nome_tarefa: nome.trim(),
        local_id: local,
        categoria_id: categoriaId,
        tipo_tarefa: "",
        regra_calculo: "fixo",
        tempo_base_min: minutos,
        quantidade: 1,
        frequencia: "diaria",
        prioridade: "media",
        ativo: true,
        observacoes: "",
      });
      aoCriada(tarefa);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível criar a tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  const opcoesTipo = (tipos ?? []).filter((t) => t.ativo);

  return (
    <Modal titulo="Nova tarefa" aberto={aberto} aoFechar={aoFechar} larguraMax={520}>
      <form onSubmit={salvar} className="form-grade">
        <label className="campo" style={{ gridColumn: "1 / -1" }}>
          <span className="rotulo">Nome da tarefa</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Plantão do esporte" />
        </label>

        {!novoLocal ? (
          <label className="campo" style={{ gridColumn: "1 / -1" }}>
            <span className="rotulo" style={{ display: "flex", justifyContent: "space-between" }}>
              Local
              <button type="button" className="btn btn-mini btn-fantasma" onClick={() => setNovoLocal(true)}>
                + novo local
              </button>
            </span>
            <select value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Escolha…</option>
              {ativos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome_local} ({l.andar})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <fieldset style={{ gridColumn: "1 / -1", border: "1.5px dashed var(--linha)", padding: 10, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
            <legend className="rotulo" style={{ padding: "0 4px" }}>
              Novo local nesta sede{" "}
              <button type="button" className="btn btn-mini btn-fantasma" onClick={() => setNovoLocal(false)}>
                usar um existente
              </button>
            </legend>
            <label className="campo" style={{ gridColumn: "1 / -1" }}>
              <span className="rotulo">Nome do local</span>
              <input value={nomeLocal} onChange={(e) => setNomeLocal(e.target.value)} placeholder="Ex.: Quadra coberta" />
            </label>
            <label className="campo">
              <span className="rotulo">Andar</span>
              <input value={andar} onChange={(e) => setAndar(e.target.value)} />
            </label>
            <label className="campo">
              <span className="rotulo">Tipo</span>
              <select value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value)}>
                {opcoesTipo.length === 0 && <option value="sala">Sala</option>}
                {opcoesTipo.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}

        <label className="campo">
          <span className="rotulo">Tempo (min)</span>
          <input type="number" min={1} value={tempo} onChange={(e) => setTempo(e.target.value)} />
        </label>
        <label className="campo">
          <span className="rotulo">Categoria</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">—</option>
            {(categorias ?? [])
              .filter((c) => c.ativo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </label>

        <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, color: "var(--tinta-3)" }}>
          Nasce diária, de tempo fixo e prioridade média. Requisitos, frequência e janela de horário se ajustam em
          Estrutura › Tarefas.
        </p>
        {erro && (
          <div className="alerta alerta-erro" style={{ gridColumn: "1 / -1" }}>
            {erro}
          </div>
        )}
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={salvando}>
            {salvando ? "Criando…" : "Criar tarefa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
