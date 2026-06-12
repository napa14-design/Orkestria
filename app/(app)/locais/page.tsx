"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import type { Local, Sede } from "@/types";

const TIPOS_LOCAL = [
  { valor: "sala", rotulo: "Sala" },
  { valor: "banheiro", rotulo: "Banheiro" },
  { valor: "corredor", rotulo: "Corredor" },
  { valor: "area_comum", rotulo: "Área comum" },
  { valor: "area_externa", rotulo: "Área externa" },
  { valor: "copa", rotulo: "Copa" },
  { valor: "escada", rotulo: "Escada" },
  { valor: "recepcao", rotulo: "Recepção" },
  { valor: "auditorio", rotulo: "Auditório" },
  { valor: "almoxarifado", rotulo: "Almoxarifado" },
  { valor: "outros", rotulo: "Outros" },
];

export default function PaginaLocais() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;

  return (
    <CrudManager<Local>
      titulo="Locais"
      subtitulo="Cada local pertence obrigatoriamente a uma sede — a mesma 'Recepção' em sedes diferentes são registros distintos."
      endpoint="/api/locais"
      textoNovo="+ Novo local"
      campos={[
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          opcoes: (sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ajuda: "Obrigatória — não existe local sem sede",
        },
        { key: "nome_local", rotulo: "Nome do local", tipo: "texto", obrigatorio: true },
        { key: "andar", rotulo: "Andar", tipo: "texto", padrao: "Térreo" },
        { key: "tipo_local", rotulo: "Tipo de local", tipo: "select", obrigatorio: true, opcoes: TIPOS_LOCAL },
        {
          key: "metragem",
          rotulo: "Metragem (m²)",
          tipo: "numero",
          passo: "0.1",
          ajuda: "Base do cálculo de tempo por m²",
        },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
        { key: "observacoes", rotulo: "Observações", tipo: "textarea", inteira: true },
      ]}
      colunas={[
        {
          key: "nome_local",
          rotulo: "Local",
          render: (l) => (
            <span>
              <strong>{l.nome_local}</strong>{" "}
              <span style={{ color: "var(--tinta-3)" }}>— {nomeSede(l.sede_id)}</span>
            </span>
          ),
        },
        { key: "andar", rotulo: "Andar" },
        {
          key: "tipo_local",
          rotulo: "Tipo",
          render: (l) => TIPOS_LOCAL.find((t) => t.valor === l.tipo_local)?.rotulo ?? l.tipo_local,
        },
        {
          key: "metragem",
          rotulo: "Metragem",
          render: (l) =>
            l.metragem > 0 ? (
              <span className="num">{l.metragem} m²</span>
            ) : (
              <span className="selo selo-amarelo">sem metragem</span>
            ),
        },
        {
          key: "ativo",
          rotulo: "Status",
          render: (l) => (
            <span className={`selo ${l.ativo ? "selo-verde" : "selo-cinza"}`}>
              {l.ativo ? "Ativo" : "Inativo"}
            </span>
          ),
        },
      ]}
    />
  );
}
