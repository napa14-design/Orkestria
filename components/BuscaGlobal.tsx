"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetcher } from "@/lib/clientApi";
import { GRUPOS_NAVEGACAO } from "@/lib/navegacao";
import type { Funcionario, Local, Tarefa, Usuario } from "@/types";

type Perfil = Usuario["perfil"];

interface ResultadoBusca {
  chave: string;
  tipo: "Tela" | "Funcionário" | "Tarefa" | "Local";
  titulo: string;
  detalhe: string;
  href: string;
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export default function BuscaGlobal({ perfil, sedeId }: { perfil: Perfil; sedeId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const carregouEntidades = useRef(false);
  const [aberta, setAberta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [selecionado, setSelecionado] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);

  const telas = useMemo<ResultadoBusca[]>(
    () =>
      GRUPOS_NAVEGACAO.flatMap((grupo) =>
        grupo.itens
          .filter((item) => !item.apenasAdmin || perfil === "administrador")
          .map((item) => ({
            chave: `tela:${item.href}`,
            tipo: "Tela" as const,
            titulo: item.rotulo,
            detalhe: grupo.rotulo,
            href: item.href,
          })),
      ),
    [perfil],
  );

  const locaisPorId = useMemo(
    () => new Map(locais.map((local) => [local.id, local])),
    [locais],
  );

  const resultados = useMemo(() => {
    const q = normalizar(consulta.trim());
    const corresponde = (...valores: Array<string | undefined>) =>
      valores.some((valor) => valor && normalizar(valor).includes(q));

    const registros: ResultadoBusca[] = q
      ? [
          ...funcionarios
            .filter((item) => item.ativo && corresponde(item.nome, item.cargo))
            .map((item) => ({
              chave: `funcionario:${item.id}`,
              tipo: "Funcionário" as const,
              titulo: item.nome,
              detalhe: item.cargo || "Equipe operacional",
              href: `/rotinas?sede=${encodeURIComponent(item.sede_id)}&funcionario=${encodeURIComponent(item.id)}`,
            })),
          ...tarefas
            .filter((item) => item.ativo && corresponde(item.nome_tarefa, locaisPorId.get(item.local_id)?.nome_local))
            .map((item) => ({
              chave: `tarefa:${item.id}`,
              tipo: "Tarefa" as const,
              titulo: item.nome_tarefa,
              detalhe: locaisPorId.get(item.local_id)?.nome_local || "Tarefa operacional",
              href: `/rotinas?sede=${encodeURIComponent(item.sede_id)}&tarefa=${encodeURIComponent(item.id)}`,
            })),
          ...locais
            .filter((item) => item.ativo && corresponde(item.nome_local, item.andar, item.tipo_local))
            .map((item) => ({
              chave: `local:${item.id}`,
              tipo: "Local" as const,
              titulo: item.nome_local,
              detalhe: item.andar || "Estrutura da sede",
              href: `/locais?busca=${encodeURIComponent(item.nome_local)}`,
            })),
        ]
      : [];

    const paginas = telas.filter((item) => !q || corresponde(item.titulo, item.detalhe));
    return [...paginas.slice(0, q ? 5 : 8), ...registros.slice(0, 8)].slice(0, 12);
  }, [consulta, funcionarios, tarefas, locais, locaisPorId, telas]);

  useEffect(() => {
    const abrirPorAtalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta(true);
      }
    };
    window.addEventListener("keydown", abrirPorAtalho);
    return () => window.removeEventListener("keydown", abrirPorAtalho);
  }, []);

