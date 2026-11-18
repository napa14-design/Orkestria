"use client";

/**
 * Aviso único da mudança de 18/11/2026 (atividade adicional e déficit estimado): muda o jeito de
 * lançar e o que os números querem dizer, então quem coordena lê uma vez, inteiro. Sem ✕ e sem
 * fechar clicando fora; o "Entendi" fica no fim e só libera depois de alguns segundos.
 * Visto = marcado no navegador (como `AvisosRemanejo`); outro aparelho mostra de novo, uma vez.
 * Sai sozinho depois de `ATE`: quem chegar depois não precisa de "o que mudou".
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const CHAVE = "orkestria:aviso-atividade-adicional-2026-11-18";
const ATE = "2026-12-31";
const ESPERA_S = 10;

export default function AvisoNovidade() {
  const [aberto, setAberto] = useState(false);
  const [falta, setFalta] = useState(ESPERA_S);

  // Lido depois de montar: o servidor não tem localStorage. Sem acesso ao armazenamento, não
  // mostra: senão o aviso voltaria em toda tela.
  useEffect(() => {
    try {
      if (new Date().toISOString().slice(0, 10) <= ATE && !localStorage.getItem(CHAVE)) setAberto(true);
    } catch {
      /* armazenamento bloqueado */
    }
  }, []);

  useEffect(() => {
    if (!aberto || falta <= 0) return;
    const t = setTimeout(() => setFalta((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [aberto, falta]);

  function entendi() {
    try {
      localStorage.setItem(CHAVE, new Date().toISOString());
    } catch {
      /* fecha mesmo assim */
    }
    setAberto(false);
  }

  if (!aberto || typeof document === "undefined") return null;
  const item = { margin: "0 0 12px", lineHeight: 1.5 } as const;
  return createPortal(
    <div className="modal-fundo">
      <div className="modal-caixa" style={{ maxWidth: 600 }} role="dialog" aria-modal="true" aria-labelledby="aviso-novidade-titulo">
        <div className="painel-cabecalho">
          <h3 id="aviso-novidade-titulo" style={{ fontSize: 17 }}>
            Mudou: atividade adicional e sobrecarga
          </h3>
        </div>
        <div style={{ padding: 20, fontSize: 14 }}>
          <p style={item}>
            Quando alguém da equipe é puxado para fora da rota (montar ou desmontar evento, apoiar outro setor),
            agora isso tem lugar próprio — e entra na conta da sobrecarga. Leia até o fim, leva um minuto.
          </p>
          <ol style={{ paddingLeft: 20, margin: "0 0 12px" }}>
            <li style={item}>
              <strong>Botão “+ Atividade adicional”</strong>, no Acompanhamento e na agenda. Lance uma vez para
              cada pessoa: horário, o que foi feito e o tipo do que ela fez.
            </li>
            <li style={item}>
              <strong>O tempo soma por cima da rota.</strong> Se a rota daquele horário não vai ser feita, cancele
              a tarefa ou passe para outra pessoa — senão conta as duas coisas.
            </li>
            <li style={item}>
              <strong>O tipo</strong> (atendimento, organização e decoração, movimentação de cargas, ou “não sei
              informar”) não muda as horas: registra o esforço, para mostrar à gestão quem pegou peso.
            </li>
            <li style={item}>
              <strong>Desvio continua sendo para tarefa da rota</strong> feita de outro jeito. A caixa “Foi
              puxado(a)” saiu de lá: o apoio agora vai pelo botão novo.
            </li>
            <li style={item}>
              <strong>No Dashboard</strong>, o cartão “Déficit estimado” mostra as horas-pessoa acima da jornada e
              quanto delas veio da atividade adicional; logo abaixo, a lista por funcionário.
            </li>
            <li style={item}>
              <strong>No Acompanhamento</strong>, o aviso “Demanda estimada hoje” aparece quando alguém passa da
              régua de ocupação no dia.
            </li>
          </ol>
          <p style={{ ...item, color: "var(--tinta-2)" }}>
            Só conta o que for lançado: dia sem registro não quer dizer dia sem apoio. Quanto mais completo o
            lançamento, mais forte o número.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="btn btn-primario" onClick={entendi} disabled={falta > 0}>
              {falta > 0 ? `Entendi (${falta})` : "Entendi"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
