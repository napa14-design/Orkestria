"use client";

/**
 * Modais da tela de rotinas: autorizar conflito manualmente e "quanto tempo
 * hoje?" (duração de tarefas de presença/manual). O estado/promessa vive na
 * página; aqui é só apresentação + callbacks.
 */
import Modal from "@/components/Modal";
import { formatarDuracao } from "@/lib/dateUtils";

/**
 * Texto do modal de confirmação. O padrão é a autorização de conflito, que foi
 * o primeiro uso; quem confirma outra coisa (apagar o dia, por exemplo) passa o
 * seu próprio — senão o botão de uma exclusão em massa diz "Autorizar mesmo
 * assim", que foi o que apareceu na tela em 25/08.
 */
export interface TextoConfirmacao {
  titulo: string;
  intro: string;
  nota?: string;
  confirmar: string;
}

const CONFLITO: TextoConfirmacao = {
  titulo: "Autorizar conflito manualmente?",
  intro: "Esta alocação tem um conflito que você pode autorizar:",
  nota: "Se autorizar, a rotina fica marcada como autorizada manualmente (e o histórico registra isso).",
  confirmar: "Autorizar mesmo assim",
};

interface ModaisRotinaProps {
  confirmacao: { mensagens: string[]; texto?: TextoConfirmacao } | null;
  aoResponderConfirmacao: (ok: boolean) => void;
  duracaoPrompt: { nome: string } | null;
  duracaoInput: string;
  aoMudarDuracaoInput: (v: string) => void;
  aoResponderDuracao: (min: number | null) => void;
}

export default function ModaisRotina({
  confirmacao,
  aoResponderConfirmacao,
  duracaoPrompt,
  duracaoInput,
  aoMudarDuracaoInput,
  aoResponderDuracao,
}: ModaisRotinaProps) {
  const texto = confirmacao?.texto ?? CONFLITO;
  return (
    <>
      <Modal
        titulo={texto.titulo}
        aberto={!!confirmacao}
        aoFechar={() => aoResponderConfirmacao(false)}
        larguraMax={460}
      >
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 10 }}>{texto.intro}</p>
        <div
          style={{
            background: "var(--papel-2)",
            borderLeft: "4px solid var(--amarelo)",
            borderRadius: 3,
            padding: "8px 12px",
            display: "grid",
            gap: 4,
            marginBottom: 12,
          }}
        >
          {confirmacao?.mensagens.map((m, i) => (
            <div key={i} style={{ fontSize: 13, color: "var(--tinta)" }}>
              ⚠ {m}
            </div>
          ))}
        </div>
        {texto.nota && (
          <p style={{ fontSize: 12, color: "var(--tinta-3)", marginBottom: 16 }}>{texto.nota}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" onClick={() => aoResponderConfirmacao(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primario" onClick={() => aoResponderConfirmacao(true)}>
            {texto.confirmar}
          </button>
        </div>
      </Modal>

      <Modal
        titulo="Quanto tempo hoje?"
        aberto={!!duracaoPrompt}
        aoFechar={() => aoResponderDuracao(null)}
        larguraMax={420}
      >
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 12 }}>
          <strong>{duracaoPrompt?.nome}</strong> é uma atividade de duração variável (presença/
          plantão ou tempo manual). Informe a duração <strong>deste dia</strong> — não muda a tarefa.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[15, 30, 60, 90, 120].map((m) => (
            <button
              key={m}
              type="button"
              className="btn btn-mini"
              onClick={() => aoMudarDuracaoInput(String(m))}
              style={{ fontWeight: 700, outline: Number(duracaoInput) === m ? "2px solid var(--acento)" : "none" }}
            >
              {formatarDuracao(m)}
            </button>
          ))}
        </div>
        <label className="campo" style={{ marginBottom: 16 }}>
          <span className="rotulo">Duração (minutos)</span>
          <input
            type="number"
            min="5"
            step="5"
            value={duracaoInput}
            autoFocus
            onChange={(e) => aoMudarDuracaoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && Number(duracaoInput) > 0) aoResponderDuracao(Number(duracaoInput));
            }}
          />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" onClick={() => aoResponderDuracao(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primario"
            disabled={!(Number(duracaoInput) > 0)}
            onClick={() => aoResponderDuracao(Number(duracaoInput))}
          >
            Colocar na agenda
          </button>
        </div>
      </Modal>
    </>
  );
}
