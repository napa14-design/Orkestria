"use client";

/** Botão "?" + modal com a legenda/ajuda da agenda (cores, arrastar, painéis). */
import { useState } from "react";
import Modal from "@/components/Modal";

function Swatch({ cor }: { cor: string }) {
  return (
    <span
      style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: cor, border: "1px solid var(--tinta)", flexShrink: 0 }}
    />
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return <li style={{ marginBottom: 8, lineHeight: 1.5 }}>{children}</li>;
}

export default function AjudaAgenda() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-mini btn-fantasma"
        onClick={() => setAberto(true)}
        title="Como usar a agenda"
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        ❔ Como usar
      </button>

      <Modal titulo="Como usar a agenda" aberto={aberto} aoFechar={() => setAberto(false)} larguraMax={560}>
        <div style={{ fontSize: 13, color: "var(--tinta-2)" }}>
          <p style={{ marginBottom: 12 }}>
            <strong>Montar:</strong> arraste uma tarefa da <strong>paleta</strong> (à esquerda) para a
            coluna de um funcionário e solte no horário. O card aparece na hora e já salva.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <Item>
              <strong>Mover / ajustar:</strong> arraste o card para mudar de horário ou pessoa; use a
              alça <span className="num">⠿</span> na base do card para mudar a duração.
            </Item>
            <Item>
              <strong>Blocos de 15 min:</strong> a grade é de 15 em 15 min. O tamanho do card arredonda
              para o bloco, mas os números (ocupação, ociosidade) usam o tempo exato.
            </Item>
            <Item>
              <strong>Card:</strong> mostra só o <strong>nome da tarefa</strong>. <strong>Clique</strong>
              {" "}nele para abrir o <em>balãozinho</em> com horário, duração, local, categoria e
              situação (e o botão Remover). A <strong>faixa colorida à esquerda</strong> indica a
              <em> categoria</em> (limpeza, higienização, apoio…). O <strong>fundo</strong>
              mostra a <em>situação</em>: papel = planejada; e tom suave quando muda —
              <span style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Swatch cor="#e9f2ec" /> Realizada</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Swatch cor="#fbe9e6" /> Não realizada</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Swatch cor="#fdf1e3" /> Remanejada</span>
              </span>
            </Item>
            <Item>
              <strong>Blocos iguais e seguidos</strong> (ex.: a mesma limpeza em fatias de 15 min)
              aparecem mesclados num bloco só, com o nome e o horário uma vez.
            </Item>
            <Item>
              <strong>Ocupação</strong> (resumo lateral e da equipe): quanto da jornada está preenchido.
              Vai de <em>subutilizado</em> → <em>adequado</em> → <em>alta</em> → <em>sobrecarga</em>
              (limites em Sistema → Parâmetros). <strong>Ociosidade</strong> é o tempo livre previsto.
            </Item>
            <Item>
              <strong>Coluna listrada de vermelho:</strong> funcionário ausente ou de folga — não recebe
              tarefas (use o Remanejo entre sedes para cobrir).
            </Item>
            <Item>
              <strong>“Ficou de fora hoje”:</strong> tarefas que deveriam estar na agenda e ainda não
              foram alocadas; as <strong>críticas</strong> aparecem em destaque.
            </Item>
          </ul>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="btn btn-primario" onClick={() => setAberto(false)}>
            Entendi
          </button>
        </div>
      </Modal>
    </>
  );
}
