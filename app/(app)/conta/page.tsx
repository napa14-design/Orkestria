"use client";

/** Minha conta: o próprio usuário define/troca a sua senha individual. */
import { useState } from "react";
import { apiPost, ErroApi } from "@/lib/clientApi";
import { MIN_SENHA } from "@/lib/sessionConstants";

export default function PaginaConta() {
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha !== conf) {
      setEstado("erro");
      setMsg("As senhas não conferem.");
      return;
    }
    setEstado("enviando");
    setMsg("");
    try {
      await apiPost("/api/auth/senha", { senha });
      setEstado("ok");
      setMsg("Senha atualizada. Use-a no próximo login.");
      setSenha("");
      setConf("");
    } catch (err) {
      setEstado("erro");
      setMsg(err instanceof ErroApi ? err.message : "Erro ao salvar.");
    }
  }

  return (
    <div className="entra" style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 2 }}>Minha conta</h1>
      <p style={{ color: "var(--tinta-2)", marginBottom: 16 }}>
        Troque a sua senha quando quiser. Ela tem ao menos {MIN_SENHA} caracteres, e ninguém no
        sistema — nem o administrador — consegue vê-la.
      </p>

      <form onSubmit={salvar} className="painel" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label className="campo">
          <span className="rotulo">Nova senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" minLength={MIN_SENHA} required />
        </label>
        <label className="campo">
          <span className="rotulo">Confirmar senha</span>
          <input type="password" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" minLength={MIN_SENHA} required />
        </label>
        {msg && <div className={`alerta ${estado === "erro" ? "alerta-erro" : "alerta-ok"}`}>{msg}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primario" disabled={estado === "enviando" || senha.length < MIN_SENHA}>
            {estado === "enviando" ? "Salvando…" : "Salvar senha"}
          </button>
        </div>
      </form>
    </div>
  );
}
