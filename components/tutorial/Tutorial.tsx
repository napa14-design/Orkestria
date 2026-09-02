"use client";

/**
 * Decide quando o holofote aparece e guarda o progresso.
 *
 * Abre sozinho na **primeira visita** de cada tela, para quem aceitou o convite
 * — é para isso que ele existe, ensinar sem a pessoa precisar procurar ajuda.
 * Quem adiou ou pulou não é perseguido: só um pedido explícito da trilha
 * (`?tutorial=<etapa>`) abre o holofote nesse caso.
 *
 * **Uma etapa por visita.** Terminou (ou saiu de) uma etapa, esta tela fica
 * quieta até a pessoa navegar de novo. Sem isso, as quatro etapas da agenda
 * emendariam em sequência e viraria o tour de 32 passos que ninguém lê.
 *
 * A aplicação continua inteira funcionando por baixo. O tutorial é apoio,
 * nunca dependência.
 */
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiPost, fetcher } from "@/lib/clientApi";
import { lerEstado, podeAutoIniciar } from "@/lib/tutorial/estado";
import { etapasDaRota } from "@/lib/tutorial/trilha";
import Holofote from "./Holofote";

type Progresso = { concluidas: string[]; estado: string };

export default function Tutorial() {
  const rota = usePathname() ?? "";
  const params = useSearchParams();
  const { data, mutate } = useSWR<Progresso>("/api/tutorial", fetcher);
  const [etapaAtiva, setEtapaAtiva] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);
  /** Rota em que já encerramos uma etapa — não abrir outra sem navegar. */
  const rotaEncerrada = useRef<string | null>(null);
  /** Etapas de que ela saiu nesta sessão: não insistir ao voltar na tela. */
  const recusadas = useRef<Set<string>>(new Set());

  /** Pedido explícito (link da trilha): vale mesmo para quem pulou o convite. */
  const pedida = params?.get("tutorial") ?? "";
  const daRota = etapasDaRota(rota);
  const concluidas = data?.concluidas;
  // A agenda hospeda quatro etapas; a pendente mais antiga é a próxima aula.
  const etapa =
    daRota.find((e) => e.id === pedida) ??
    daRota.find((e) => !concluidas?.includes(e.id) && !recusadas.current.has(e.id));

  // Um efeito só decide tudo. Dois (um para abrir, outro para limpar na troca
  // de rota) se atropelavam: o de abrir roda primeiro e o de limpar apagava,
  // deixando a tela sem holofote quando a navegação era pelo cliente.
  useEffect(() => {
    if (!data || !etapa) {
      setEtapaAtiva(null);
      return;
    }
    const explicita = etapa.id === pedida;
    const guiado = podeAutoIniciar(lerEstado(data.estado), data.concluidas.length);
    // `rotaEncerrada` vale TAMBÉM para o pedido explícito da trilha. Antes o
    // `explicita` passava por cima: terminado o último passo, o link
    // `?tutorial=locais` continuava na URL, a etapa era reaberta na hora e a
    // pessoa voltava ao PASSO 1 da etapa que acabara de concluir — parecia que
    // o tutorial não seguia adiante. Sair da tela e voltar reabre normalmente.
    const permitido = (explicita || guiado) && rotaEncerrada.current !== rota;
    if (!permitido) {
      setEtapaAtiva(null);
      return;
    }
    setEtapaAtiva(etapa.id);
    setPasso(0);
  }, [rota, etapa, data, pedida]);

  // Navegou: a tela nova pode ensinar de novo.
  useEffect(() => {
    if (rotaEncerrada.current !== rota) rotaEncerrada.current = null;
  }, [rota]);

  const encerrar = useCallback(
    async (concluida: boolean) => {
      const id = etapaAtiva;
      rotaEncerrada.current = rota;
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
    [etapaAtiva, mutate, rota],
  );

  if (!etapa || etapaAtiva !== etapa.id) return null;
  const atual = etapa.passos[passo];
  if (!atual) return null;

  return (
    <Holofote
      passo={atual}
      indice={passo}
      total={etapa.passos.length}
      precisa={etapa.precisa}
      aoAvancar={() => {
        if (passo + 1 >= etapa.passos.length) void encerrar(true);
        else setPasso((p) => p + 1);
      }}
      aoSair={() => void encerrar(false)}
    />
  );
}
