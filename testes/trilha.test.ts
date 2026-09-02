/**
 * Invariantes da trilha do tutorial.
 *
 * Nasceram de um defeito medido na tela em 31/08/2026: os passos "clique em
 * Salvar" avançavam **no clique**. Com o formulário vazio — e a trilha nunca
 * pedia para preencher — o navegador barrava o envio, nada era gravado, e o
 * tutorial seguia assim mesmo até o fim, gravando a etapa como concluída. O
 * resultado na tela era "Selecione um item da lista." no formulário aberto,
 * zero locais cadastrados e "Cadastrar os locais ✓" na trilha.
 *
 * Nenhum destes testes olha aparência. Todos olham a regra: **um passo que
 * manda gravar só pode avançar quando a gravação acontecer.**
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTO_DIA_GERADO, TRILHA, type PassoTutorial } from "@/lib/tutorial/trilha";

/** Todos os .ts/.tsx de `app/` e `components/` — onde os alvos são declarados. */
function arquivosDeCodigo(raizes = ["app", "components"]): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.tsx?$/u.test(nome)) achados.push(caminho);
    }
  };
  for (const r of raizes) andar(r);
  return achados;
}

const todosOsPassos: Array<{ etapa: string; indice: number; passo: PassoTutorial }> = TRILHA.flatMap(
  (e) => e.passos.map((passo, indice) => ({ etapa: e.id, indice, passo })),
);

