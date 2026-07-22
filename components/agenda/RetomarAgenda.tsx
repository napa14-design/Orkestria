"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CHAVE_CONTEXTO_AGENDA,
  lerContextoAgenda,
  type ContextoAgendaPersistido,
} from "@/lib/contextoAgenda";
import { formatarDataBR } from "@/lib/dateUtils";

const ROTULO_TURNO: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  integral: "Integral",
};

/** Atalho da tela inicial para voltar ao último ponto operacional da sessão. */
export default function RetomarAgenda() {
  const [contexto, setContexto] = useState<Partial<ContextoAgendaPersistido> | null>(null);

  useEffect(() => {
    setContexto(
      lerContextoAgenda(sessionStorage.getItem(CHAVE_CONTEXTO_AGENDA)),
    );
  }, []);

  if (!contexto?.data) return null;
  const detalhes = [
    formatarDataBR(contexto.data),
    contexto.turno ? ROTULO_TURNO[contexto.turno] ?? contexto.turno : "Todos os turnos",
    contexto.modo === "semana" ? "Visão semanal" : "Visão diária",
  ];

  return (
    <Link href="/rotinas" className="retomar-agenda entra" aria-label="Continuar na agenda do último contexto">
      <span className="retomar-agenda-marca" aria-hidden="true">↺</span>
      <span style={{ minWidth: 0 }}>
        <span className="rotulo" style={{ color: "var(--acento)" }}>Retomar operação</span>
        <strong>Continuar de onde parei</strong>
        <span className="retomar-agenda-detalhes">
          {detalhes.join(" · ")}
          {contexto.tarefa_rapida_id ? " · tarefa pronta para alocar" : ""}
        </span>
      </span>
      <span className="retomar-agenda-seta" aria-hidden="true">Continuar →</span>
    </Link>
  );
}
