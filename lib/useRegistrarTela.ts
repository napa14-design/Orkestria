"use client";

import { useEffect } from "react";
import { useSessao } from "@/components/SessaoContexto";
import { hojeISO } from "@/lib/dateUtils";
import { coletaAtiva } from "@/lib/usoTelas";

/**
 * Avisa o servidor que a tela foi aberta nesta sede (ver `lib/usoTelas.ts`). Uma
 * vez por dia, tela e sede neste navegador; falhar não pode atrapalhar quem está
 * trabalhando, e por isso não usa `apiPost`, que trata 401 e erro.
 */
export function useRegistrarTela(tela: "central" | "dia" | "semana" | "acompanhamento", sedeId: string) {
  const perfil = useSessao()?.perfil;
  useEffect(() => {
    const dia = hojeISO();
    if (!perfil || !sedeId || !coletaAtiva(dia)) return;
    // Com o perfil na chave: em computador compartilhado, o supervisor que entra
    // depois do coordenador na mesma aba não ficaria contado.
    const chave = `uso:${dia}:${perfil}:${tela}:${sedeId}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      // Sem storage só repete o aviso, e o servidor ignora o que já tem.
    }
    void fetch("/api/uso-telas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tela, sede_id: sedeId }),
      keepalive: true,
    }).catch(() => {});
  }, [tela, sedeId, perfil]);
}
