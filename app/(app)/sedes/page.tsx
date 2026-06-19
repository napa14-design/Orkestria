"use client";

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
      campos={[
        { key: "nome_sede", rotulo: "Nome da sede", tipo: "texto", obrigatorio: true },
        { key: "cidade", rotulo: "Cidade", tipo: "texto" },
        { key: "endereco", rotulo: "Endereço", tipo: "texto", inteira: true },
        {
          key: "tipo_sede",
          rotulo: "Tipo de sede",
          tipo: "select",
          opcoes: TIPOS_SEDE,
          ajuda: "Perfil da unidade — compara ociosidade entre sedes parecidas",
          dica: "O perfil da unidade (educação infantil, escola, faculdade, administrativo). Serve para comparar a ociosidade entre sedes do mesmo tipo e sugerir uma folga-alvo adequada. A folga-alvo em si continua no parâmetro \"folga mínima\" de cada sede.",
        },
        {
          key: "grupo",
          rotulo: "Grupo",
          tipo: "texto",
          ajuda: "Ex.: Sul, Centro — para visões agregadas de gerência",
          dica: "Agrupa sedes que formam um conjunto (ex.: \"Sul\" reunindo Sul 1, 2 e 3). Usado em visões de gerência que somam várias unidades. Texto livre, opcional.",
        },
        { key: "ativo", rotulo: "Ativa", tipo: "checkbox", padrao: true },
      ]}
      colunas={[
        { key: "nome_sede", rotulo: "Sede" },
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
