"use client";

/**
 * Catálogo de requisitos de execução (Fase E): aptidões, treinamentos e EPIs.
 * Catálogo global (admin). Usado pelas tarefas (o que exigem) e pelas
 * qualificações dos funcionários (o que possuem).
 */
import CrudManager from "@/components/CrudManager";
import type { Requisito } from "@/types";

const TIPOS = [
  { valor: "aptidao", rotulo: "Aptidão (física/médica)" },
  { valor: "treinamento", rotulo: "Treinamento (pode vencer)" },
  { valor: "epi", rotulo: "EPI (equipamento)" },
];

const SELO_TIPO: Record<string, string> = {
  aptidao: "selo-azul",
  treinamento: "selo-amarelo",
  epi: "selo-verde",
};

export default function PaginaRequisitos() {
  return (
    <CrudManager<Requisito>
      titulo="Requisitos de execução"
      subtitulo="Catálogo de aptidões, treinamentos e EPIs. As tarefas exigem requisitos; os funcionários possuem aptidões/treinamentos (com validade). Aptidão e treinamento faltando bloqueiam a alocação."
      endpoint="/api/requisitos"
      textoNovo="+ Novo requisito"
      campos={[
        {
          key: "nome",
          rotulo: "Nome",
          tipo: "texto",
          obrigatorio: true,
          dica: "Ex.: “Manuseio de produtos químicos”, “NR-35 (altura)”, “Luvas nitrílicas”.",
        },
        {
          key: "tipo",
          rotulo: "Tipo",
          tipo: "select",
          opcoes: TIPOS,
          padrao: "treinamento",
          obrigatorio: true,
          dica: "Aptidão = condição física/médica que a pessoa tem. Treinamento = capacitação que pode vencer. EPI = equipamento que a tarefa exige (exibido como lembrete; a confirmação de uso vem com o app/QR).",
        },
        {
          key: "descricao",
          rotulo: "Descrição",
          tipo: "textarea",
          inteira: true,
          dica: "Detalhe opcional do requisito.",
        },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
      ]}
      colunas={[
        { key: "nome", rotulo: "Requisito", render: (r) => <strong>{r.nome}</strong> },
        {
          key: "tipo",
          rotulo: "Tipo",
          render: (r) => (
            <span className={`selo ${SELO_TIPO[r.tipo] ?? "selo-cinza"}`}>
              {TIPOS.find((t) => t.valor === r.tipo)?.rotulo.split(" (")[0] ?? r.tipo}
            </span>
          ),
        },
        {
          key: "descricao",
          rotulo: "Descrição",
          render: (r) => <span style={{ color: "var(--tinta-2)", fontSize: 13 }}>{r.descricao || "—"}</span>,
        },
        {
          key: "ativo",
          rotulo: "Status",
          render: (r) => (
            <span className={`selo ${r.ativo ? "selo-verde" : "selo-cinza"}`}>
              {r.ativo ? "Ativo" : "Inativo"}
            </span>
          ),
        },
      ]}
    />
  );
}
