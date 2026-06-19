import Link from "next/link";
import { obterSessao } from "@/lib/session";

/** Tela inicial orientadora: saudação, primeiros passos e atalhos. */
const PASSOS = [
  { n: 1, href: "/sedes", titulo: "Sedes", desc: "As unidades atendidas." },
  { n: 2, href: "/locais", titulo: "Locais", desc: "Os ambientes de cada sede (salas, banheiros…)." },
  { n: 3, href: "/tarefas", titulo: "Tarefas", desc: "Os serviços executados em cada local." },
  { n: 4, href: "/funcionarios", titulo: "Funcionários", desc: "A equipe, com horário e sede." },
  { n: 5, href: "/rotinas", titulo: "Montar a rotina", desc: "Arraste as tarefas para a agenda de cada um." },
];

const ATALHOS = [
  { emoji: "📅", href: "/rotinas", titulo: "Rotina do dia", desc: "Monte a agenda arrastando tarefas." },
  { emoji: "🗒️", href: "/conferir", titulo: "Conferir ficha", desc: "Suba a foto da ficha e registre o feito." },
  { emoji: "📊", href: "/dashboard", titulo: "Dashboard", desc: "Ocupação, ociosidade e desvios." },
  { emoji: "✅", href: "/acompanhamento", titulo: "Acompanhamento", desc: "Previsto × realizado do dia." },
];

const cartao: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "inherit",
  border: "1.5px solid var(--tinta)",
  borderRadius: "var(--raio)",
  background: "var(--cartao)",
  padding: 16,
  boxShadow: "var(--sombra-leve)",
};

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  const primeiroNome = sessao?.nome?.split(" ")[0] ?? "";

  return (
    <div className="entra" style={{ maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 30, fontWeight: 800 }}>
        Olá{primeiroNome ? `, ${primeiroNome}` : ""} 👋
      </h1>
      <p style={{ color: "var(--tinta-2)", marginTop: 4, marginBottom: 22 }}>
        Bem-vindo ao Orkestria. Por onde quer começar?
      </p>

      {/* atalhos do dia a dia */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {ATALHOS.map((a) => (
          <Link key={a.href} href={a.href} style={cartao} className="cartao-atalho">
            <div style={{ fontSize: 26, marginBottom: 6 }}>{a.emoji}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{a.titulo}</div>
            <div style={{ fontSize: 13, color: "var(--tinta-3)", marginTop: 2 }}>{a.desc}</div>
          </Link>
        ))}
      </div>

      {/* primeiros passos (configuração inicial) */}
      <div className="painel" style={{ padding: 18 }}>
        <div className="rotulo" style={{ color: "var(--acento)", marginBottom: 4 }}>
          Comece por aqui
        </div>
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 14 }}>
          Configurando pela primeira vez? Siga esta ordem — cada passo depende do anterior.
        </p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {PASSOS.map((p) => (
            <li key={p.n}>
              <Link
                href={p.href}
                style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--tinta)",
                    color: "var(--papel)",
                    fontFamily: "var(--fonte-mono)",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                  }}
                >
                  {p.n}
                </span>
                <span>
                  <strong>{p.titulo}</strong>{" "}
                  <span style={{ color: "var(--tinta-3)", fontSize: 13 }}>— {p.desc}</span>
                </span>
                <span style={{ marginLeft: "auto", color: "var(--acento)" }}>→</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
