"use client";

/**
 * Holofote do tutorial: escurece a tela, ilumina um elemento e explica num
 * balão ao lado.
 *
 * **Por que quatro retângulos em vez de uma tela escura com recorte:** o alvo
 * precisa continuar clicável de verdade. Cobrindo tudo e liberando o clique por
 * `pointer-events` a gente entra numa briga de z-index com modais e menus da
 * aplicação. Com uma moldura de quatro faixas (cima, baixo, esquerda, direita),
 * o buraco do meio simplesmente não tem nada por cima — o clique chega ao botão
 * real, como se o tutorial não existisse.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EVENTO_SALVOU, type PassoTutorial } from "@/lib/tutorial/trilha";

const MARGEM = 8;
const BALAO_L = 340;

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

function medir(alvo: string): Caixa | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el || el.offsetParent === null) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.x - MARGEM, y: r.y - MARGEM, w: r.width + MARGEM * 2, h: r.height + MARGEM * 2 };
}

export default function Holofote({
  passo,
  indice,
  total,
  precisa,
  aoAvancar,
  aoSair,
}: {
  passo: PassoTutorial;
  indice: number;
  total: number;
  /**
   * O que a etapa precisa para existir (ex.: "um dia com tarefas montadas").
   *
   * Com isto, alvo ausente vira explicação — a etapa depende de um dado que a
   * pessoa ainda não criou. Sem isto, alvo ausente é defeito nosso e grita.
   */
  precisa?: string;
  aoAvancar: () => void;
  aoSair: () => void;
}) {
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  /** Alvo declarado que não existe na tela — falha visível, nunca silenciosa. */
  const [perdido, setPerdido] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  // Acompanha o alvo: ele muda de lugar com rolagem, resize e abertura de modal.
  useEffect(() => {
    if (!passo.alvo) {
      setCaixa(null);
      setPerdido(false);
      return;
    }
    let tentativas = 0;
    let vivo = true;
    const procurar = () => {
      if (!vivo) return;
      const c = medir(passo.alvo!);
      if (c) {
        setCaixa(c);
        setPerdido(false);
      } else if (++tentativas > 20) {
        // 20 tentativas ≈ 2s: o elemento não vai aparecer.
        setPerdido(true);
        // Grita só quando a etapa NÃO declara depender de dado. Aí o alvo
        // sumiu do código e é defeito nosso. Quando a etapa declara, a
        // ausência é esperada e virar erro no console seria ruído.
        if (!precisa) {
          console.error(
            `[tutorial] alvo data-tour="${passo.alvo}" não existe nesta tela. O roteiro em lib/tutorial/trilha.ts está desatualizado.`,
          );
        }
      }
    };
    procurar();
    const t = setInterval(procurar, 100);
    window.addEventListener("scroll", procurar, true);
    window.addEventListener("resize", procurar);
    return () => {
      vivo = false;
      clearInterval(t);
      window.removeEventListener("scroll", procurar, true);
      window.removeEventListener("resize", procurar);
    };
  }, [passo.alvo, precisa]);

  // Traz o alvo para a tela antes de iluminá-lo.
  useEffect(() => {
    if (!passo.alvo) return;
    document
      .querySelector(`[data-tour="${passo.alvo}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [passo.alvo]);

  const avancar = useCallback(() => aoAvancar(), [aoAvancar]);

  // Passo de clique: só avança quando ela clicar no alvo de verdade. É o que
  // separa treinar de assistir.
  useEffect(() => {
    if (passo.avancarEm !== "clique" || !passo.alvo) return;
    const ouvir = (e: MouseEvent) => {
      const alvoEl = document.querySelector(`[data-tour="${passo.alvo}"]`);
      if (alvoEl && e.target instanceof Node && alvoEl.contains(e.target)) {
        // Deixa a aplicação reagir ao clique antes de trocar de passo.
        setTimeout(avancar, 260);
      }
    };
    document.addEventListener("click", ouvir, true);
    return () => document.removeEventListener("click", ouvir, true);
  }, [passo.avancarEm, passo.alvo, avancar]);

  // Passo de resultado: espera a operação DAR CERTO. Clicar em Salvar num
  // formulário vazio não grava nada — e antes disso avançava do mesmo jeito,
  // dando a etapa por concluída sem um único cadastro.
  useEffect(() => {
    if (passo.avancarEm !== "sucesso") return;
    const nome = passo.evento ?? EVENTO_SALVOU;
    const ouvir = () => avancar();
    window.addEventListener(nome, ouvir);
    return () => window.removeEventListener(nome, ouvir);
  }, [passo.avancarEm, passo.evento, avancar]);

  if (!montado) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const foco = perdido ? null : caixa;

  // Balão: abaixo do alvo quando cabe, senão acima; centralizado sem alvo.
  let balaoTop = vh / 2 - 90;
  let balaoLeft = vw / 2 - BALAO_L / 2;
  if (foco) {
    const abaixo = foco.y + foco.h + 14;
    const cabeAbaixo = abaixo + 210 < vh;
    balaoTop = cabeAbaixo ? abaixo : Math.max(14, foco.y - 210);
    balaoLeft = Math.min(Math.max(foco.x + foco.w / 2 - BALAO_L / 2, 14), vw - BALAO_L - 14);
  }

  const faixas: Caixa[] = foco
    ? [
        { x: 0, y: 0, w: vw, h: Math.max(0, foco.y) },
        { x: 0, y: foco.y + foco.h, w: vw, h: Math.max(0, vh - foco.y - foco.h) },
        { x: 0, y: foco.y, w: Math.max(0, foco.x), h: foco.h },
        { x: foco.x + foco.w, y: foco.y, w: Math.max(0, vw - foco.x - foco.w), h: foco.h },
      ]
    : [{ x: 0, y: 0, w: vw, h: vh }];

  return createPortal(
    <div className="holofote" role="dialog" aria-live="polite" aria-label={passo.titulo}>
      {faixas.map((f, i) => (
        <div
          key={i}
          className="holofote-sombra"
          style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
        />
      ))}

      {foco && (
        <div
          className="holofote-anel"
          style={{ left: foco.x, top: foco.y, width: foco.w, height: foco.h }}
        />
      )}

      <div className="holofote-balao" style={{ top: balaoTop, left: balaoLeft, width: BALAO_L }}>
        <div className="holofote-topo">
          <span className="rotulo">
            Passo {indice + 1} de {total}
          </span>
          <button type="button" className="holofote-sair" onClick={aoSair}>
            Sair do tutorial
          </button>
        </div>
        <h3>{passo.titulo}</h3>
        <p>{passo.texto}</p>

        {perdido ? (
          precisa ? (
            /* Falta dado, não é defeito. Dizer o motivo em vez de acusar erro:
               quem está no primeiro dia ainda não montou nada, e um alarme
               vermelho aqui faria parecer que o sistema quebrou. */
            <div className="holofote-adiante">
              <strong>Este passo ainda não dá para fazer.</strong> Ele aparece
              quando você tiver {precisa}. Nada de errado — é só a ordem das
              coisas. Siga em frente e volte aqui depois.
            </div>
          ) : (
            <div className="alerta alerta-erro" style={{ marginTop: 10 }}>
              Não encontrei este item na tela. O tutorial está desatualizado — avise
              quem cuida do sistema. Você pode continuar usando normalmente.
            </div>
          )
        ) : passo.avancarEm === "clique" ? (
          <div className="holofote-espera">↑ Clique no item destacado para continuar</div>
        ) : passo.avancarEm === "sucesso" ? (
          <div className="holofote-espera">↑ Continua quando o cadastro for salvo</div>
        ) : null}

        {(passo.avancarEm ?? "leitura") === "leitura" && !perdido && (
          <button type="button" className="btn btn-primario holofote-ok" onClick={avancar}>
            Entendi →
          </button>
        )}
        {perdido && (
          <button
            type="button"
            className={`btn holofote-ok${precisa ? " btn-primario" : ""}`}
            onClick={avancar}
          >
            {precisa ? "Entendi, seguir →" : "Pular este passo →"}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
