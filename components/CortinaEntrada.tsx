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
    const t2 = setTimeout(() => setFase("oculta"), 340 + 1900); // fim da abertura
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
      <div className={`cortina-bando${abre ? " abre" : ""}`}>
      <svg viewBox="0 0 100 26" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bandoVeludo" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6f0c26" />
            <stop offset="8%" stopColor="#9c1843" />
            <stop offset="16%" stopColor="#6f0c26" />
            <stop offset="24%" stopColor="#9c1843" />
            <stop offset="32%" stopColor="#6f0c26" />
            <stop offset="40%" stopColor="#9c1843" />
            <stop offset="50%" stopColor="#6f0c26" />
            <stop offset="60%" stopColor="#9c1843" />
            <stop offset="68%" stopColor="#6f0c26" />
            <stop offset="76%" stopColor="#9c1843" />
            <stop offset="84%" stopColor="#6f0c26" />
            <stop offset="92%" stopColor="#9c1843" />
            <stop offset="100%" stopColor="#6f0c26" />
          </linearGradient>
          <linearGradient id="bandoSombra" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.42)" />
          </linearGradient>
        </defs>
        {/* swags: topo reto, base em arcos curvos (drapeado) */}
        <path
          d="M0 0 H100 V12 Q90 26 80 13 Q70 26 60 13 Q50 26 40 13 Q30 26 20 13 Q10 26 0 13 Z"
          fill="url(#bandoVeludo)"
        />
        <path
          d="M0 0 H100 V12 Q90 26 80 13 Q70 26 60 13 Q50 26 40 13 Q30 26 20 13 Q10 26 0 13 Z"
          fill="url(#bandoSombra)"
        />
      </svg>
      </div>
    </div>
  );
}
