"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost, ErroApi } from "@/lib/clientApi";

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await apiPost("/api/auth/login", { email, senha });
      router.push("/rotinas");
      router.refresh();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Falha ao entrar.");
      setEnviando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="entra" style={{ width: "100%", maxWidth: 420 }}>
        {/* marca — arte oficial da logo (PNG transparente) */}
        <div style={{ marginBottom: 8, textAlign: "center" }}>
          <h1 style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Orkestria
          </h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-fundo-claro.png"
            alt="Orkestria — Planeje, Distribua, Otimize, Evolua"
            width={400}
            height={400}
            style={{ margin: "-60px auto -70px", display: "block" }}
          />
          <p style={{ color: "var(--tinta-2)" }}>
            Orquestre as rotinas da sua equipe: agenda visual, ocupação de
            jornada e ociosidade prevista × realizada.
          </p>
        </div>

        <form onSubmit={entrar} className="painel" style={{ padding: 24, display: "grid", gap: 16 }}>
          <div className="campo">
            <span className="rotulo">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supervisor@empresa.com"
              autoComplete="username"
              required
            />
          </div>
          <div className="campo">
            <span className="rotulo">Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {erro && <div className="alerta alerta-erro">{erro}</div>}
          <button type="submit" className="btn btn-primario" disabled={enviando} style={{ justifyContent: "center" }}>
            {enviando ? "Entrando…" : "Entrar →"}
          </button>
          <p style={{ fontSize: 12, color: "var(--tinta-3)" }}>
            Demo: <code className="num">admin@empresa.com</code> /{" "}
            <code className="num">supervisor.aldeota@empresa.com</code> — senha{" "}
            <code className="num">mudar123</code>
          </p>
        </form>
      </div>
    </main>
  );
}
