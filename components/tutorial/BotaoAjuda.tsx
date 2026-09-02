"use client";

/**
 * Botão de ajuda de uma tela: **escolher um dos tutoriais dela**.
 *
 * Nasceu na agenda em 02/09/2026 (*"coloca um botão de Ajuda nessa tela de
 * Rotina do Dia que abre qual tutorial a pessoa quer"*) e no mesmo dia foi
 * pedido para as demais. Por isso é genérico: descobre a tela sozinho pelo
 * `usePathname` e pergunta à trilha quais etapas moram nela.
 *
 * **Some quando não tem o que ensinar.** Em tela sem etapa na trilha e sem
 * legenda própria, ele não renderiza nada — botão que abre uma lista vazia é
 * pior do que botão ausente, e a doutrina do projeto não deixa a operação
 * crescer sem contrapartida.
 *
 * `children` é a legenda específica da tela (cores, atalhos), quando existir;
 * a agenda usa isso.
 */
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { etapasDaRota } from "@/lib/tutorial/trilha";

export default function BotaoAjuda({
  titulo = "Ajuda desta tela",
  /** Chamado antes de abrir o tutorial — a agenda usa para voltar ao modo Dia. */
  aoComecarTutorial,
  children,
}: {
  titulo?: string;
  aoComecarTutorial?: () => void;
  children?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  const rota = usePathname() ?? "";
  const etapas = etapasDaRota(rota);

  if (etapas.length === 0 && !children) return null;

  function comecar(id: string) {
    setAberto(false);
    aoComecarTutorial?.();
    router.push(`${rota}?tutorial=${id}`);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-mini btn-fantasma"
        onClick={() => setAberto(true)}
        title={etapas.length > 0 ? "Tutoriais desta tela" : "Como usar esta tela"}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        ❔ Ajuda
      </button>

      <Modal titulo={titulo} aberto={aberto} aoFechar={() => setAberto(false)} larguraMax={560}>
        {etapas.length > 0 && (
          <section style={{ marginBottom: children ? 18 : 0 }}>
            <span className="rotulo">Quer que eu te mostre?</span>
            <p style={{ fontSize: 12, color: "var(--tinta-3)", margin: "4px 0 10px" }}>
              {etapas.length === 1 ? "Um passeio curto" : "Cada um destes é um passeio curto"} pela
              tela: aponta onde ficam as coisas e explica o que fazem. Nada é preenchido nem
              alterado.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {etapas.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => comecar(e.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "var(--cartao)",
                    border: "var(--borda)",
                    borderRadius: "var(--raio)",
                    padding: "9px 12px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--tinta)" }}>
                    {e.nome}{" "}
                    <span style={{ color: "var(--tinta-3)" }}>· {e.passos.length} passos</span>
                  </span>
                  <span
                    style={{ display: "block", fontSize: 11, color: "var(--tinta-2)", marginTop: 2 }}
                  >
                    {e.ganho}
                  </span>
                  {/* Dizer o pré-requisito ANTES de abrir evita a pessoa começar
                      um tutorial que para no primeiro passo por falta de dado. */}
                  {e.precisa && (
                    <span
                      style={{ display: "block", fontSize: 11, color: "var(--tinta-3)", marginTop: 2 }}
                    >
                      Precisa de {e.precisa}.
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {children && (
          <>
            {etapas.length > 0 && (
              <div style={{ borderTop: "1px solid var(--linha)", paddingTop: 14 }}>
                <span className="rotulo" style={{ display: "block", marginBottom: 8 }}>
                  Legenda da tela
                </span>
              </div>
            )}
            {children}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="btn btn-primario" onClick={() => setAberto(false)}>
            Fechar
          </button>
        </div>
      </Modal>
    </>
  );
}
