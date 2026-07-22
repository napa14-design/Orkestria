"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SWRConfig } from "swr";
import AcaoRapidaGlobal from "./AcaoRapidaGlobal";
import BuscaGlobal from "./BuscaGlobal";
import CadastroNavegacao from "./CadastroNavegacao";
import { SessaoProvider } from "./SessaoContext";
import { GRUPOS_NAVEGACAO, type GrupoNavegacao } from "@/lib/navegacao";
import type { SessaoUsuario } from "@/lib/permissions";

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
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const fecharTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fecha qualquer menu ao trocar de página.
  useEffect(() => {
    setAberto(null);
    setMenuMobileAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuMobileAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuMobileAberto(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [menuMobileAberto]);

  const ehAdmin = sessao.perfil === "administrador";
  const visiveis = (g: GrupoNavegacao) => g.itens.filter((i) => !i.apenasAdmin || ehAdmin);
  const grupoAtivo = (g: GrupoNavegacao) => visiveis(g).some((i) => pathname.startsWith(i.href));

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
    <SessaoProvider sessao={sessao}>
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
        className="nao-imprimir app-cabecalho"
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
          {GRUPOS_NAVEGACAO.map((g) => {
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
          <BuscaGlobal perfil={sessao.perfil} sedeId={sessao.sede_id} />
          <AcaoRapidaGlobal perfil={sessao.perfil} />
          <button
            type="button"
            className={`menu-mobile-gatilho${menuMobileAberto ? " aberto" : ""}`}
            aria-label={menuMobileAberto ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuMobileAberto}
            aria-controls="navegacao-mobile"
            onClick={() => setMenuMobileAberto((atual) => !atual)}
          >
            <span aria-hidden="true">{menuMobileAberto ? "×" : "≡"}</span>
          </button>
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
            className="btn btn-mini app-sair"
            style={{ background: "transparent", color: "var(--papel)", borderColor: "var(--papel-3)", boxShadow: "none" }}
          >
            Sair
          </button>
        </div>
      </header>

      {menuMobileAberto && (
        <div
          className="navegacao-mobile-fundo nao-imprimir"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMenuMobileAberto(false);
          }}
        >
          <nav id="navegacao-mobile" className="navegacao-mobile" aria-label="Menu principal">
            <div className="navegacao-mobile-topo">
              <div>
                <span className="rotulo">Navegação</span>
                <strong>{sessao.nome}</strong>
                <small>{ROTULO_PERFIL[sessao.perfil] ?? sessao.perfil}</small>
              </div>
              <button type="button" aria-label="Fechar menu" onClick={() => setMenuMobileAberto(false)}>×</button>
            </div>
            <div className="navegacao-mobile-grupos">
              {GRUPOS_NAVEGACAO.map((grupo, indice) => {
                const itens = visiveis(grupo);
                if (itens.length === 0) return null;
                return (
                  <section key={grupo.rotulo}>
                    <div className="navegacao-mobile-grupo-titulo">
                      <span className="num">{String(indice + 1).padStart(2, "0")}</span>
                      <strong>{grupo.rotulo}</strong>
                    </div>
                    <div>
                      {itens.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={pathname.startsWith(item.href) ? "ativo" : ""}
                        >
                          <span>{item.rotulo}</span>
                          <i aria-hidden="true">→</i>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <footer>
              <Link href="/conta">Minha conta</Link>
              <button type="button" onClick={sair}>Sair do sistema</button>
            </footer>
          </nav>
        </div>
      )}

      <CadastroNavegacao sessao={sessao} />

      <main style={{ flex: 1, padding: 20, maxWidth: 1600, width: "100%", margin: "0 auto" }}>
        {children}
      </main>
    </div>
    </SWRConfig>
    </SessaoProvider>
  );
}
