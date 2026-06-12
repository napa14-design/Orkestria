"use client";

import CrudManager from "@/components/CrudManager";
import type { Sede } from "@/types";

export default function PaginaSedes() {
  return (
    <CrudManager<Sede>
      titulo="Sedes"
      subtitulo="Unidades atendidas. Todo local, tarefa e funcionário pertence a uma sede."
      endpoint="/api/sedes"
      textoNovo="+ Nova sede"
      campos={[
        { key: "nome_sede", rotulo: "Nome da sede", tipo: "texto", obrigatorio: true },
        { key: "cidade", rotulo: "Cidade", tipo: "texto" },
        { key: "endereco", rotulo: "Endereço", tipo: "texto", inteira: true },
        { key: "ativo", rotulo: "Ativa", tipo: "checkbox", padrao: true },
      ]}
      colunas={[
        { key: "nome_sede", rotulo: "Sede" },
        { key: "cidade", rotulo: "Cidade" },
        { key: "endereco", rotulo: "Endereço" },
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
