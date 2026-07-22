"use client";

import Link from "next/link";
import CrudManager from "@/components/CrudManager";
import type { Sede } from "@/types";

const TIPOS_SEDE = [
  { valor: "educacao_infantil", rotulo: "Educação infantil" },
  { valor: "escola", rotulo: "Escola" },
  { valor: "faculdade", rotulo: "Faculdade" },
  { valor: "administrativo", rotulo: "Administrativo" },
  { valor: "outros", rotulo: "Outros" },
];

export default function PaginaSedes() {
  return (
    <CrudManager<Sede>
      titulo="Sedes"
      subtitulo="Unidades atendidas. Todo local, tarefa e funcionário pertence a uma sede."
      endpoint="/api/sedes"
      textoNovo="+ Nova sede"
      vazio="Comece cadastrando a primeira sede — locais, tarefas e equipe pendem dela."
      rotuloRegistro={(s) => s.nome_sede}
      acoesExtra={(s) => (
        <Link className="btn btn-mini btn-fantasma" href={`/locais?busca=${encodeURIComponent(s.nome_sede)}`}>
          Ver locais →
        </Link>
      )}
      campos={[
        {
          key: "nome_sede",
          rotulo: "Nome da sede",
          tipo: "texto",
          obrigatorio: true,
          secao: "Identificação da unidade",
          descricaoSecao: "Como a sede será reconhecida no sistema e no dia a dia.",
        },
        {
          key: "codigo",
          rotulo: "Sigla",
          tipo: "texto",
          ajuda: "Como a operação chama a unidade (ex.: DT, SUL 1, PQL 3)",
          dica: "A sigla usada no dia a dia e nas planilhas. Aparece ao lado do nome nas listagens e relatórios.",
        },
        {
          key: "cidade",
          rotulo: "Cidade",
          tipo: "texto",
          secao: "Localização",
          descricaoSecao: "Referência física para relatórios e remanejamentos.",
        },
        { key: "endereco", rotulo: "Endereço", tipo: "texto", inteira: true },
        {
          key: "tipo_sede",
          rotulo: "Tipo de sede",
          tipo: "select",
          opcoes: TIPOS_SEDE,
          ajuda: "Perfil da unidade — compara ociosidade entre sedes parecidas",
          dica: "O perfil da unidade (educação infantil, escola, faculdade, administrativo). Serve para comparar a ociosidade entre sedes do mesmo tipo e sugerir uma folga-alvo adequada. A folga-alvo em si continua no parâmetro \"folga mínima\" de cada sede.",
          secao: "Organização gerencial",
          descricaoSecao: "Classificação usada nas comparações entre unidades.",
        },
        {
          key: "grupo",
          rotulo: "Grupo",
          tipo: "texto",
          ajuda: "Ex.: Sul, Centro — para visões agregadas de gerência",
          dica: "Agrupa sedes que formam um conjunto (ex.: \"Sul\" reunindo Sul 1, 2 e 3). Usado em visões de gerência que somam várias unidades. Texto livre, opcional.",
        },
        {
          key: "ativo",
          rotulo: "Ativa",
          tipo: "checkbox",
          padrao: true,
          secao: "Disponibilidade",
          descricaoSecao: "Sedes inativas permanecem no histórico, mas saem dos novos fluxos.",
        },
      ]}
      colunas={[
        {
          key: "nome_sede",
          rotulo: "Sede",
          render: (s) => (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {s.codigo && <span className="selo selo-cinza num">{s.codigo}</span>}
              <strong>{s.nome_sede}</strong>
            </span>
          ),
        },
        { key: "cidade", rotulo: "Cidade" },
        {
          key: "tipo_sede",
          rotulo: "Tipo / Grupo",
          render: (s) => (
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {s.tipo_sede && (
                <span className="selo selo-azul">
                  {TIPOS_SEDE.find((t) => t.valor === s.tipo_sede)?.rotulo ?? s.tipo_sede}
                </span>
              )}
              {s.grupo && <span className="selo selo-cinza">{s.grupo}</span>}
              {!s.tipo_sede && !s.grupo && (
                <span style={{ color: "var(--tinta-3)", fontSize: 12 }}>—</span>
              )}
            </span>
          ),
        },
        {
          key: "ativo",
          rotulo: "Status",
          render: (s) => (
            <span className={`selo ${s.ativo ? "selo-verde" : "selo-cinza"}`}>
              {s.ativo ? "Ativa" : "Inativa"}
            </span>
          ),
        },
      ]}
    />
  );
}
