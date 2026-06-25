"use client";

/**
 * Barra "Passos do dia" (modo diário): gerar/salvar rota padrão, repetir dia
 * anterior, faltas, imprimir fichas, registrar realizado e densidade da grade.
 */
import Link from "next/link";
import AjudaAgenda from "./AjudaAgenda";
import { formatarDataBR } from "@/lib/dateUtils";

interface BarraPassosDoDiaProps {
  sedeId: string;
  data: string;
  temRotaPadrao: boolean;
  temRotinas: boolean;
  fonteRepetir: { data: string; n: number } | null;
  nFaltas: number;
  faltamRegistrar: number;
  denso: boolean;
  gerando: boolean;
  salvandoPadrao: boolean;
  repetindo: boolean;
  aoGerarDia: () => void;
  aoSalvarRotaPadrao: () => void;
  aoRepetirDiaAnterior: () => void;
  aoAlternarDenso: () => void;
}

export default function BarraPassosDoDia({
  sedeId,
  data,
  temRotaPadrao,
  temRotinas,
  fonteRepetir,
  nFaltas,
  faltamRegistrar,
  denso,
  gerando,
  salvandoPadrao,
  repetindo,
  aoGerarDia,
  aoSalvarRotaPadrao,
  aoRepetirDiaAnterior,
  aoAlternarDenso,
}: BarraPassosDoDiaProps) {
  return (
    <div
      className="painel"
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", marginBottom: 10 }}
    >
      <span className="rotulo" style={{ color: "var(--acento)" }}>Passos do dia</span>
      {temRotaPadrao && (
        <button
          className="btn btn-mini btn-primario"
          onClick={aoGerarDia}
          disabled={gerando}
          title="Gera o dia a partir da rota padrão da sede (não duplica o que já existe)"
        >
          {gerando ? "Gerando…" : "⚡ Gerar o dia da rota padrão"}
        </button>
      )}
      {!temRotaPadrao && temRotinas && (
        <button
          className="btn btn-mini"
          onClick={aoSalvarRotaPadrao}
          disabled={salvandoPadrao}
          title="Salva o dia atual como a rota padrão da sede — depois, dias vazios são gerados em 1 clique"
        >
          {salvandoPadrao ? "Salvando…" : "★ Salvar como rota padrão"}
        </button>
      )}
      {fonteRepetir && (
        <button
          className="btn btn-mini"
          onClick={aoRepetirDiaAnterior}
          disabled={repetindo}
          title={`Copia as tarefas de ${formatarDataBR(fonteRepetir.data)} para o dia aberto (conflitos são pulados)`}
        >
          {repetindo ? "Repetindo…" : `↺ Repetir o dia anterior (${formatarDataBR(fonteRepetir.data)})`}
        </button>
      )}
      <Link
        href="/ausencias"
        className="btn btn-mini btn-fantasma"
        style={nFaltas > 0 ? { borderColor: "var(--amarelo)", color: "var(--tinta)" } : undefined}
        title={nFaltas > 0 ? `${nFaltas} ausência(s) hoje — redistribua as tarefas` : "Faltas e ausências do dia"}
      >
        {nFaltas > 0 ? `⚠ Faltas (${nFaltas})` : "Faltas"}
      </Link>
      {sedeId && (
        <a
          href={`/api/fichas/pdf?data=${data}&sede=${sedeId}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-mini btn-fantasma"
          style={{ textDecoration: "none" }}
        >
          🖨 Imprimir fichas
        </a>
      )}
      {faltamRegistrar > 0 ? (
        <Link
          href="/acompanhamento"
          className="btn btn-mini btn-primario"
          style={{ textDecoration: "none" }}
          title={`${faltamRegistrar} tarefa(s) sem o realizado lançado`}
        >
          ✅ Registrar o realizado ({faltamRegistrar})
        </Link>
      ) : temRotinas ? (
        <Link href="/acompanhamento" className="btn btn-mini btn-fantasma" style={{ textDecoration: "none" }}>
          ✓ Realizado lançado
        </Link>
      ) : (
        <Link href="/acompanhamento" className="btn btn-mini btn-fantasma">
          ✅ Registrar o realizado
        </Link>
      )}
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-mini btn-fantasma"
          onClick={aoAlternarDenso}
          title="Alterna a altura das linhas — compacto mostra o dia inteiro com menos rolagem"
        >
          {denso ? "⊕ Expandir" : "⊖ Compactar"}
        </button>
        <AjudaAgenda />
      </span>
    </div>
  );
}
