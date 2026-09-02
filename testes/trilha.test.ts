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
import { describe, expect, it } from "vitest";
import { EVENTO_DIA_GERADO, TRILHA, type PassoTutorial } from "@/lib/tutorial/trilha";

const todosOsPassos: Array<{ etapa: string; indice: number; passo: PassoTutorial }> = TRILHA.flatMap(
  (e) => e.passos.map((passo, indice) => ({ etapa: e.id, indice, passo })),
);

describe("trilha do tutorial", () => {
  it("todo passo que aponta para o botão de salvar espera o RESULTADO, não o clique", () => {
    const salvares = todosOsPassos.filter(({ passo }) => passo.alvo === "crud-salvar");
    expect(salvares.length).toBeGreaterThan(0); // senão o teste não protege nada
    for (const { etapa, passo } of salvares) {
      expect(
        passo.avancarEm,
        `etapa "${etapa}": o passo "${passo.titulo}" manda salvar e avançaria sem ter salvado`,
      ).toBe("sucesso");
    }
  });

  it("o passo que manda salvar também diz para preencher — senão leva ao erro", () => {
    for (const { etapa, passo } of todosOsPassos.filter((p) => p.passo.alvo === "crud-salvar")) {
      expect(
        /preench|escolha|selecione/iu.test(passo.texto),
        `etapa "${etapa}": "${passo.titulo}" manda clicar em Salvar sem pedir para preencher nada`,
      ).toBe(true);
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
