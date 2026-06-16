"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessaoUsuario } from "@/lib/permissions";

const ITENS: Array<{ href: string; rotulo: string; apenasAdmin?: boolean }> = [
  { href: "/rotinas", rotulo: "Rotina do dia" },
  { href: "/acompanhamento", rotulo: "Acompanhamento" },
  { href: "/eventuais", rotulo: "Eventuais" },
  { href: "/dashboard", rotulo: "Dashboard" },
  { href: "/relatorios", rotulo: "Relatórios" },
  { href: "/funcionarios", rotulo: "Funcionários" },
  { href: "/ausencias", rotulo: "Ausências" },
  { href: "/sedes", rotulo: "Sedes" },
  { href: "/locais", rotulo: "Locais" },
  { href: "/tarefas", rotulo: "Tarefas" },
  { href: "/tempos", rotulo: "Tempos por pessoa" },
  { href: "/categorias", rotulo: "Categorias", apenasAdmin: true },
  { href: "/parametros", rotulo: "Parâmetros" },
  { href: "/historico", rotulo: "Histórico" },
  { href: "/usuarios", rotulo: "Usuários", apenasAdmin: true },
];

const ROTULO_PERFIL: Record<string, string> = {
  administrador: "Admin",
  supervisor: "Supervisor",
  visualizador: "Gerência",
};

export default function AppShell({
  sessao,
  children,
}: {
  sessao: SessaoUsuario;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        className="nao-imprimir"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "10px 20px",
          background: "var(--tinta)",
          color: "var(--papel)",
          borderBottom: "3px solid var(--acento)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/rotinas" style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-horizontal-fundo-escuro.png"
            alt="Orkestria"
            style={{ height: 52, width: "auto", margin: "-8px 0", display: "block" }}
          />
        </Link>

        <nav style={{ display: "flex", gap: 2, flex: 1, overflowX: "auto" }}>
          {ITENS.filter(
            (item) => !item.apenasAdmin || sessao.perfil === "administrador",
          ).map((item) => {
            const ativo = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: "none",
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 3,
                  whiteSpace: "nowrap",
                  color: ativo ? "var(--tinta)" : "var(--papel-3)",
                  background: ativo ? "var(--papel)" : "transparent",
                }}
              >
                {item.rotulo}
              </Link>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="so-desktop" style={{ textAlign: "right", lineHeight: 1.2 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{sessao.nome}</div>
            <div
              className="rotulo"
              style={{ color: "var(--acento)", fontSize: 9 }}
            >
              {ROTULO_PERFIL[sessao.perfil] ?? sessao.perfil}
            </div>
          </div>
          <button
            onClick={sair}
            className="btn btn-mini"
            style={{ background: "transparent", color: "var(--papel)", borderColor: "var(--papel-3)", boxShadow: "none" }}
          >
            Sair
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: 20, maxWidth: 1600, width: "100%", margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
