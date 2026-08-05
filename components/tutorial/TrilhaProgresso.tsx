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
import useSWR from "swr";
import { fetcher } from "@/lib/clientApi";
import { TRILHA } from "@/lib/tutorial/trilha";

export default function TrilhaProgresso() {
  const { data } = useSWR<{ concluidas: string[] }>("/api/tutorial", fetcher);
  if (!data) return null;

  const concluidas = new Set(data.concluidas);
  const feitas = TRILHA.filter((e) => concluidas.has(e.id)).length;
  if (feitas === TRILHA.length) return null;

  const proxima = TRILHA.find((e) => !concluidas.has(e.id));

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
              {atual ? (
                <Link href={etapa.rota}>
                  <strong>{etapa.nome}</strong>
                  <small>{etapa.ganho}</small>
                </Link>
              ) : (
                <span>
                  <strong>{etapa.nome}</strong>
                  {feita && <small>{etapa.ganho}</small>}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="trilha-nota">
        Faça no seu ritmo — o sistema abre o passo a passo quando você entrar em
        cada tela. Nada aqui impede você de usar o resto do sistema.
      </p>
    </section>
  );
}
