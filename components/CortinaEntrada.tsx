"use client";

/**
 * Cortina de teatro que abre revelando o sistema logo após o login.
 * O login marca sessionStorage["ork:cortina"]; ao montar a tela inicial,
 * desenhamos as duas metades fechadas e as deslizamos para os lados.
 * Respeita prefers-reduced-motion (não anima nesse caso).
 */
import { useEffect, useState } from "react";

type Fase = "oculta" | "fechada" | "abrindo";

export default function CortinaEntrada() {
  const [fase, setFase] = useState<Fase>("oculta");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("ork:cortina") !== "1") return;
    sessionStorage.removeItem("ork:cortina");

    const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) return;

    setFase("fechada");
    const t1 = setTimeout(() => setFase("abrindo"), 340); // beat fechada
    const t2 = setTimeout(() => setFase("oculta"), 340 + 1850); // fim da abertura
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (fase === "oculta") return null;

  const abre = fase === "abrindo";
  return (
    <div className="cortina-wrap" aria-hidden="true">
      <div className={`cortina-painel esq${abre ? " abre" : ""}`} />
      <div className={`cortina-painel dir${abre ? " abre" : ""}`} />
    </div>
  );
}
