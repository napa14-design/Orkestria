"use client";

/**
 * O convite, no primeiro acesso.
 *
 * Antes disto o tutorial simplesmente começava sozinho — a pessoa era jogada
 * dentro dele sem saber que existia um caminho de 11 etapas pela frente. O
 * convite enquadra: diz o que é, quanto é, e pede licença.
 *
 * Três respostas, e a diferença entre elas importa:
 * **Ver** liga os holofotes · **Adiar** cala tudo por um dia e volta a
 * perguntar · **Pular** não pergunta mais (a volta fica na trilha).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import Modal from "@/components/Modal";
import { apiPost, fetcher } from "@/lib/clientApi";
import { deveConvidar, lerEstado } from "@/lib/tutorial/estado";
import { TRILHA } from "@/lib/tutorial/trilha";

type Progresso = { concluidas: string[]; estado: string };

export default function BoasVindas() {
  const router = useRouter();
  const { data, mutate } = useSWR<Progresso>("/api/tutorial", fetcher);
  const [enviando, setEnviando] = useState<string | null>(null);

  if (!data) return null;
  if (!deveConvidar(lerEstado(data.estado), data.concluidas.length)) return null;

  async function responder(acao: "ver" | "adiar" | "pular") {
    setEnviando(acao);
    try {
      await apiPost("/api/tutorial", { acao });
      await mutate();
      // "Ver" leva direto para a primeira etapa; ficar na Central obrigaria a
      // pessoa a adivinhar para onde ir depois de aceitar.
      if (acao === "ver") router.push(TRILHA[0].rota);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <Modal
      titulo="Boas-vindas ao Orkestria"
      aberto
      // Fechar no X é o mesmo que adiar: a saída menos destrutiva.
      aoFechar={() => void responder("adiar")}
      larguraMax={520}
    >
      <p className="boas-vindas-linha">
        Você já sabe montar a rota da sua sede — esse conhecimento continua sendo
        seu. O que muda é que ele sai da planilha e passa a morar aqui.
      </p>
      <p className="boas-vindas-linha">
        Preparei um <strong>passo a passo dentro do próprio sistema</strong>: a tela
        escurece, o que você precisa clicar fica iluminado, e um balão explica o
        porquê. São <strong>{TRILHA.length} etapas curtas</strong> — e ao final delas a
        sua sede está montada de verdade, não é simulação.
      </p>
      <p className="boas-vindas-linha boas-vindas-calma">
        Faça no seu ritmo: dá para parar no meio e voltar amanhã de onde parou. O
        sistema inteiro continua funcionando com ou sem o passo a passo.
      </p>

      <div className="boas-vindas-botoes">
        <button
          type="button"
          className="btn btn-primario"
          onClick={() => void responder("ver")}
          disabled={!!enviando}
        >
          {enviando === "ver" ? "Abrindo…" : "Ver o passo a passo →"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void responder("adiar")}
          disabled={!!enviando}
          title="Some por hoje e volto a oferecer amanhã"
        >
          Adiar
        </button>
        <button
          type="button"
          className="btn btn-fantasma"
          onClick={() => void responder("pular")}
          disabled={!!enviando}
          title="Não pergunto mais; você começa pela trilha quando quiser"
        >
          Pular
        </button>
      </div>
      <p className="boas-vindas-rodape">
        <strong>Adiar</strong> volta a perguntar amanhã. <strong>Pular</strong> não
        pergunta mais — mas a trilha fica aqui na tela inicial, e você começa
        quando quiser.
      </p>
    </Modal>
  );
}
