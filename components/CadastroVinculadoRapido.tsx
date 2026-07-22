"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { apiPost, ErroApi } from "@/lib/clientApi";
import type { Categoria, Funcionario, Local, Requisito, Sede } from "@/types";

export type TipoVinculoRapido = "local" | "categoria" | "requisito" | "funcionario";
export type RegistroVinculado = Local | Categoria | Requisito | Funcionario;

const TITULOS: Record<TipoVinculoRapido, string> = {
  local: "Novo local sem perder o cadastro",
  categoria: "Nova categoria sem perder o cadastro",
  requisito: "Novo requisito sem perder o cadastro",
  funcionario: "Novo funcionário sem perder o cadastro",
};

export default function CadastroVinculadoRapido({
  tipo,
  sedes,
  aoFechar,
  aoCriado,
}: {
  tipo: TipoVinculoRapido | null;
  sedes: Sede[];
  aoFechar: () => void;
  aoCriado: (registro: RegistroVinculado, tipo: TipoVinculoRapido) => Promise<void> | void;
}) {
  const [nome, setNome] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [tipoLocal, setTipoLocal] = useState("sala");
  const [andar, setAndar] = useState("Térreo");
  const [tipoRequisito, setTipoRequisito] = useState("treinamento");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState("#9C0D38");
  const [cargo, setCargo] = useState("ASG");
  const [genero, setGenero] = useState("");
  const [entrada, setEntrada] = useState("08:00");
  const [saida, setSaida] = useState("17:00");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!tipo) return;
    setNome("");
    setDescricao("");
    setErro("");
  }, [tipo]);

  useEffect(() => {
    if (!tipo || sedeId) return;
    setSedeId(sedes.find((sede) => sede.ativo)?.id || "");
  }, [tipo, sedeId, sedes]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) return;
    setSalvando(true);
    setErro("");
    try {
      let criado: RegistroVinculado;
      if (tipo === "local") {
        criado = await apiPost<Local>("/api/locais", {
          sede_id: sedeId,
          nome_local: nome.trim(),
          andar: andar.trim() || "Térreo",
          tipo_local: tipoLocal,
          metragem: 0,
          fator_intensidade: 0,
          ativo: true,
          observacoes: "",
        });
      } else if (tipo === "categoria") {
        criado = await apiPost<Categoria>("/api/categorias", {
          nome: nome.trim(),
          descricao: descricao.trim(),
          cor,
          fator_intensidade: 1,
          ativo: true,
        });
      } else if (tipo === "requisito") {
        criado = await apiPost<Requisito>("/api/requisitos", {
          nome: nome.trim(),
          tipo: tipoRequisito,
          descricao: descricao.trim(),
          ativo: true,
        });
      } else {
        criado = await apiPost<Funcionario>("/api/funcionarios", {
          nome: nome.trim(),
          genero,
          sede_id: sedeId,
          turno: "integral",
          entrada,
          saida,
          intervalo_min: 60,
          intervalo_inicio: "12:00",
          intervalo_fim: "13:00",
          intervalos: "12:00-13:00",
          escala: "seg_sex",
          entrada_sabado: "",
          saida_sabado: "",
          cargo: cargo.trim() || "ASG",
          ativo: true,
          observacoes: "Cadastro essencial; complete os detalhes na tela de Funcionários.",
        });
      }
      await aoCriado(criado, tipo);
      aoFechar();
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : "Não foi possível criar o vínculo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={tipo ? TITULOS[tipo] : "Novo vínculo"} aberto={tipo !== null} aoFechar={() => !salvando && aoFechar()} larguraMax={560}>
      {tipo && (
        <form className="form-grade cadastro-vinculado-form" onSubmit={salvar}>
          <div className="cadastro-vinculado-intro">
            <span className="num">＋</span>
            <div>
              <strong>Cadastre somente o essencial agora</strong>
              <small>Ao salvar, o novo item volta selecionado no formulário anterior.</small>
            </div>
          </div>

          <label className="campo" style={{ gridColumn: "1 / -1" }}>
            <span className="rotulo">{tipo === "funcionario" ? "Nome do funcionário" : "Nome"} *</span>
            <input autoFocus required value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>

          {(tipo === "local" || tipo === "funcionario") && (
            <label className="campo">
              <span className="rotulo">Sede *</span>
              <select required value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
                <option value="">— selecionar —</option>
                {sedes.filter((sede) => sede.ativo).map((sede) => <option key={sede.id} value={sede.id}>{sede.nome_sede}</option>)}
              </select>
            </label>
          )}

          {tipo === "local" && (
            <>
              <label className="campo">
                <span className="rotulo">Tipo</span>
                <select value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value)}>
                  <option value="sala">Sala</option><option value="banheiro">Banheiro</option>
                  <option value="corredor">Corredor</option><option value="area_comum">Área comum</option>
                  <option value="area_externa">Área externa</option><option value="copa">Copa</option>
                  <option value="escada">Escada</option><option value="recepcao">Recepção</option>
                  <option value="auditorio">Auditório</option><option value="almoxarifado">Almoxarifado</option>
                  <option value="outros">Outros</option>
                </select>
              </label>
              <label className="campo" style={{ gridColumn: "1 / -1" }}>
                <span className="rotulo">Andar</span>
                <input value={andar} onChange={(e) => setAndar(e.target.value)} />
              </label>
            </>
          )}

          {tipo === "categoria" && (
            <label className="campo">
              <span className="rotulo">Cor de identificação</span>
              <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
            </label>
          )}

          {tipo === "requisito" && (
            <label className="campo">
              <span className="rotulo">Tipo</span>
              <select value={tipoRequisito} onChange={(e) => setTipoRequisito(e.target.value)}>
                <option value="aptidao">Aptidão</option>
                <option value="treinamento">Treinamento</option>
                <option value="epi">EPI</option>
              </select>
            </label>
          )}

          {(tipo === "categoria" || tipo === "requisito") && (
            <label className="campo" style={{ gridColumn: "1 / -1" }}>
              <span className="rotulo">Descrição</span>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </label>
          )}

          {tipo === "funcionario" && (
            <>
              <label className="campo">
                <span className="rotulo">Cargo</span>
                <input value={cargo} onChange={(e) => setCargo(e.target.value)} />
              </label>
              <label className="campo">
                <span className="rotulo">Gênero</span>
                <select value={genero} onChange={(e) => setGenero(e.target.value)}>
                  <option value="">Não informar agora</option>
                  <option value="feminino">Feminino</option>
                  <option value="masculino">Masculino</option>
                </select>
              </label>
              <label className="campo"><span className="rotulo">Entrada *</span><input required type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} /></label>
              <label className="campo"><span className="rotulo">Saída *</span><input required type="time" value={saida} onChange={(e) => setSaida(e.target.value)} /></label>
            </>
          )}

          {erro && <div className="alerta alerta-erro" style={{ gridColumn: "1 / -1" }}>{erro}</div>}
          <div className="crud-acoes-form">
            <button type="button" className="btn" disabled={salvando} onClick={aoFechar}>Voltar</button>
            <button type="submit" className="btn btn-primario" disabled={salvando}>{salvando ? "Criando…" : "Criar e selecionar"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
