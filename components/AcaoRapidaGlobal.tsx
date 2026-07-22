"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SessaoUsuario } from "@/lib/permissions";

const ACOES = [
  {
    href: "/ausencias?novo=1",
    marca: "A",
    titulo: "Registrar ausência",
    descricao: "Falta, atestado, férias ou folga",
  },
  {
    href: "/eventuais?novo=1",
    marca: "E",
    titulo: "Registrar eventual",
    descricao: "Trabalho avulso ou imprevisto",
  },
  {
    href: "/rotinas",
    marca: "R",
    titulo: "Abrir rotina do dia",
    descricao: "Planejar e distribuir tarefas",
  },
  {
    href: "/acompanhamento",
    marca: "F",
    titulo: "Atualizar o realizado",
    descricao: "Confirmar execução ou justificativa",
  },
] as const;

/** Menu global para capturar uma ocorrência sem procurar a tela no cabeçalho. */
export default function AcaoRapidaGlobal({ perfil }: { perfil: SessaoUsuario["perfil"] }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const editando =
        alvo?.tagName === "INPUT" ||
        alvo?.tagName === "TEXTAREA" ||
        alvo?.tagName === "SELECT" ||
        !!alvo?.isContentEditable;
      if (e.altKey && e.key.toLowerCase() === "r" && !editando) {
        e.preventDefault();
        setAberto((atual) => !atual);
      } else if (e.key === "Escape") {
        setAberto(false);
      }
    };
    const aoClicarFora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoClicarFora);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoClicarFora);
    };
  }, []);

  if (perfil === "visualizador") return null;

  return (
    <div ref={raiz} className="acao-global">
      <button
        type="button"
        className={`acao-global-botao${aberto ? " aberto" : ""}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
        title="Registrar uma ocorrência rapidamente (Alt+R)"
      >
        <span aria-hidden="true">＋</span> Registrar
        <kbd className="tecla-atalho so-desktop">Alt R</kbd>
      </button>

      {aberto && (
        <div className="acao-global-menu" role="menu" aria-label="Ações rápidas">
          <div className="acao-global-cabecalho">
            <span className="rotulo">Captura rápida</span>
            <span>O que aconteceu agora?</span>
          </div>
          {ACOES.map((acao) => (
            <Link
              key={acao.href}
              href={acao.href}
              role="menuitem"
              className="acao-global-item"
              onClick={() => setAberto(false)}
            >
              <span className="acao-global-marca" aria-hidden="true">{acao.marca}</span>
              <span>
                <strong>{acao.titulo}</strong>
                <small>{acao.descricao}</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
          {perfil === "administrador" && (
            <Link
              href="/remanejo"
              role="menuitem"
              className="acao-global-item"
              onClick={() => setAberto(false)}
            >
              <span className="acao-global-marca" aria-hidden="true">M</span>
              <span>
                <strong>Remanejar entre sedes</strong>
                <small>Ação administrativa</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
