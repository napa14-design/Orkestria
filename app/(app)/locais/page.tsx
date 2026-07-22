"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import KitTarefasLocal from "@/components/KitTarefasLocal";
import { useSessao } from "@/components/SessaoContext";
import { fatorIntensidadeLocal } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import type { Local, Sede, Tarefa } from "@/types";

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
  const sessao = useSessao();
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: tarefas, mutate: mutateTarefas } = useSWR<Tarefa[]>("/api/tarefas", fetcher);
  const [localDoKit, setLocalDoKit] = useState<Local | null>(null);
  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;

  return (
    <>
    <CrudManager<Local>
      titulo="Locais"
      subtitulo="Cada local pertence obrigatoriamente a uma sede — a mesma 'Recepção' em sedes diferentes são registros distintos."
      endpoint="/api/locais"
      chaveRascunho="locais"
      textoNovo="+ Novo local"
      vazio="Cadastre os ambientes de cada sede (salas, banheiros, corredores…) — é onde as tarefas acontecem."
      permitirDuplicar
      rotuloRegistro={(l) => `${l.nome_local} — ${nomeSede(l.sede_id)}`}
      textoBusca={(l) => `${nomeSede(l.sede_id)} ${TIPOS_LOCAL.find((tipo) => tipo.valor === l.tipo_local)?.rotulo ?? ""}`}
      filtrosRapidos={[
        { valor: "sem_metragem", rotulo: "Sem metragem", testar: (l) => !l.metragem || l.metragem <= 0 },
        { valor: "intensos", rotulo: "Alta intensidade", testar: (l) => fatorIntensidadeLocal(l) > 1 },
        { valor: "areas_externas", rotulo: "Áreas externas", testar: (l) => l.tipo_local === "area_externa" },
      ]}
      acoesExtra={(l) => (
        <>
          {sessao.perfil !== "visualizador" && l.ativo && (
            <button type="button" className="btn btn-mini btn-fantasma" onClick={() => setLocalDoKit(l)}>
              Preparar kit
            </button>
          )}{" "}
          <Link className="btn btn-mini btn-fantasma" href={`/tarefas?busca=${encodeURIComponent(l.nome_local)}`}>
            Ver tarefas →
          </Link>
        </>
      )}
      campos={[
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          automaticoSeUnico: true,
          opcoes: (sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ajuda: "Obrigatória — não existe local sem sede",
          dica: "A qual sede este local pertence. A mesma \"Recepção\" em sedes diferentes são locais distintos (podem ter metragens e tempos diferentes) — por isso todo local tem uma sede.",
          secao: "Vínculo com a estrutura",
          descricaoSecao: "Todo ambiente pertence a uma sede; essa escolha será herdada pelas tarefas.",
        },
        {
          key: "nome_local",
          rotulo: "Nome do local",
          tipo: "texto",
          obrigatorio: true,
          dica: "Como o ambiente é chamado no dia a dia. Ex.: \"Recepção\", \"Banheiro feminino\", \"Corredor\", \"Copa\".",
          secao: "Identificação do ambiente",
          descricaoSecao: "Use o nome que a equipe reconhece rapidamente na operação.",
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
          secao: "Dimensionamento e esforço",
          descricaoSecao: "Tipo, metragem e intensidade determinam o tempo previsto das tarefas.",
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
          // "" (e não 0) para o campo nascer VAZIO — vazio = herda do tipo.
          padrao: "",
          avancado: true,
          ajuda: "Em branco = o tipo do local decide",
          dica: "O quanto este ambiente \"suja\" e pesa na limpeza — multiplica o tempo previsto de TODAS as tarefas do local. DEIXE EM BRANCO para o sistema usar o padrão do tipo de local (banheiro e copa 1,5 · área externa 0,8 · demais 1,0). Preencha só quando este ambiente fugir do padrão do tipo dele — o valor digitado sempre vence.",
        },
        {
          key: "ativo",
          rotulo: "Ativo",
          tipo: "checkbox",
          padrao: true,
          avancado: true,
          secao: "Uso no planejamento",
          descricaoSecao: "Ambientes inativos permanecem no histórico e deixam de receber novas tarefas.",
        },
        { key: "observacoes", rotulo: "Observações", tipo: "textarea", inteira: true, avancado: true },
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
          // Mostra o fator EFETIVO (o digitado ou, em branco, o padrão do tipo).
          render: (l) => {
            const f = fatorIntensidadeLocal(l);
            const doTipo = !l.fator_intensidade || l.fator_intensidade <= 0;
            if (f === 1)
              return <span className="num" style={{ color: "var(--tinta-3)" }}>normal</span>;
            return (
              <span
                className={`selo ${f > 1 ? "selo-laranja" : "selo-azul"} num`}
                title={doTipo ? "Padrão do tipo de local (nada digitado no cadastro)" : "Fator digitado no cadastro"}
              >
                {f > 1 ? "densa" : "leve"} ×{f.toLocaleString("pt-BR")}
                {doTipo ? " *" : ""}
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
    <KitTarefasLocal
      local={localDoKit}
      tarefas={tarefas ?? []}
      aoFechar={() => setLocalDoKit(null)}
      aoConcluir={async () => {
        await mutateTarefas();
      }}
    />
    </>
  );
}