describe("trilha do tutorial", () => {
  /**
   * Decisão do dono do produto, 02/09/2026: *"não precisa preencher nada, é
   * mostrar aonde clicar para ir para cada tela, abre o modal, explica o modal,
   * e fecha o modal"*. O tutorial é passeio guiado, não cadastro assistido —
   * exigir dado real trava quem está conhecendo o sistema e ainda não tem a
   * lista da sede na mão.
   */
  it("o passeio nunca manda salvar", () => {
    const salvares = todosOsPassos.filter(({ passo }) => passo.alvo === "crud-salvar");
    expect(
      salvares.map((s) => `${s.etapa}: ${s.passo.titulo}`),
      "o tutorial voltou a pedir cadastro real no meio do passeio",
    ).toEqual([]);
  });

  it("todo modal que o passeio abre, ele fecha", () => {
    // Sem isto a pessoa fica com o formulário aberto e o tutorial encerrado,
    // sem saber se devia salvar. Abrir e não fechar é meio caminho.
    for (const etapa of TRILHA) {
      const abre = etapa.passos.some((p) => p.alvo === "crud-novo");
      if (!abre) continue;
      const fecha = etapa.passos.some((p) => p.alvo === "crud-cancelar");
      expect(fecha, `etapa "${etapa.id}" abre o formulário e nunca manda fechar`).toBe(true);
      const iAbre = etapa.passos.findIndex((p) => p.alvo === "crud-novo");
      const iFecha = etapa.passos.findIndex((p) => p.alvo === "crud-cancelar");
      expect(iFecha, `etapa "${etapa.id}" manda fechar antes de abrir`).toBeGreaterThan(iAbre);
    }
  });

  it("passo de clique e de sucesso precisam de alvo — sem alvo não há o que esperar", () => {
    for (const { etapa, passo } of todosOsPassos) {
      if (passo.avancarEm === "clique" || passo.avancarEm === "sucesso") {
        expect(passo.alvo, `etapa "${etapa}": "${passo.titulo}" espera ação e não tem alvo`).toBeTruthy();
      }
    }
  });

  it("nenhuma etapa termina num passo que a pessoa não consegue disparar", () => {
    // O último passo é o que conclui a etapa. Se ele for de leitura, basta ler;
    // se for de ação, tem que existir a ação. O que não pode é a etapa terminar
    // sem caminho — foi assim que "concluída" virou sinônimo de "cliquei".
    for (const etapa of TRILHA) {
      const ultimo = etapa.passos[etapa.passos.length - 1];
      expect(ultimo, `etapa "${etapa.id}" está sem passos`).toBeTruthy();
      expect(["leitura", "clique", "sucesso", undefined]).toContain(ultimo.avancarEm);
    }
  });

  /**
   * Em 02/09/2026 um supervisor reclamou ao diretor que **não dava para gerar o
   * dia em um clique**. Dava, desde sempre — o botão `gerar-dia` existia e a
   * trilha nunca apontava para ele. Ensinava a SALVAR a rota e não mostrava o
   * botão que a USA. Estes dois testes existem para essa falta não voltar.
   */
  describe("o caminho de um clique é ensinado", () => {
    const passoGerar = todosOsPassos.find(({ passo }) => passo.alvo === "gerar-dia");

    it("existe um passo que aponta para o botão de gerar o dia", () => {
      expect(
        passoGerar,
        'nenhum passo da trilha aponta para "gerar-dia" — o recurso principal fica invisível',
      ).toBeTruthy();
    });

    it("e ele só avança quando o dia foi gerado de verdade", () => {
      // Clicar em "Gerar" numa sede sem rota padrão, ou num dia em que a sede
      // não opera, é clique sem geração — o tutorial não pode dar por ensinado.
      expect(passoGerar?.passo.avancarEm).toBe("sucesso");
      expect(passoGerar?.passo.evento).toBe(EVENTO_DIA_GERADO);
    });

    it("a etapa que ensina a gerar diz o que precisa existir antes", () => {
      const etapa = TRILHA.find((e) => e.passos.some((p) => p.alvo === "gerar-dia"));
      // Sem `precisa`, o holofote acusaria "tutorial desatualizado" numa sede
      // que ainda não tem rota padrão — assustando quem só não chegou lá.
      expect(etapa?.precisa, `etapa "${etapa?.id}" precisa dizer o pré-requisito`).toBeTruthy();
    });
  });

  /**
   * O roteiro aponta para marcadores `data-tour` espalhados pelas telas, e nada
   * liga um ao outro em tempo de compilação. `campo-intervalo_min` ficou no
   * roteiro depois que o campo virou o editor de faixas (`intervalos`): o passo
   * sobre intervalos caía em "Pular este passo" e a lição não era dada. Ninguém
   * percebeu porque o tutorial continuava "funcionando".
   */
  it("todo alvo da trilha existe em alguma tela", () => {
    const fontes = arquivosDeCodigo();
    const texto = fontes.map((f) => readFileSync(f, "utf8")).join("\n");
    const literais = new Set([...texto.matchAll(/data-tour="([^"]+)"/gu)].map((m) => m[1]));
    // Todo campo de formulário vira alvo `campo-<chave>` automaticamente.
    const dinamico = texto.includes("data-tour={`campo-${c.key}`}");
    const chaves = new Set([...texto.matchAll(/key:\s*"([A-Za-z0-9_]+)"/gu)].map((m) => m[1]));

    const orfaos = todosOsPassos
      .filter(({ passo }) => {
        if (!passo.alvo) return false;
        if (literais.has(passo.alvo)) return false;
        if (passo.alvo.startsWith("campo-") && dinamico) {
          return !chaves.has(passo.alvo.slice("campo-".length));
        }
        return true;
      })
      .map(({ etapa, passo }) => `${etapa}: ${passo.alvo}`);

    expect(orfaos, "alvos que o roteiro cita e nenhuma tela declara").toEqual([]);
  });

  it("toda etapa tem id único, nome, ganho e rota", () => {
    const ids = TRILHA.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of TRILHA) {
      expect(e.nome.length, `etapa "${e.id}" sem nome`).toBeGreaterThan(0);
      expect(e.ganho.length, `etapa "${e.id}" sem ganho`).toBeGreaterThan(0);
      expect(e.rota.startsWith("/"), `etapa "${e.id}" com rota estranha: ${e.rota}`).toBe(true);
    }
  });
});
