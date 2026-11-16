"use client";

/**
 * Sistema › Empresas (decisão do dono, 13/11/2026): a lista FECHADA que o campo Empresa
 * do cadastro de funcionário oferece. Só o administrador. Empresa não se renomeia nem
 * se exclui (a mesma grafia vai para o Quadro da Infra): cadastra-se a nova e desativa-se
 * a antiga. O nome é gravado na grafia do Quadro ("Apel Filial 7" → "APEL 7").
 *
 * Página própria, não o CrudManager: a rota de empresas recebe o id no corpo do PUT, e o
 * único campo que muda depois de criada é "ativa".
 */
import { useState } from "react";
import useSWR from "swr";
import { apiPost, apiPut, ErroApi, fetcher } from "@/lib/clientApi";
import { normalizarEmpresa } from "@/lib/empresas";
import { useSessao } from "@/components/SessaoContexto";

interface EmpresaLinha {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function PaginaEmpresas() {
  const sessao = useSessao();
  const ehAdmin = sessao?.perfil === "administrador";
  const { data, mutate, isLoading } = useSWR<EmpresaLinha[]>(ehAdmin ? "/api/empresas?todas=1" : null, fetcher);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [gravando, setGravando] = useState(false);

  if (sessao && !ehAdmin)
    return <p style={{ color: "var(--tinta-2)" }}>Só o administrador mantém o cadastro de empresas.</p>;

  const previa = normalizarEmpresa(nome);

  const cadastrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setAviso("");
    setGravando(true);
    try {
      const nova = await apiPost<EmpresaLinha>("/api/empresas", { nome });
      setAviso(`${nova.nome} cadastrada.`);
      setNome("");
      await mutate();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível cadastrar.");
    } finally {
      setGravando(false);
    }
  };

  const alternar = async (emp: EmpresaLinha) => {
    setErro("");
    setAviso("");
    try {
      await apiPut("/api/empresas", { id: emp.id, ativo: !emp.ativo });
      setAviso(`${emp.nome} ${emp.ativo ? "desativada: sai da lista do cadastro de funcionários" : "reativada"}.`);
      await mutate();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível alterar.");
    }
  };

  const ativas = (data ?? []).filter((e) => e.ativo).length;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Empresas</h1>
        <p style={{ color: "var(--tinta-2)", marginTop: 2, maxWidth: 720 }}>
          As empresas que o cadastro de funcionário oferece. O nome é gravado na grafia do Quadro da Infra e não muda
          depois: se a empresa mudou, cadastre a nova e desative a antiga — quem já está nela continua com a ficha como está.
        </p>
      </div>

      <form onSubmit={(e) => void cadastrar(e)} className="painel" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="campo" style={{ flex: "1 1 260px" }}>
          <span className="rotulo">Nova empresa</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Apel Filial 16" maxLength={80} />
          {previa && previa !== nome.trim() && (
            <span style={{ fontSize: 11, color: "var(--tinta-3)" }}>Vai ser gravada como “{previa}”.</span>
          )}
        </label>
        <button type="submit" className="btn btn-primario" disabled={gravando || !previa}>
          {gravando ? "Cadastrando…" : "+ Cadastrar"}
        </button>
      </form>

      {erro && <div className="alerta alerta-erro" style={{ marginBottom: 12 }}>{erro}</div>}
      {aviso && <div className="alerta alerta-ok" style={{ marginBottom: 12 }}>{aviso}</div>}

      <div className="painel" style={{ overflow: "auto" }}>
        <table className="tabela">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Situação</th>
              <th style={{ textAlign: "right" }}>{data ? `${ativas} ativa(s) de ${data.length}` : ""}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} style={{ padding: 16 }}>Carregando…</td>
              </tr>
            )}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: "32px 16px", textAlign: "center", color: "var(--tinta-3)" }}>
                  Nenhuma empresa cadastrada. Sem elas, ninguém consegue ser cadastrado em Funcionários.
                </td>
              </tr>
            )}
            {(data ?? []).map((emp) => (
              <tr key={emp.id} style={emp.ativo ? undefined : { color: "var(--tinta-3)" }}>
                <td style={{ fontFamily: "var(--fonte-mono, monospace)" }}>{emp.nome}</td>
                <td>{emp.ativo ? "Ativa" : "Desativada"}</td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="btn btn-mini btn-fantasma" onClick={() => void alternar(emp)}>
                    {emp.ativo ? "Desativar" : "Reativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
