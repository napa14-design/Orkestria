"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessaoUsuario } from "@/lib/permissions";

const FLUXO = [
  { href: "/sedes", rotulo: "Sedes", numero: "01" },
  { href: "/locais", rotulo: "Locais", numero: "02" },
  { href: "/tarefas", rotulo: "Tarefas", numero: "03" },
  { href: "/funcionarios", rotulo: "Equipe", numero: "04" },
];

const CATALOGOS = [
  { href: "/categorias", rotulo: "Categorias", apenasAdmin: true },
  { href: "/requisitos", rotulo: "EPIs e requisitos", apenasAdmin: true },
  { href: "/qualificacoes", rotulo: "Qualificações" },
  { href: "/tempos", rotulo: "Tempos por pessoa" },
  { href: "/periodos-letivos", rotulo: "Calendário", apenasAdmin: true },
];

const ROTAS_CADASTRO = new Set([
  ...FLUXO.map((item) => item.href),
  ...CATALOGOS.map((item) => item.href),
  "/usuarios",
  "/parametros",
]);

export default function CadastroNavegacao({ sessao }: { sessao: SessaoUsuario }) {
  const pathname = usePathname();
  if (!ROTAS_CADASTRO.has(pathname)) return null;

  const catalogos = CATALOGOS.filter(
    (item) => !item.apenasAdmin || sessao.perfil === "administrador",
  );

  return (
    <aside className="cadastro-navegacao nao-imprimir" aria-label="Navegação dos cadastros">
      <div className="cadastro-navegacao-miolo">
        <div className="cadastro-fluxo" aria-label="Fluxo principal de configuração">
          <span className="cadastro-navegacao-titulo rotulo">Fluxo da estrutura</span>
          {FLUXO.map((item, indice) => (
            <span className="cadastro-fluxo-etapa" key={item.href}>
              <Link
                href={item.href}
                className={pathname === item.href ? "ativo" : ""}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <span className="num">{item.numero}</span>
                {item.rotulo}
              </Link>
              {indice < FLUXO.length - 1 && <span className="cadastro-fluxo-seta">→</span>}
            </span>
          ))}
        </div>

        <div className="cadastro-catalogos" aria-label="Catálogos de apoio">
          <span className="cadastro-navegacao-titulo rotulo">Catálogos</span>
          {catalogos.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "ativo" : ""}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.rotulo}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