  useEffect(() => {
    if (!aberta) return;
    setSelecionado(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    // Abrir o Ctrl+K para navegar entre telas não deve ler três catálogos.
    // Entidades só são carregadas quando há uma pesquisa minimamente útil.
    if (consulta.trim().length < 2) return;
    if (carregouEntidades.current) return;
    carregouEntidades.current = true;
    setCarregando(true);
    setErro("");
    const filtroSede =
      perfil === "supervisor" && sedeId && sedeId !== "geral"
        ? `?sede=${encodeURIComponent(sedeId)}`
        : "";
    Promise.all([
      fetcher<Funcionario[]>(`/api/funcionarios${filtroSede}`),
      fetcher<Tarefa[]>(`/api/tarefas${filtroSede}`),
      fetcher<Local[]>(`/api/locais${filtroSede}`),
    ])
      .then(([novosFuncionarios, novasTarefas, novosLocais]) => {
        setFuncionarios(novosFuncionarios);
        setTarefas(novasTarefas);
        setLocais(novosLocais);
      })
      .catch(() => {
        carregouEntidades.current = false;
        setErro("Não foi possível consultar os cadastros agora. As telas continuam disponíveis.");
      })
      .finally(() => setCarregando(false));
  }, [aberta, consulta, perfil, sedeId]);

  useEffect(() => setSelecionado(0), [consulta]);

  function navegar(resultado: ResultadoBusca) {
    setAberta(false);
    setConsulta("");
    if (window.location.pathname === "/rotinas" && resultado.href.startsWith("/rotinas?")) {
      const destino = new URL(resultado.href, window.location.origin);
      window.dispatchEvent(
        new CustomEvent("orkestria:abrir-agenda", {
          detail: {
            sede: destino.searchParams.get("sede") ?? undefined,
            funcionario: destino.searchParams.get("funcionario") ?? undefined,
            tarefa: destino.searchParams.get("tarefa") ?? undefined,
          },
        }),
      );
      return;
    }
    router.push(resultado.href);
  }

  function tratarTecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setAberta(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((atual) => Math.min(atual + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((atual) => Math.max(atual - 1, 0));
    } else if (e.key === "Enter" && resultados[selecionado]) {
      e.preventDefault();
      navegar(resultados[selecionado]);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-mini busca-global-gatilho"
        onClick={() => setAberta(true)}
        aria-label="Buscar telas e cadastros"
        title="Buscar telas, funcionários, tarefas e locais (Ctrl+K)"
      >
        <span aria-hidden="true">⌕</span>
        <span className="busca-global-texto">Buscar</span>
        <kbd>Ctrl K</kbd>
      </button>

      {aberta &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="busca-global-fundo"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAberta(false);
            }}
          >
            <section className="busca-global-caixa" role="dialog" aria-modal="true" aria-label="Busca global">
              <div className="busca-global-campo">
                <span aria-hidden="true">⌕</span>
                <input
                  ref={inputRef}
                  value={consulta}
                  onChange={(e) => setConsulta(e.target.value)}
                  onKeyDown={tratarTecla}
                  placeholder="Tela, funcionário, tarefa ou local…"
                  aria-label="O que você procura?"
                />
                <kbd>Esc</kbd>
              </div>

              <div className="busca-global-resultados" role="listbox">
                <div className="busca-global-legenda rotulo">
                  {consulta ? `${resultados.length} resultado(s)` : "Acessos mais usados"}
                  {carregando && <span>Consultando cadastros…</span>}
                  {!carregando && consulta.trim().length === 1 && (
                    <span>Digite mais 1 caractere para consultar cadastros</span>
                  )}
                </div>
                {erro && <div className="busca-global-aviso">{erro}</div>}
                {resultados.map((resultado, indice) => (
                  <button
                    type="button"
                    key={resultado.chave}
                    role="option"
                    aria-selected={selecionado === indice}
                    className={`busca-global-item${selecionado === indice ? " selecionado" : ""}`}
                    onMouseEnter={() => setSelecionado(indice)}
                    onClick={() => navegar(resultado)}
                  >
                    <span className="busca-global-tipo">{resultado.tipo.slice(0, 1)}</span>
                    <span>
                      <strong>{resultado.titulo}</strong>
                      <small>{resultado.detalhe}</small>
                    </span>
                    <span className="busca-global-seta" aria-hidden="true">↗</span>
                  </button>
                ))}
                {!carregando && resultados.length === 0 && (
                  <div className="busca-global-vazio">
                    Nada encontrado. Tente parte do nome ou use o menu de navegação.
                  </div>
                )}
              </div>
              <footer className="busca-global-rodape">
                <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
                <span><kbd>Enter</kbd> abrir</span>
                <span>Dados visíveis conforme seu perfil</span>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
