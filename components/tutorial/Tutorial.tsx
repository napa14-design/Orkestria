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
import { deveAbrirSozinho, lerEstado } from "@/lib/tutorial/estado";
import { etapasDaRota } from "@/lib/tutorial/trilha";
import Holofote from "./Holofote";

type Progresso = { concluidas: string[]; estado: string };

export default function Tutorial() {
  const rota = usePathname() ?? "";
  const params = useSearchParams();
  const { data, mutate } = useSWR<Progresso>("/api/tutorial", fetcher);
  const [etapaAtiva, setEtapaAtiva] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);
  /**
   * A ÚLTIMA etapa encerrada e onde. Guarda o id, não só a rota: bloquear a rota
   * inteira fazia a Ajuda da agenda parar de funcionar — terminado um passeio,
   * escolher outro da lista não abria nada, porque a rota continuava "encerrada"
   * (a escolha é navegação do cliente, a rota não muda).
   */
  const encerrada = useRef<{ rota: string; id: string } | null>(null);
  /** Etapas de que ela saiu nesta sessão: não insistir ao voltar na tela. */
  const recusadas = useRef<Set<string>>(new Set());

  /** Pedido explícito (link da trilha): vale mesmo para quem pulou o convite. */
  const pedida = params?.get("tutorial") ?? "";
  const daRota = etapasDaRota(rota);
  const concluidas = data?.concluidas;
  // A agenda hospeda cinco etapas; a pendente mais antiga é a próxima aula.
  const etapa =
    daRota.find((e) => e.id === pedida) ??
    daRota.find((e) => !concluidas?.includes(e.id) && !recusadas.current.has(e.id));
  /** Quantas aulas desta tela já foram dadas — número, para entrar nas deps. */
  const jaEnsinadas = daRota.filter((e) => concluidas?.includes(e.id)).length;

  // Um efeito só decide tudo. Dois (um para abrir, outro para limpar na troca
  // de rota) se atropelavam: o de abrir roda primeiro e o de limpar apagava,
  // deixando a tela sem holofote quando a navegação era pelo cliente.
  useEffect(() => {
    if (!data || !etapa) {
      setEtapaAtiva(null);
      return;
    }
    const explicita = etapa.id === pedida;
    const guiado = deveAbrirSozinho(lerEstado(data.estado), data.concluidas.length, jaEnsinadas);
    // Pedido explícito só é recusado quando é a MESMA etapa que acabou de
    // encerrar nesta tela — senão o link `?tutorial=x`, que continua na URL,
    // reabriria no passo 1 aquilo que a pessoa acabou de concluir. Pedir OUTRA
    // etapa da mesma tela é legítimo, e é o que a Ajuda faz.
    const mesmaQueEncerrou =
      encerrada.current?.rota === rota && encerrada.current?.id === etapa.id;
    const permitido = explicita
      ? !mesmaQueEncerrou
      : guiado && encerrada.current?.rota !== rota;
    if (!permitido) {
      setEtapaAtiva(null);
      return;
    }
    setEtapaAtiva(etapa.id);
    setPasso(0);
  }, [rota, etapa, data, pedida, jaEnsinadas]);

  // Navegou para outra tela: a nova pode ensinar sozinha de novo.
  useEffect(() => {
    if (encerrada.current && encerrada.current.rota !== rota) encerrada.current = null;
  }, [rota]);

  const encerrar = useCallback(
    async (concluida: boolean) => {
      const id = etapaAtiva;
      if (id) encerrada.current = { rota, id };
      setEtapaAtiva(null);
      setPasso(0);
      if (!id) return;
      if (concluida) {
        await apiPost("/api/tutorial", { etapa: id });
      } else {
        // "Sair do tutorial" passa a fazer o que o botão diz. Guardado só em
        // memória, ele não sobrevivia a um F5: a mesma etapa voltava no passo 1,
        // para sempre, porque sair nunca virou dado nenhum. Quem saiu volta
        // quando quiser — por ❔ Ajuda ou pela trilha da Central, que continuam
        // abrindo qualquer etapa mesmo para quem pulou.
        recusadas.current.add(id);
        await apiPost("/api/tutorial", { acao: "pular" });
      }
      await mutate();
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
