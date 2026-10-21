"use client";

/**
 * "O Orkestria foi atualizado" — quem deixa a aba aberta o dia inteiro roda o
 * código de antes do deploy e continua esbarrando em defeito já consertado
 * (pedido do dono, 21/10/2026).
 *
 * Confere a versão do servidor a cada 5 min e quando a aba volta a ficar
 * visível. "Depois" não some de vez: volta a avisar em 15 min — recarregar não
 * pode ser obrigatório (alguém pode estar no meio de um formulário), mas
 * também não pode ser esquecido.
 */
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";

const MINHA_VERSAO = process.env.NEXT_PUBLIC_VERSAO ?? "";
const A_CADA_MS = 5 * 60 * 1000;
const ADIAR_MS = 15 * 60 * 1000;

export default function AvisoAtualizacao() {
  const [nova, setNova] = useState(false);
  const adiadoAte = useRef(0);

  useEffect(() => {
    if (!MINHA_VERSAO) return;
    let vivo = true;
    async function conferir() {
      if (document.visibilityState !== "visible" || Date.now() < adiadoAte.current) return;
      try {
        const r = await fetch("/api/versao", { cache: "no-store" });
        if (!r.ok) return; // sessão vencida, rede caiu: tenta na próxima
        const { versao } = (await r.json()) as { versao?: string };
        if (vivo && versao && versao !== MINHA_VERSAO) setNova(true);
      } catch {
        // sem rede: tenta na próxima
      }
    }
    const intervalo = setInterval(conferir, A_CADA_MS);
    document.addEventListener("visibilitychange", conferir);
    return () => {
      vivo = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", conferir);
    };
  }, []);

  function depois() {
    adiadoAte.current = Date.now() + ADIAR_MS;
    setNova(false);
  }

  return (
    <Modal titulo="O Orkestria foi atualizado" aberto={nova} aoFechar={depois} larguraMax={440}>
      <div style={{ display: "grid", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Saiu uma versão nova, com correções. Recarregue a página para usar a versão atual — o que já foi
          salvo não se perde.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-fantasma" onClick={depois}>
            Depois
          </button>
          <button type="button" className="btn btn-primario" onClick={() => window.location.reload()}>
            Recarregar agora
          </button>
        </div>
      </div>
    </Modal>
  );
}
