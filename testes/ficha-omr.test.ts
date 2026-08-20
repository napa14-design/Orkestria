/**
 * Ficha impressa e leitura OMR — a trilha que produz o registro assinado.
 *
 * Não tinha teste nenhum até 20/08, e é o caminho de maior consequência do
 * sistema: o que sai daqui é papel com assinatura de funcionário e supervisor.
 *
 * A geometria já quebrou uma vez em produção — com ~22 tarefas a lista descia e
 * colidia com o título dos EPIs, porque o topo do bloco era fixo em 350. O
 * conserto foi tornar o topo dinâmico; estes testes checam a invariante para
 * TODO `n`, não para o `n` que alguém lembrou de olhar.
 */
import { describe, expect, it } from "vitest";
import {
  CAIXA_LADO,
  CAPACIDADE_TAREFAS,
  CARD,
  cabeNaFicha,
  EPI,
  EPI_CAPACIDADE,
  codigoLinha,
  declaracaoPos,
  deltaTarefas,
  epiPos,
  epiTopo,
  tarefaY,
} from "@/lib/fichaGeometria";
import { parseQR } from "@/lib/omr";

/** Toda a faixa que a ficha aceita imprimir. */
const TODOS_N = Array.from({ length: CAPACIDADE_TAREFAS }, (_, i) => i + 1);

describe("geometria da ficha", () => {
  it("as linhas de tarefa descem, nunca sobem nem repetem", () => {
    for (const n of TODOS_N) {
      for (let i = 1; i < n; i++) {
        expect(tarefaY(i + 1, n)).toBeLessThan(tarefaY(i, n));
      }
    }
  });

  it("caixas vizinhas ficam longe o bastante para a tinta não contaminar", () => {
    // O leitor amostra ±3,3pt do centro (0,55 × 12pt / 2). Duas amostras
    // vizinhas precisam de folga: se encostarem, a marca de uma linha conta
    // como marca da outra.
    const raioAmostra = (CAIXA_LADO * 0.55) / 2;
    for (const n of TODOS_N) {
      const folga = deltaTarefas(n) - 2 * raioAmostra;
      expect(folga, `n=${n}`).toBeGreaterThan(0);
    }
  });

  it("a última tarefa NUNCA invade a primeira caixa de EPI — o bug de ~22 tarefas", () => {
    const raioAmostra = (CAIXA_LADO * 0.55) / 2;
    for (const n of TODOS_N) {
      const ultimaTarefa = tarefaY(n, n);
      const primeiroEpi = epiPos(0, n).y;
      expect(primeiroEpi, `n=${n}`).toBeLessThan(ultimaTarefa - 2 * raioAmostra);
    }
  });

  it("a capacidade é o MÁXIMO de verdade: uma tarefa a mais já colide", () => {
    // Prova que `CAPACIDADE_TAREFAS` não é número escolhido a dedo, e que o
    // limite existe por causa da geometria — não por conservadorismo.
    const raioAmostra = (CAIXA_LADO * 0.55) / 2;
    const n = CAPACIDADE_TAREFAS + 1;
    expect(epiPos(0, n).y).toBeGreaterThanOrEqual(tarefaY(n, n) - 2 * raioAmostra);
    expect(cabeNaFicha(CAPACIDADE_TAREFAS)).toBe(true);
    expect(cabeNaFicha(n)).toBe(false);
  });

  it("acima da capacidade as caixas chegam a sair da página", () => {
    // A CESIU tem pessoas com 43 e 54 blocos no dia. Com 54, a última caixa cai
    // em y negativo: não é impressa, e o leitor amostraria fora do cartão.
    expect(tarefaY(54, 54)).toBeLessThan(CARD.yBot);
  });

  it("as duas colunas de EPI não se sobrepõem", () => {
    for (const n of [1, 10, 25]) {
      const col1 = epiPos(0, n);
      const col2 = epiPos(EPI.porColuna, n);
      expect(col2.x - col1.x).toBeGreaterThan(CAIXA_LADO);
      expect(col2.y).toBe(col1.y); // primeira linha de cada coluna, mesma altura
    }
  });

  it("o bloco de EPI respeita o piso — abaixo dele invade as Observações", () => {
    for (const n of TODOS_N) {
      expect(epiTopo(n), `n=${n}`).toBeGreaterThanOrEqual(EPI.pisoTopo);
      expect(epiTopo(n), `n=${n}`).toBeLessThanOrEqual(EPI.tetoTopo);
    }
  });

  it("a declaração do ORK3 fica exatamente onde ficava a 1ª caixa do ORK2", () => {
    // É o que permite a ficha nova conviver com a âncora antiga sem recalibrar.
    for (const n of [1, 12, 27]) {
      expect(declaracaoPos(n)).toEqual(epiPos(0, n));
    }
  });

  it("a capacidade declarada bate com o layout", () => {
    expect(EPI_CAPACIDADE).toBe(EPI.porColuna * EPI.colX.length);
  });
});

