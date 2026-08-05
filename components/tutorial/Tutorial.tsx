"use client";

/**
 * Decide quando o tutorial aparece e guarda o progresso.
 *
 * Dispara sozinho na **primeira visita** de cada tela que tem etapa — é para
 * isso que ele existe, ensinar sem a pessoa precisar procurar ajuda. Sai a
 * qualquer momento, e sair já conta como "não mostrar de novo nesta sessão":
 * insistir com quem recusou é o caminho mais curto para virar estorvo.
 *
 * A aplicação continua inteira funcionando por baixo. O tutorial é apoio,
 * nunca dependência.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiPost, fetcher } from "@/lib/clientApi";
import { etapaDaRota } from "@/lib/tutorial/trilha";
import Holofote from "./Holofote";

export default function Tutorial() {
  const rota = usePathname();
  const { data, mutate } = useSWR<{ concluidas: string[] }>("/api/tutorial", fetcher);
  const [etapaAtiva, setEtapaAtiva] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);
  /** Etapas recusadas nesta sessão — não insistir até recarregar a página. */
  const recusadas = useRef<Set<string>>(new Set());

  const etapa = etapaDaRota(rota ?? "");
  const concluidas = data?.concluidas;

  useEffect(() => {
    if (!etapa || !concluidas) return;
    if (concluidas.includes(etapa.id) || recusadas.current.has(etapa.id)) return;
    setEtapaAtiva(etapa.id);
    setPasso(0);
  }, [etapa, concluidas]);

  // Trocar de tela no meio de uma etapa encerra a etapa: o roteiro dela vale
  // para aquela tela, e seguir apontando para elementos de outra página seria
  // exatamente o "aponta para o nada" que a gente quer evitar.
  useEffect(() => {
    setEtapaAtiva(null);
  }, [rota]);

  const encerrar = useCallback(
    async (concluida: boolean) => {
      const id = etapaAtiva;
      setEtapaAtiva(null);
      setPasso(0);
      if (!id) return;
      if (concluida) {
        await apiPost("/api/tutorial", { etapa: id });
        await mutate();
      } else {
        recusadas.current.add(id);
      }
    },
    [etapaAtiva, mutate],
  );

  if (!etapa || etapaAtiva !== etapa.id) return null;
  const atual = etapa.passos[passo];
  if (!atual) return null;

  return (
    <Holofote
      passo={atual}
      indice={passo}
      total={etapa.passos.length}
      aoAvancar={() => {
        if (passo + 1 >= etapa.passos.length) void encerrar(true);
        else setPasso((p) => p + 1);
      }}
      aoSair={() => void encerrar(false)}
    />
  );
}
