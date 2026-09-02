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
  limpando?: boolean;
  /** Desfaz o dia. "geradas" = só o que a máquina criou; "todas" = o dia inteiro. */
  aoLimparDia?: (escopo: "geradas" | "todas") => void;
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
  limpando,
  aoLimparDia,
  aoSalvarRotaPadrao,
  aoAlternarDenso,
}: BarraPassosDoDiaProps) {
  return (
    <div className="painel agenda-acoes-contextuais">
      <span className="rotulo agenda-acoes-rotulo">Agora</span>

      {!temRotaPadrao && temRotinas && (
        <button
          className="btn btn-mini"
          data-tour="ensinar-rota"
          onClick={aoSalvarRotaPadrao}
          disabled={salvandoPadrao}
          title="Ensina este dia como rota padrão; depois, dias vazios são gerados em um clique"
        >
          {salvandoPadrao ? "Salvando…" : "★ Ensinar esta rota"}
        </button>
      )}

      {/* O caminho de volta do "Gerar o dia": só aparece quando há o que
          desfazer, e some sozinho no dia vazio. */}
      {temRotinas && aoLimparDia && (
        <button
          className="btn btn-mini btn-fantasma"
          data-tour="desfazer-geracao"
          onClick={() => aoLimparDia("geradas")}
          disabled={limpando}
          title="Remove os blocos criados por Gerar/Repetir/Aplicar modelo. O que você montou à mão e o que já tem realizado ficam."
        >
          {limpando ? "Limpando…" : "↺ Desfazer a geração"}
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
          data-tour="imprimir-fichas"
        >
          Imprimir fichas
        </a>
      )}

      {faltamRegistrar > 0 && (
        <Link
          href="/acompanhamento"
          className="btn btn-mini btn-primario"
          data-tour="confirmar-realizados"
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
