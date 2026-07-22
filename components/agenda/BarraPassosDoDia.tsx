"use client";

/**
 * Só mostra ações que têm trabalho concreto no estado atual. Preparação do dia
 * vazio fica no chamado principal da página; esta faixa reúne utilidades do
 * dia já montado e a ação de ensinar a primeira rota padrão.
 */
import Link from "next/link";
import AjudaAgenda from "./AjudaAgenda";

interface BarraPassosDoDiaProps {
  sedeId: string;
  data: string;
  temRotaPadrao: boolean;
  temRotinas: boolean;
  nFaltas: number;
  faltamRegistrar: number;
  denso: boolean;
  salvandoPadrao: boolean;
  aoSalvarRotaPadrao: () => void;
  aoAlternarDenso: () => void;
}

export default function BarraPassosDoDia({
  sedeId,
  data,
  temRotaPadrao,
  temRotinas,
  nFaltas,
  faltamRegistrar,
  denso,
  salvandoPadrao,
  aoSalvarRotaPadrao,
  aoAlternarDenso,
}: BarraPassosDoDiaProps) {
  return (
    <div className="painel agenda-acoes-contextuais">
      <span className="rotulo agenda-acoes-rotulo">Agora</span>

      {!temRotaPadrao && temRotinas && (
        <button
          className="btn btn-mini"
          onClick={aoSalvarRotaPadrao}
          disabled={salvandoPadrao}
          title="Ensina este dia como rota padrão; depois, dias vazios são gerados em um clique"
        >
          {salvandoPadrao ? "Salvando…" : "★ Ensinar esta rota"}
        </button>
      )}

      {nFaltas > 0 && (
        <Link
          href="/ausencias"
          className="btn btn-mini agenda-acao-alerta"
          title={`${nFaltas} ausência(s) na data selecionada`}
        >
          ⚠ Ausências ({nFaltas})
        </Link>
      )}

      {temRotinas && sedeId && (
        <a
          href={`/api/fichas/pdf?data=${data}&sede=${sedeId}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-mini btn-fantasma"
        >
          Imprimir fichas
        </a>
      )}

      {faltamRegistrar > 0 && (
        <Link
          href="/acompanhamento"
          className="btn btn-mini btn-primario"
          title={`${faltamRegistrar} tarefa(s) cujo horário já terminou`}
        >
          Confirmar realizados ({faltamRegistrar})
        </Link>
      )}

      <span className="agenda-acoes-utilidades">
        {temRotinas && (
          <button
            type="button"
            className="btn btn-mini btn-fantasma"
            onClick={aoAlternarDenso}
            title="Alterna a altura das linhas"
          >
            {denso ? "Expandir grade" : "Compactar grade"}
          </button>
        )}
        <AjudaAgenda />
      </span>
    </div>
  );
}
