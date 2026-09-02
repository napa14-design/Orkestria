"use client";

/**
 * Botão de ajuda da agenda: **escolher um tutorial** desta tela, e a legenda
 * (cores, arrastar, painéis) logo abaixo.
 *
 * A lista de tutoriais nasceu de um pedido de 02/09/2026: *"coloca um botão de
 * Ajuda nessa tela de Rotina do Dia que abre qual tutorial a pessoa quer"*.
 * Antes, a única porta para o tutorial era a trilha da Central — quem estava na
 * agenda com dúvida ali não tinha como pedir a aula daquela tela.
 *
 * **Não é botão novo**: entrou dentro do "Como usar" que já existia, porque a
 * tela não pode ganhar mais um controle a cada dúvida. As etapas vêm de
 * `etapasDaRota("/rotinas")` — acrescentar uma etapa na trilha a faz aparecer
 * aqui sozinha.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { etapasDaRota } from "@/lib/tutorial/trilha";

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

export default function AjudaAgenda({ aoComecarTutorial }: { aoComecarTutorial?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  const etapas = etapasDaRota("/rotinas");

  /** Abre o tutorial pedido: quem lê o `?tutorial=` é o componente Tutorial. */
  function comecar(id: string) {
    setAberto(false);
    // Todos os passeios desta rota são da visão de DIA — os alvos (paleta,
    // ocupação, barra de ações) não existem na visão de semana. Quem pede ajuda
    // dali é levado junto, senão o tutorial abriria apontando para o vazio.
    aoComecarTutorial?.();
    router.push(`/rotinas?tutorial=${id}`);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-mini btn-fantasma"
        onClick={() => setAberto(true)}
        title="Tutoriais desta tela e legenda da agenda"
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        ❔ Ajuda
      </button>

      <Modal titulo="Ajuda da agenda" aberto={aberto} aoFechar={() => setAberto(false)} larguraMax={560}>
        <section style={{ marginBottom: 18 }}>
          <span className="rotulo">Quer que eu te mostre?</span>
          <p style={{ fontSize: 12, color: "var(--tinta-3)", margin: "4px 0 10px" }}>
            Cada um destes é um passeio curto pela tela: ele aponta onde ficam as coisas e
            explica o que fazem. Nada é preenchido nem alterado.
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {etapas.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => comecar(e.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "var(--cartao)",
                  border: "var(--borda)",
                  borderRadius: "var(--raio)",
                  padding: "9px 12px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--tinta)" }}>
                  {e.nome} <span style={{ color: "var(--tinta-3)" }}>· {e.passos.length} passos</span>
                </span>
                <span style={{ display: "block", fontSize: 11, color: "var(--tinta-2)", marginTop: 2 }}>
                  {e.ganho}
                </span>
                {/* Dizer o pré-requisito ANTES de abrir evita a pessoa começar um
                    tutorial que vai parar no primeiro passo por falta de dado. */}
                {e.precisa && (
                  <span style={{ display: "block", fontSize: 11, color: "var(--tinta-3)", marginTop: 2 }}>
                    Precisa de {e.precisa}.
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <div style={{ borderTop: "1px solid var(--linha)", paddingTop: 14 }}>
          <span className="rotulo" style={{ display: "block", marginBottom: 8 }}>
            Legenda da tela
          </span>
        </div>
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
              <strong>Hachuras da coluna:</strong> <span style={{ color: "var(--verde)" }}>verde claro</span> =
              <strong> tempo ocioso</strong> (livre no expediente, capacidade disponível);
              verde escuro = <strong>pausa</strong> (lanche/almoço); cinza = <strong>fora do turno</strong>.
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
