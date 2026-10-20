/**
 * "+ Nova tarefa" da Rotina (20/10/2026): as regras puras que impedem cadastro
 * duplicado, apontadas pela auditoria.
 */
import { describe, expect, it } from "vitest";
import { buscaCasaAlgumaTarefa, locaisDoFormulario } from "@/lib/agenda";
import type { Local, Tarefa } from "@/types";

const local = (id: string, sede_id: string, nome_local: string, ativo = true) =>
  ({ id, sede_id, nome_local, andar: "Térreo", tipo_local: "sala", metragem: 0, ativo, observacoes: "" }) as Local;

describe("locais oferecidos no formulário", () => {
  it("só os ativos da sede da agenda — a lista de outra sede ainda em cache não entra", () => {
    const r = locaisDoFormulario([local("a", "dt", "Sala"), local("b", "ald", "Recepção"), local("c", "dt", "Antigo", false)], "dt");
    expect(r.map((l) => l.id)).toEqual(["a"]);
  });

  it("o local que acabou de nascer no formulário aparece, mesmo antes de a lista do pai atualizar", () => {
    const criado = local("novo", "dt", "Quadra coberta");
    const r = locaisDoFormulario([local("a", "dt", "Sala")], "dt", criado);
    expect(r.map((l) => l.id)).toEqual(["novo", "a"]); // em ordem alfabética
    // quando a lista do pai já o trouxer, não duplica
    expect(locaisDoFormulario([local("a", "dt", "Sala"), criado], "dt", criado).map((l) => l.id)).toEqual(["novo", "a"]);
  });
});

describe("o '+ Criar' da busca", () => {
  const locais = new Map([["l1", local("l1", "dt", "Financeiro")]]);
  const tarefa = (nome_tarefa: string, ativo = true) => ({ id: nome_tarefa, nome_tarefa, local_id: "l1", ativo }) as Tarefa;

  it("não aparece se a busca casa com alguma tarefa — mesmo inativa ou escondida por filtro", () => {
    expect(buscaCasaAlgumaTarefa([tarefa("Banheiro")], locais, "banh")).toBe(true);
    expect(buscaCasaAlgumaTarefa([tarefa("Banheiro", false)], locais, "banheiro")).toBe(true);
    expect(buscaCasaAlgumaTarefa([tarefa("Varrer")], locais, "financ")).toBe(true); // pelo nome do local
  });

  it("aparece quando nada casa, e não aparece com a busca vazia", () => {
    expect(buscaCasaAlgumaTarefa([tarefa("Banheiro")], locais, "plantão do esporte")).toBe(false);
    expect(buscaCasaAlgumaTarefa([tarefa("Banheiro")], locais, "  ")).toBe(true);
  });
});
