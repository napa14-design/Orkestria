"use client";

/**
 * Catálogo de categorias de atividade (Fase B). CRUD padrão + ação de
 * "recalibração em cascata": aplicar um fator ao tempo base de todas as
 * tarefas da categoria de uma vez.
 */
import { useState } from "react";
import { useSWRConfig } from "swr";
import CrudManager from "@/components/CrudManager";
import { useSessao } from "@/components/SessaoContexto";
import { podeCriarNoCatalogo, podeEditarItemDoCatalogo } from "@/lib/permissions";
import Carregando from "@/components/Carregando";
import Modal from "@/components/Modal";
import { apiPost, ErroApi } from "@/lib/clientApi";
import type { Categoria } from "@/types";

const PRESETS = [
  { rotulo: "−20%", fator: 0.8 },
  { rotulo: "−10%", fator: 0.9 },
  { rotulo: "+10%", fator: 1.1 },
  { rotulo: "+20%", fator: 1.2 },
];

export default function PaginaCategorias() {
  const sessao = useSessao();
  const { mutate } = useSWRConfig();
  const [alvo, setAlvo] = useState<Categoria | null>(null);
  const [fator, setFator] = useState("1.1");
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");

  async function recalibrar() {
    if (!alvo) return;
    setEstado("enviando");
    setMsg("");
    try {
      const r = await apiPost<{ atualizadas: number }>("/api/categorias/recalibrar", {
        categoria_id: alvo.id,
        fator: Number(fator),
      });
      setEstado("ok");
      setMsg(`${r.atualizadas} tarefa(s) ajustada(s) pelo fator ${Number(fator)}.`);
      // o tempo base das tarefas mudou — invalida caches que dependem disso
      mutate((key) => typeof key === "string" && key.startsWith("/api/tarefas"));
    } catch (err) {
      setEstado("erro");
      setMsg(err instanceof ErroApi ? err.message : "Erro ao recalibrar.");
    }
  }

  function abrir(cat: Categoria) {
    setAlvo(cat);
    setFator("1.1");
    setEstado("idle");
    setMsg("");
  }

  return (
    <>
      <CrudManager<Categoria>
        titulo="Categorias de atividade"
        subtitulo="Catálogo global que agrupa tarefas afins. Usado nos filtros e na recalibração em cascata. (A intensidade de limpeza agora é cadastrada em cada Local, não na categoria.)"
        endpoint="/api/categorias"
        permissao={{
          criar: !sessao || podeCriarNoCatalogo(sessao),
          // Item compartilhado pelas 18 sedes: administrador sempre;
          // supervisor só o que ele mesmo criou.
          alterar: (item) => !sessao || podeEditarItemDoCatalogo(sessao, item),
        }}
        textoNovo="+ Nova categoria"
        campos={[
          {
            key: "nome",
            rotulo: "Nome",
            tipo: "texto",
            obrigatorio: true,
            dica: "Como o grupo de tarefas aparece nos filtros e selos. Ex.: \"Higienização\", \"Coleta\", \"Limpeza terminal\".",
          },
          {
            key: "descricao",
            rotulo: "Descrição",
            tipo: "textarea",
            inteira: true,
            dica: "Explicação curta do que esta categoria abrange — ajuda quem cadastra tarefas a escolher certo.",
          },
          {
            key: "cor",
            rotulo: "Cor",
            tipo: "texto",
            ajuda: "Hex, ex.: #2f6f4f — usada no selo da paleta",
            dica: "Cor de exibição (hexadecimal) do selo da categoria na paleta de tarefas e na lista. Opcional.",
          },
          { key: "ativo", rotulo: "Ativa", tipo: "checkbox", padrao: true },
        ]}
        colunas={[
          {
            key: "nome",
            rotulo: "Categoria",
            render: (c) => (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: c.cor || "var(--tinta-3)",
                    border: "1px solid var(--tinta)",
                    flexShrink: 0,
                  }}
                />
                <strong>{c.nome}</strong>
              </span>
            ),
          },
          {
            key: "descricao",
            rotulo: "Descrição",
            render: (c) => (
              <span style={{ color: "var(--tinta-2)", fontSize: 13 }}>{c.descricao || "—"}</span>
            ),
          },
          {
            key: "ativo",
            rotulo: "Status",
            render: (c) => (
              <span className={`selo ${c.ativo ? "selo-verde" : "selo-cinza"}`}>
                {c.ativo ? "Ativa" : "Inativa"}
              </span>
            ),
          },
        ]}
        // Recalibrar multiplica o tempo de TODAS as tarefas da categoria, em
        // todas as sedes: segue de administrador, e some para quem não é.
        acoesExtra={sessao && sessao.perfil !== "administrador" ? undefined : (c) => (
          <button className="btn btn-mini btn-fantasma" onClick={() => abrir(c)}>
            Recalibrar
          </button>
        )}
      />

      <Modal
        titulo={`Recalibrar — ${alvo?.nome ?? ""}`}
        aberto={!!alvo}
        aoFechar={() => setAlvo(null)}
        larguraMax={460}
      >
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 14 }}>
          Aplica um fator ao <strong>tempo base</strong> de <em>todas</em> as tarefas desta
          categoria. Ex.: 1.2 deixa cada tarefa 20% mais longa. A ação é registrada no histórico
          e não pode ser desfeita automaticamente.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button
              key={p.rotulo}
              type="button"
              className="btn btn-mini"
              onClick={() => setFator(String(p.fator))}
              style={{
                fontWeight: 700,
                outline: Number(fator) === p.fator ? "2px solid var(--acento)" : "none",
              }}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        <label className="campo" style={{ marginBottom: 14 }}>
          <span className="rotulo">Fator (multiplicador)</span>
          <input
            type="number"
            step="0.05"
            min="0.1"
            value={fator}
            onChange={(e) => setFator(e.target.value)}
          />
        </label>

        {estado === "enviando" ? (
          <Carregando texto="Recalibrando…" style={{ padding: 8 }} />
        ) : (
          <>
            {msg && (
              <div
                className={`alerta ${estado === "erro" ? "alerta-erro" : "alerta-ok"}`}
                style={{ marginBottom: 12 }}
              >
                {msg}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn" onClick={() => setAlvo(null)}>
                {estado === "ok" ? "Fechar" : "Cancelar"}
              </button>
              {estado !== "ok" && (
                <button type="button" className="btn btn-primario" onClick={recalibrar}>
                  Aplicar fator
                </button>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
