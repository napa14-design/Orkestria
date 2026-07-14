"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SWRConfig } from "swr";
import type { SessaoUsuario } from "@/lib/permissions";

type Item = { href: string; rotulo: string; apenasAdmin?: boolean };
type Grupo = { rotulo: string; itens: Item[] };

/** Menu organizado por intenção: do dia a dia → números → cadastros → sistema. */
const GRUPOS: Grupo[] = [
  {
    rotulo: "Operação",
    itens: [
      { href: "/inicio", rotulo: "Início" },
      { href: "/rotinas", rotulo: "Rotina do dia" },
      { href: "/acompanhamento", rotulo: "Acompanhamento" },
      { href: "/conferir", rotulo: "Conferir ficha" },
      { href: "/eventuais", rotulo: "Serviços eventuais" },
      { href: "/remanejo", rotulo: "Remanejo entre sedes", apenasAdmin: true },
    ],
  },
  {
    rotulo: "Painéis",
    itens: [
      { href: "/dashboard", rotulo: "Dashboard" },
      { href: "/panorama", rotulo: "Panorama de sedes" },
      { href: "/capacitacoes", rotulo: "Capacitações" },
      { href: "/produtividade", rotulo: "Produtividade" },
      { href: "/relatorios", rotulo: "Relatórios" },
    ],
  },
  {
    rotulo: "Pessoas",
    itens: [
      { href: "/funcionarios", rotulo: "Funcionários" },
      { href: "/ausencias", rotulo: "Ausências" },
      { href: "/tempos", rotulo: "Tempos por pessoa" },
      { href: "/qualificacoes", rotulo: "Qualificações" },
    ],
  },
  {
    rotulo: "Estrutura",
    itens: [
      { href: "/importar", rotulo: "Importar rota (planilha)" },
      { href: "/sedes", rotulo: "Sedes" },
      { href: "/locais", rotulo: "Locais" },
      { href: "/tarefas", rotulo: "Tarefas" },
      { href: "/categorias", rotulo: "Categorias", apenasAdmin: true },
      { href: "/requisitos", rotulo: "Requisitos", apenasAdmin: true },
      { href: "/periodos-letivos", rotulo: "Calendário acadêmico", apenasAdmin: true },
    ],
  },
  {
    rotulo: "Sistema",
    itens: [
      { href: "/da-ata", rotulo: "Da ata ao sistema" },
      { href: "/parametros", rotulo: "Parâmetros" },
      { href: "/historico", rotulo: "Histórico" },
      { href: "/usuarios", rotulo: "Usuários", apenasAdmin: true },
    ],
  },
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
  const [aberto, setAberto] = useState<string | null>(null);
  const fecharTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // fecha o dropdown ao trocar de página
  useEffect(() => setAberto(null), [pathname]);

  const ehAdmin = sessao.perfil === "administrador";
  const visiveis = (g: Grupo) => g.itens.filter((i) => !i.apenasAdmin || ehAdmin);
  const grupoAtivo = (g: Grupo) => visiveis(g).some((i) => pathname.startsWith(i.href));

  // pequeno atraso ao sair, para o mouse cruzar o vão até o painel
  function abrir(rotulo: string) {
    if (fecharTimer.current) clearTimeout(fecharTimer.current);
    setAberto(rotulo);
  }
  function agendarFechar() {
    if (fecharTimer.current) clearTimeout(fecharTimer.current);
    fecharTimer.current = setTimeout(() => setAberto(null), 120);
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <SWRConfig
      value={{
        // Mantém os dados anteriores enquanto revalida ou ao trocar de chave —
        // assim a agenda não desmonta (não pisca nem "some") a cada atualização.
        keepPreviousData: true,
        // Não refazer toda busca a cada foco/reconexão: evita flicker e
        // reduz leituras do Firestore. As mutações já mantêm a tela fresca.
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        className="nao-imprimir"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 20px",
          background: "var(--tinta)",
          color: "var(--papel)",
          borderBottom: "3px solid var(--acento)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/inicio" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-horizontal-fundo-escuro.png"
            alt="Orkestria"
            style={{ height: 30, width: "auto", display: "block" }}
          />
        </Link>

        <nav style={{ display: "flex", gap: 2, flex: 1, flexWrap: "wrap" }}>
          {GRUPOS.map((g) => {
            const itens = visiveis(g);
            if (itens.length === 0) return null;
            const estaAberto = aberto === g.rotulo;
            return (
              <div
                key={g.rotulo}
                style={{ position: "relative", display: "flex", alignItems: "center", alignSelf: "stretch" }}
                onMouseEnter={() => abrir(g.rotulo)}
                onMouseLeave={agendarFechar}
              >
                <button
                  type="button"
                  className={`nav-trigger${grupoAtivo(g) ? " ativo" : ""}${estaAberto ? " aberto" : ""}`}
                  aria-haspopup="true"
                  aria-expanded={estaAberto}
                  onClick={() => setAberto(estaAberto ? null : g.rotulo)}
                >
                  {g.rotulo}
                  <span className="nav-caret">▾</span>
                </button>

                {estaAberto && (
                  <div className="nav-drop" role="menu">
                    <div className="nav-drop-titulo rotulo">{g.rotulo}</div>
                    {itens.map((i) => (
                      <Link
                        key={i.href}
                        href={i.href}
                        role="menuitem"
                        className={`nav-drop-item${pathname.startsWith(i.href) ? " ativo" : ""}`}
                        onClick={() => setAberto(null)}
                      >
                        {i.rotulo}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Link
            href="/conta"
            className="so-desktop"
            style={{ textAlign: "right", lineHeight: 1.2, textDecoration: "none", color: "inherit" }}
            title="Minha conta / trocar senha"
          >
            <div style={{ fontSize: 12, fontWeight: 700 }}>{sessao.nome}</div>
            <div className="rotulo" style={{ color: "var(--acento)", fontSize: 9 }}>
              {ROTULO_PERFIL[sessao.perfil] ?? sessao.perfil}
            </div>
          </Link>
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
    </SWRConfig>
  );
}
