"use client";

export type EstadoSalvamentoAgenda = "pronto" | "salvando" | "salvo" | "erro";

/** Faixa operacional da agenda: modo de alocação por clique, salvamento e desfazer. */
export default function BarraAcaoRapida({
  tarefaNome,
  sugestao,
  estado,
  salvoEm,
  podeDesfazer,
  desfazendo,
  aoCancelarTarefa,
  aoAplicarSugestao,
  aoDesfazer,
}: {
  tarefaNome?: string;
  sugestao?: string;
  estado: EstadoSalvamentoAgenda;
  salvoEm?: string;
  podeDesfazer: boolean;
  desfazendo: boolean;
  aoCancelarTarefa: () => void;
  aoAplicarSugestao?: () => void;
  aoDesfazer: () => void;
}) {
  const textoEstado =
    estado === "salvando"
      ? "Salvando…"
      : estado === "erro"
        ? "Falha ao salvar"
        : estado === "salvo" && salvoEm
          ? `Salvo às ${salvoEm}`
          : "Pronto para editar";

  return (
    <div className={`barra-acao-rapida${tarefaNome ? " ativa" : ""}`} aria-live="polite">
      <div className="barra-acao-modo">
        <span className="rotulo">Modo rápido</span>
        {tarefaNome ? (
          <>
            <strong>{tarefaNome}</strong>
            {sugestao ? (
              <span className="barra-acao-sugestao">♬ Sugestão: {sugestao}</span>
            ) : (
              <span className="barra-acao-instrucao">Sem encaixe automático · escolha um horário manualmente</span>
            )}
            {aoAplicarSugestao && (
              <button
                type="button"
                className="btn btn-mini btn-primario"
                onClick={aoAplicarSugestao}
                disabled={estado === "salvando"}
                title="Aplicar o melhor encaixe sugerido (Enter)"
              >
                Aplicar sugestão <kbd className="tecla-atalho">Enter</kbd>
              </button>
            )}
            <button type="button" className="btn btn-mini btn-fantasma" onClick={aoCancelarTarefa}>
              Encerrar <span className="so-desktop">(Esc)</span>
            </button>
          </>
        ) : (
          <span className="barra-acao-instrucao">Selecione uma tarefa à esquerda ou arraste normalmente.</span>
        )}
      </div>

      <div className="barra-acao-status">
        <span className={`status-salvamento status-${estado}`}>
          <span aria-hidden="true">{estado === "salvando" ? "◌" : estado === "erro" ? "!" : "✓"}</span>
          {textoEstado}
        </span>
        {podeDesfazer && (
          <button
            type="button"
            className="btn btn-mini"
            onClick={aoDesfazer}
            disabled={desfazendo || estado === "salvando"}
            title="Desfazer a última alteração (Ctrl+Z)"
          >
            {desfazendo ? "Desfazendo…" : <>↶ Desfazer <kbd className="tecla-atalho">Ctrl Z</kbd></>}
          </button>
        )}
      </div>
    </div>
  );
}
