"use client";

import CrudManager from "@/components/CrudManager";
import type { TipoLocalCatalogo } from "@/types";

/**
 * Catálogo de tipos de ambiente. Era lista fixa no código até 24/08/2026 —
 * virou cadastro porque as 18 sedes vão de educação infantil a clínica e
 * nenhuma lista nossa cobre todas (faltava "consultório" para 41 locais,
 * enquanto 5 dos 11 tipos oferecidos nunca tinham sido usados).
 */
const FAIXA = [
  { valor: "0.8", rotulo: "Leve (0,8) — área aberta, suja pouco" },
  { valor: "1", rotulo: "Normal (1,0) — a maior parte dos ambientes" },
  { valor: "1.3", rotulo: "Puxado (1,3)" },
  { valor: "1.5", rotulo: "Denso (1,5) — banheiro, copa" },
];

export default function PaginaTiposLocal() {
  return (
    <CrudManager<TipoLocalCatalogo>
      titulo="Tipos de local"
      subtitulo="A lista que aparece no cadastro de Locais. Crie os tipos que a sua operação usa — o fator diz o quanto o ambiente suja em relação ao normal."
      endpoint="/api/tipos-local"
      textoNovo="+ Novo tipo"
      campos={[
        {
          key: "nome",
          rotulo: "Nome",
          tipo: "texto",
          obrigatorio: true,
          ajuda: "Como aparece na lista do cadastro de Locais",
          dica: "O nome do tipo de ambiente, como a sua operação chama. Ex.: Consultório, Laboratório, Vestiário, Quadra. É o que o supervisor vai escolher ao cadastrar um local.",
        },
        {
          key: "fator_intensidade",
          rotulo: "Intensidade de limpeza",
          tipo: "select",
          padrao: "1",
          numerico: true,
          opcoes: FAIXA,
          ajuda: (form) => {
            const f = Number(form.fator_intensidade ?? 1) || 1;
            if (f === 1) return "Tempo igual ao previsto pela metragem — sem acréscimo nem desconto.";
            const pct = Math.round(Math.abs(f - 1) * 100);
            return f > 1
              ? `Uma tarefa de 20 min por m² neste tipo passa a ${Math.round(20 * f)} min (+${pct}%).`
              : `Uma tarefa de 20 min por m² neste tipo passa a ${Math.round(20 * f)} min (−${pct}%).`;
          },
          dica: "O quanto este ambiente suja em relação ao normal. Só afeta tarefas calculadas POR M² ou POR UNIDADE — tarefa de tempo fixo já traz o tempo pronto e não é multiplicada. O valor digitado no próprio local, quando existe, sempre vence este.",
        },
        {
          key: "descricao",
          rotulo: "Descrição",
          tipo: "textarea",
          inteira: true,
          dica: "Texto livre que ajuda quem cadastra a escolher o tipo certo. Aparece só nesta tela.",
        },
        {
          key: "ativo",
          rotulo: "Ativo",
          tipo: "checkbox",
          padrao: true,
          dica: "Inativo some da lista de escolha no cadastro de Locais, mas os locais que já usam continuam funcionando. É o caminho para aposentar um tipo sem quebrar o que existe.",
        },
      ]}
      colunas={[
        { key: "nome", rotulo: "Nome" },
        {
          key: "fator_intensidade",
          rotulo: "Intensidade",
          render: (t) => {
            const f = Number(t.fator_intensidade) > 0 ? Number(t.fator_intensidade) : 1;
            const rotulo = FAIXA.find((o) => Number(o.valor) === f)?.rotulo.split(" —")[0];
            return (
              <span className={`selo ${f > 1 ? "selo-amarelo" : f < 1 ? "selo-verde" : "selo-cinza"}`}>
                {rotulo ?? `×${f.toString().replace(".", ",")}`}
              </span>
            );
          },
        },
        { key: "descricao", rotulo: "Descrição" },
        {
          key: "ativo",
          rotulo: "Status",
          render: (t) => (
            <span className={`selo ${t.ativo ? "selo-verde" : "selo-cinza"}`}>
              {t.ativo ? "Ativo" : "Inativo"}
            </span>
          ),
        },
      ]}
    />
  );
}
