"use client";

/**
 * A trilha na Central: onde a pessoa está no aprendizado e o que falta.
 *
 * É o que dá a sensação de caminho inteiro sem despejar 30 passos de uma vez —
 * e o que permite ela sair no meio e voltar amanhã sabendo onde parou.
 *
 * **Some sozinha quando tudo está concluído.** Aprendizado tem fim; deixar o
 * quadro para sempre seria acrescentar mobília permanente à tela mais visitada.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiPost, fetcher } from "@/lib/clientApi";
import { lerEstado, podeAutoIniciar } from "@/lib/tutorial/estado";
import { TRILHA } from "@/lib/tutorial/trilha";

export default function TrilhaProgresso() {
  const router = useRouter();
  const { data, mutate } = useSWR<{ concluidas: string[]; estado: string }>(
    "/api/tutorial",
    fetcher,
  );
  if (!data) return null;

  const concluidas = new Set(data.concluidas);
  const feitas = TRILHA.filter((e) => concluidas.has(e.id)).length;
  if (feitas === TRILHA.length) return null;

  const proxima = TRILHA.find((e) => !concluidas.has(e.id));
  // Quem adiou ou pulou não recebe holofote sozinho — então a trilha precisa
  // ser o caminho de volta, e ele tem que ser óbvio.
  const guiado = podeAutoIniciar(lerEstado(data.estado), concluidas.size);

  async function retomar() {
    await apiPost("/api/tutorial", { acao: "retomar" });
    await mutate();
    if (proxima) router.push(`${proxima.rota}?tutorial=${proxima.id}`);
  }

  return (
    <section className="trilha" aria-label="Sua trilha de aprendizado">
      <header>
        <span className="rotulo">
          Sua trilha · {feitas} de {TRILHA.length}
        </span>
        <div className="trilha-barra" aria-hidden="true">
          <i style={{ width: `${(feitas / TRILHA.length) * 100}%` }} />
        </div>
      </header>

      <ol>
        {TRILHA.map((etapa) => {
          const feita = concluidas.has(etapa.id);
          const atual = etapa.id === proxima?.id;
          return (
            <li key={etapa.id} className={feita ? "feita" : atual ? "atual" : ""}>
              <span className="trilha-marca" aria-hidden="true">
                {feita ? "✓" : atual ? "→" : ""}
              </span>
              {/* TODA etapa é clicável — concluída, atual ou futura.
                  Antes só a atual era link, e só com o passo a passo ligado: quem
                  já tinha feito uma aula não conseguia revê-la, e quem queria
                  pular para a que interessava também não. A trilha virava um
                  quadro de leitura. Pergunta do dono em 02/09/2026: *"e se eu já
                  fiz um tutorial, agora é liberado eu escolher qual eu quero
                  rever?"*.

                  Clicar numa etapa cujo `precisa` ainda não existe não quebra: o
                  holofote diz o motivo e oferece seguir. Por isso o pré-requisito
                  aparece aqui também — para a escolha ser informada antes do
                  clique, e não uma surpresa depois. */}
              <Link
                href={`${etapa.rota}?tutorial=${etapa.id}`}
                title={feita ? `Rever: ${etapa.nome}` : `Começar: ${etapa.nome}`}
              >
                <strong>{etapa.nome}</strong>
                <small>
                  {feita && "Rever · "}
                  {etapa.ganho}
                  {etapa.precisa && ` · Precisa de ${etapa.precisa}`}
                </small>
              </Link>
            </li>
          );
        })}
      </ol>

      {guiado ? (
        <p className="trilha-nota">
          Faça no seu ritmo — o sistema abre o passo a passo quando você entrar em
          cada tela. Nada aqui impede você de usar o resto do sistema.
        </p>
      ) : (
        <div className="trilha-retomar">
          <p>
            O passo a passo está desligado. Quando quiser, ele continua de onde a
            trilha parou.
          </p>
          <button type="button" className="btn btn-primario" onClick={() => void retomar()}>
            Começar o passo a passo →
          </button>
        </div>
      )}
    </section>
  );
}
