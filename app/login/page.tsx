"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost, ErroApi } from "@/lib/clientApi";

/** Blocos da "partitura" do palco — evocam a agenda (tarefas em horários). */
const PAUTAS = [
  [
    { left: "0%", width: "46%", cor: "var(--azul)", delay: 0.1 },
    { left: "52%", width: "30%", cor: "var(--verde)", delay: 0.25 },
  ],
  [{ left: "12%", width: "60%", cor: "var(--amarelo)", delay: 0.35 }],
  [
    { left: "0%", width: "26%", cor: "var(--verde)", delay: 0.45 },
    { left: "32%", width: "50%", cor: "var(--azul)", delay: 0.55 },
  ],
  [{ left: "8%", width: "38%", cor: "var(--acento)", delay: 0.65 }],
];

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
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

  function entrarComGoogle() {
    setErro("");
    setAviso(
      "O acesso pelo Google será habilitado em breve (depende da ativação do login individual). Por enquanto, entre com e-mail e senha.",
    );
  }

  return (
    <main className="login-split">
      {/* ── palco (marca + partitura) ── */}
      <section className="login-palco">
        <div className="entra">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-fundo-escuro.png"
            alt="Orkestria"
            style={{ width: 230, height: "auto", margin: "-40px 0 -46px -10px", display: "block" }}
          />
        </div>

        <div className="entra-2" style={{ maxWidth: 460 }}>
          <h1
            style={{
              fontFamily: "var(--fonte-display)",
              fontSize: 34,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            A rotina da sua equipe,
            <br />
            <span style={{ color: "#e3a9bc" }}>orquestrada.</span>
          </h1>
          <p style={{ color: "var(--papel-3)", marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
            Agenda visual em blocos de 30&nbsp;min, ocupação de jornada e
            ociosidade prevista&nbsp;×&nbsp;realizada — tudo num lugar só.
          </p>

          {/* partitura / agenda */}
          <div className="login-partitura" style={{ marginTop: 28 }}>
            {PAUTAS.map((blocos, i) => (
              <div className="login-pauta" key={i}>
                {blocos.map((b, j) => (
                  <span
                    key={j}
                    className="login-bloco"
                    style={
                      {
                        left: b.left,
                        width: b.width,
                        background: b.cor,
                        animationDelay: `${b.delay}s`,
                        // brilho começa após a entrada e cascateia bloco a bloco
                        "--brilho-delay": `${1.2 + (i * 2 + j) * 0.45}s`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="rotulo" style={{ color: "var(--papel-3)", letterSpacing: "0.14em" }}>
          Sistema de planejamento operacional · ASG
        </div>
      </section>

      {/* ── formulário ── */}
      <section className="login-painel">
        <div className="login-form">
          <div className="rotulo entra" style={{ color: "var(--acento)" }}>
            ▮ Acesso ao sistema
          </div>
          <h2
            className="entra"
            style={{
              fontFamily: "var(--fonte-display)",
              fontSize: 30,
              fontWeight: 600,
              marginTop: 6,
              marginBottom: 22,
            }}
          >
            Entrar
          </h2>

          <form onSubmit={entrar} style={{ display: "grid", gap: 14 }}>
            <label className="campo entra-2">
              <span className="rotulo">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supervisor@empresa.com"
                autoComplete="username"
                required
              />
            </label>
            <label className="campo entra-2">
              <span className="rotulo">Senha</span>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {erro && <div className="alerta alerta-erro">{erro}</div>}
            {aviso && <div className="alerta alerta-aviso">{aviso}</div>}

            <button
              type="submit"
              className="btn btn-primario entra-3"
              disabled={enviando}
              style={{ justifyContent: "center" }}
            >
              {enviando ? "Entrando…" : "Entrar →"}
            </button>

            <div className="login-divisor rotulo entra-3" style={{ margin: "2px 0" }}>
              ou
            </div>

            <button
              type="button"
              className="btn btn-google entra-3"
              onClick={entrarComGoogle}
            >
              <GoogleG />
              Entrar com Google
            </button>
          </form>

          <p style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 20, lineHeight: 1.5 }}>
            Demo: <code className="num">admin@empresa.com</code> ·{" "}
            <code className="num">supervisor.aldeota@empresa.com</code> — senha{" "}
            <code className="num">mudar123</code>
          </p>
        </div>
      </section>
    </main>
  );
}
