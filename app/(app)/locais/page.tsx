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
          dica: "A qual sede este local pertence. A mesma \"Recepção\" em sedes diferentes são locais distintos (podem ter metragens e tempos diferentes) — por isso todo local tem uma sede.",
        },
        {
          key: "nome_local",
          rotulo: "Nome do local",
          tipo: "texto",
          obrigatorio: true,
          dica: "Como o ambiente é chamado no dia a dia. Ex.: \"Recepção\", \"Banheiro feminino\", \"Corredor\", \"Copa\".",
        },
        {
          key: "andar",
          rotulo: "Andar",
          tipo: "texto",
          padrao: "Térreo",
          dica: "Em que andar/piso fica o local (ex.: Térreo, 1º andar, Externo). Serve para organizar e filtrar a lista de tarefas na hora de montar a rotina.",
        },
        {
          key: "tipo_local",
          rotulo: "Tipo de local",
          tipo: "select",
          obrigatorio: true,
          opcoes: TIPOS_LOCAL,
          dica: "A categoria do ambiente (sala, banheiro, corredor, área externa…). Usado para filtrar e para análises por tipo de espaço nos relatórios.",
        },
        {
          key: "metragem",
          rotulo: "Metragem (m²)",
          tipo: "numero",
          passo: "0.1",
          ajuda: "Base do cálculo de tempo por m²",
          dica: "A área do local em metros quadrados. É o que o sistema multiplica nas tarefas com regra POR M² (ex.: 1 min/m² numa sala de 80 m² = 80 min). Local sem metragem gera alerta nas tarefas por m².",
        },
        {
          key: "fator_intensidade",
          rotulo: "Intensidade (fator)",
          tipo: "numero",
          passo: "0.1",
          padrao: 1,
          ajuda: "Leve 0,8 · Normal 1,0 · Densa 1,5",
          dica: "O quanto este ambiente \"suja\" e pesa na limpeza — multiplica o tempo previsto de TODAS as tarefas do local. Banheiros e copas são densos (1,5); salas comuns são normais (1,0); áreas abertas/externas são leves (0,8). Use 1 (ou deixe em branco) quando não quiser efeito. Antes esse fator ficava na Categoria; agora é por ambiente.",
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
          key: "fator_intensidade",
          rotulo: "Intensidade",
          render: (l) => {
            const f = l.fator_intensidade;
            if (!f || f === 1)
              return <span className="num" style={{ color: "var(--tinta-3)" }}>normal</span>;
            return (
              <span className={`selo ${f > 1 ? "selo-laranja" : "selo-azul"} num`}>
                {f > 1 ? "densa" : "leve"} ×{f.toLocaleString("pt-BR")}
              </span>
            );
          },
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