describe("codigoLinha", () => {
  it("é estável: mesma entrada, mesmo código", () => {
    const a = codigoLinha("f1", "t1", "07:00");
    expect(codigoLinha("f1", "t1", "07:00")).toBe(a);
    expect(a).toHaveLength(6);
  });

  it("muda quando qualquer parte da identidade muda", () => {
    const base = codigoLinha("f1", "t1", "07:00");
    expect(codigoLinha("f2", "t1", "07:00")).not.toBe(base);
    expect(codigoLinha("f1", "t2", "07:00")).not.toBe(base);
    expect(codigoLinha("f1", "t1", "07:30")).not.toBe(base);
  });

  it("não colide dentro de uma ficha do tamanho da maior sede", () => {
    // Dionísio Torres tem 277 blocos no dia. Uma colisão aqui faria a marca de
    // uma tarefa ser gravada em OUTRA — errado em silêncio, no papel assinado.
    const codigos = new Set<string>();
    let n = 0;
    for (let f = 0; f < 30; f++) {
      for (let t = 0; t < 20; t++) {
        for (const h of ["06:00", "07:30", "09:00", "13:00", "15:30"]) {
          codigos.add(codigoLinha(`func-${f}`, `tarefa-${t}`, h));
          n++;
        }
      }
    }
    expect(codigos.size, `${n - codigos.size} colisão(ões) em ${n} linhas`).toBe(n);
  });
});

describe("parseQR", () => {
  it("lê ORK3 (declaração única) com os códigos", () => {
    const q = parseQR("ORK3|christus_dt|2026-08-19|f1|3|aaa111,bbb222,ccc333");
    expect(q?.versao).toBe(3);
    expect(q?.sede).toBe("christus_dt");
    expect(q?.data).toBe("2026-08-19");
    expect(q?.n).toBe(3);
    expect(q?.codigos).toEqual(["aaa111", "bbb222", "ccc333"]);
  });

  it("lê ORK2 (uma caixa por EPI) — ficha já impressa continua legível", () => {
    const q = parseQR("ORK2|s|2026-08-19|f1|2|aaa111,bbb222");
    expect(q?.versao).toBe(2);
    expect(q?.codigos).toHaveLength(2);
  });

  it("lê ORK1 (casa por posição), sem códigos", () => {
    const q = parseQR("ORK1|s|2026-08-19|f1");
    expect(q?.versao).toBe(1);
    expect(q?.codigos).toBeUndefined();
  });

  it("devolve null para lixo em vez de adivinhar", () => {
    // Adivinhar aqui gravaria execução na pessoa ou no dia errado.
    expect(parseQR(null)).toBeNull();
    expect(parseQR("")).toBeNull();
    expect(parseQR("qualquer texto")).toBeNull();
    expect(parseQR("ORK9|s|d|f|1|x")).toBeNull();
    expect(parseQR("ORK3|falta|campos")).toBeNull();
    expect(parseQR("ORK1|so|dois")).toBeNull();
  });

  it("ORK3 sem lista de códigos não quebra", () => {
    const q = parseQR("ORK3|s|2026-08-19|f1|0|");
    expect(q?.codigos).toEqual([]);
    expect(q?.n).toBe(0);
  });
});
