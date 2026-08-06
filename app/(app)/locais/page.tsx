"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fatorIntensidadeLocal, FATOR_POR_TIPO_LOCAL } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import type { Local, Sede, TipoLocal } from "@/types";

/**
 * Escala nomeada da intensidade.
 *
 * Os valores são **os que o sistema já usava** — 0,8 para área externa e 1,5
 * para banheiro/copa. Uma escala simétrica (0,5 … 1,5) seria mais bonita, mas
 * mudaria o tempo calculado de todo local já cadastrado. Escala torta que não
 * remexe nos dados é melhor que escala bonita que remexe.
 */
const ESCALA_INTENSIDADE = [
  { valor: "0.8", rotulo: "Leve — suja pouco (×0,8)" },
  { valor: "0.9", rotulo: "Entre leve e médio (×0,9)" },
  { valor: "1", rotulo: "Médio — o comum (×1,0)" },
  { valor: "1.25", rotulo: "Entre médio e pesado (×1,25)" },
  { valor: "1.5", rotulo: "Pesado — suja muito (×1,5)" },
];

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
      vazio="Cadastre os ambientes de cada sede (salas, banheiros, corredores…) — é onde as tarefas acontecem."
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
          rotulo: "Quanto este ambiente pesa na limpeza",
          // Escala nomeada em vez de multiplicador digitado: o supervisor pensa
          // "esse banheiro suja mais", não "1,5". Os números da escala são os
          // que o sistema JÁ usava (0,8 externa · 1,5 banheiro/copa), então
          // nenhum tempo já calculado muda por causa da troca de controle.
          tipo: "select",
          numerico: true,
          // "" (e não 0) para o campo nascer VAZIO — vazio = herda do tipo.
          padrao: "",
          opcoes: (form) => {
            const atual = String(form.fator_intensidade ?? "");
            const naEscala = ESCALA_INTENSIDADE.some((o) => o.valor === atual);
            return [
              { valor: "", rotulo: "Herdar do tipo do local (recomendado)" },
              ...ESCALA_INTENSIDADE,
              // Local cadastrado antes desta escala pode ter valor fora dela.
              // Some da lista = trocaria o valor sem a pessoa pedir.
              ...(atual && atual !== "0" && !naEscala
                ? [{ valor: atual, rotulo: `Manter o valor atual (×${atual.replace(".", ",")})` }]
                : []),
            ];
          },
          ajuda: (form) => {
            const atual = String(form.fator_intensidade ?? "");
            if (!atual || atual === "0") {
              const tipo = String(form.tipo_local ?? "");
              const herdado = FATOR_POR_TIPO_LOCAL[tipo as TipoLocal];
              return herdado
                ? `O tipo escolhido usa ×${String(herdado).replace(".", ",")}`
                : "O tipo do local decide";
            }
            return "Multiplica o tempo de todas as tarefas deste local";
          },
          dica: "O quanto este ambiente suja e pesa na limpeza. Multiplica o tempo previsto de TODAS as tarefas do local: \"pesado\" faz cada tarefa levar 50% mais tempo que a mesma tarefa num ambiente médio. Deixe em \"Herdar do tipo do local\" na dúvida — banheiro e copa já entram como pesado, área externa como leve, o resto como médio. Escolha na mão só quando este ambiente fugir do padrão do tipo dele.",
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
  );
}
