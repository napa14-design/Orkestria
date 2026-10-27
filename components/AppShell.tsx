"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AvisoAtualizacao from "./AvisoAtualizacao";
import { ProvedorSessao } from "./SessaoContexto";
import { useEffect, useRef, useState } from "react";
import { SWRConfig, type Middleware } from "swr";
import type { SessaoUsuario } from "@/lib/permissions";

/**
 * Catálogos que mudam raramente: com o dado já em cache, trocar de tela não
 * busca de novo (o SWR rebuscava toda chave a cada montagem — ~70 leituras por
 * navegação; levantamento de 20/10/2026, Firestore pago). Quem cria ou edita um
 * deles já atualiza o cache (CrudManager e os "+ novo" chamam `mutate`).
 *
 * Só o que é IGUAL para todo mundo. `/api/sedes` fica de fora de propósito: a
 * lista depende de quem está logado, e o próximo da mesma aba herdaria a do
 * anterior (auditoria, 20/10/2026).
 */
const CATALOGOS = new Set(["/api/requisitos", "/api/tipos-local", "/api/categorias"]);
const catalogoSemRebusca: Middleware = (useSWRNext) => (chave, buscar, config) =>
  useSWRNext(
    chave,
    buscar,
    typeof chave === "string" && CATALOGOS.has(chave) ? { ...config, revalidateIfStale: false } : config,
  );

type Item = {
  href: string;
  rotulo: string;
  apenasAdmin?: boolean;
  ocultarCoordenador?: boolean;
};
type Grupo = { rotulo: string; itens: Item[] };

/** Menu organizado por intenção: do dia a dia → números → cadastros → sistema. */
const GRUPOS: Grupo[] = [
  {
    rotulo: "Operação",
    itens: [
      { href: "/inicio", rotulo: "Central" },
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
      { href: "/tipos-local", rotulo: "Tipos de local" },
      { href: "/categorias", rotulo: "Categorias" },
      { href: "/requisitos", rotulo: "Requisitos" },
      { href: "/periodos-letivos", rotulo: "Calendário acadêmico", apenasAdmin: true },
      { href: "/feriados", rotulo: "Feriados e recessos" },
    ],
  },
  {
    rotulo: "Sistema",
    itens: [
      { href: "/da-ata", rotulo: "Da ata ao sistema", ocultarCoordenador: true },
      { href: "/parametros", rotulo: "Parâmetros" },
      { href: "/historico", rotulo: "Histórico", ocultarCoordenador: true },
      { href: "/usuarios", rotulo: "Usuários", apenasAdmin: true },
    ],
  },
];

const ROTULO_PERFIL: Record<string, string> = {
  administrador: "Admin",
  coordenador: "Coordenador",
  supervisor: "Supervisor",
  visualizador: "Gerência",
};

/**
 * O supervisor (perfil de chão) só lê a rota e marca o realizado: o menu dele
 * tem estas duas telas, e "Minha conta". Em qualquer outra URL a tela mostra
 * um aviso em vez do conteúdo — quem nega de verdade é o servidor (403); isto
 * só evita abrir uma tela cheia de botões que ele não pode usar.
 */
const TELAS_SUPERVISOR = ["/rotinas", "/acompanhamento"];
const ALCANCE_SUPERVISOR = [...TELAS_SUPERVISOR, "/conta"];

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
  const ehSupervisor = sessao.perfil === "supervisor";
  const foraDoAlcance = ehSupervisor && !ALCANCE_SUPERVISOR.some((p) => pathname.startsWith(p));
  const visiveis = (g: Grupo) =>
    g.itens.filter((i) =>
      ehSupervisor
        ? TELAS_SUPERVISOR.includes(i.href)
        : (!i.apenasAdmin || ehAdmin) &&
          (!i.ocultarCoordenador || sessao.perfil !== "coordenador"),
    );

  // O login e o logo levam à Central, que não é tela do supervisor: ele cai
  // direto na rota do dia.
  useEffect(() => {
    if (ehSupervisor && pathname === "/inicio") router.replace("/rotinas");
  }, [ehSupervisor, pathname, router]);
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
    <ProvedorSessao sessao={sessao}>
    <SWRConfig
      // Cache POR SESSÃO, por construção: cada pessoa começa com um cache novo
      // (`provider`), e a `key` refaz tudo se a sessão mudar sem desmontar (login
      // de outra pessoa numa segunda aba). Antes o cache era o global da aba, e
      // o próximo usuário herdava o que o anterior via — depender de cada tela
      // de login lembrar de limpar não é garantia (revisão de segurança, 20/10/2026).
      key={sessao.id}
      value={{
        provider: () => new Map(),
        // Mantém os dados anteriores enquanto revalida ou ao trocar de chave —
        // assim a agenda não desmonta (não pisca nem "some") a cada atualização.
        keepPreviousData: true,
        // Não refazer toda busca a cada foco/reconexão: evita flicker e
        // reduz leituras do Firestore. As mutações já mantêm a tela fresca.
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        use: [catalogoSemRebusca],
      }}
    >
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AvisoAtualizacao />
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
        <Link href={ehSupervisor ? "/rotinas" : "/inicio"} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
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
        {!foraDoAlcance ? (
          children
        ) : pathname === "/inicio" ? null : (
          <div className="painel" style={{ maxWidth: 560, margin: "48px auto", padding: "20px 24px" }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Esta tela não é do seu perfil</h1>
            <p style={{ fontSize: 14, color: "var(--tinta-2)", lineHeight: 1.55, marginBottom: 16 }}>
              Como supervisor, você vê a rota do dia e marca as tarefas como feitas ou não, nas
              sedes que acompanha.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/rotinas" className="btn btn-primario">
                Rotina do dia
              </Link>
              <Link href="/acompanhamento" className="btn">
                Acompanhamento
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
    </SWRConfig>
    </ProvedorSessao>
  );
}
