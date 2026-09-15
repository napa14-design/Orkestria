/**
 * Quando o holofote tem permissão de abrir SOZINHO.
 *
 * Queixa do dono em 15/09/2026: *"parece que se eu saio e volto para a tela,
 * ele sempre reseta e fica spammando"*. Reproduzido na tela, eram duas coisas:
 *
 * 1. **Sair não virava dado.** A recusa vivia num `useRef`; bastava um F5 para
 *    a mesma etapa voltar no passo 1. Para sempre. (Esse lado é do componente:
 *    "Sair do tutorial" agora grava `acao: "pular"`, e o efeito disso aqui é o
 *    estado `pulado` — coberto pelos casos de estado abaixo.)
 * 2. **Cada volta à tela abria a etapa seguinte.** A Rotina do Dia hospeda
 *    cinco etapas; entrar nela cinco vezes rendia cinco emboscadas. É o que
 *    `deveAbrirSozinho` corta: cada tela se apresenta uma vez só.
 *
 * O que estes testes travam é a diferença entre **oferecer** e **emboscar**.
 * Nenhum deles impede a pessoa de abrir o que quiser pela ❔ Ajuda ou pela
 * trilha — esse caminho é explícito e não passa por aqui.
 */
import { describe, expect, it } from "vitest";
import { deveAbrirSozinho, lerEstado, podeAutoIniciar } from "@/lib/tutorial/estado";

const ativo = lerEstado("ativo");
const pulado = lerEstado("pulado");
const nunca = lerEstado("");

describe("deveAbrirSozinho", () => {
  it("abre na PRIMEIRA visita de uma tela ainda não ensinada", () => {
    expect(deveAbrirSozinho(ativo, 0, 0)).toBe(true);
  });

  it("a tela que JÁ deu uma aula não dá outra sozinha — o fim do spam", () => {
    // A pessoa concluiu "montar-dia" e voltou para a Rotina do Dia. Antes,
    // "ensinar-rota" abria na cara dela; e depois "gerar-o-dia", e assim por
    // diante, cinco vezes.
    expect(deveAbrirSozinho(ativo, 1, 1)).toBe(false);
  });

  it("uma tela ensinada não cala as OUTRAS telas", () => {
    // Mesmo progresso total, mas esta tela nunca se apresentou: ela ainda tem
    // direito à sua única aula. Sem esta distinção, concluir a primeira etapa
    // desligaria o tutorial do sistema inteiro.
    expect(deveAbrirSozinho(ativo, 1, 0)).toBe(true);
  });

  it("quem saiu do tutorial não é perseguido em tela nenhuma", () => {
    expect(deveAbrirSozinho(pulado, 0, 0)).toBe(false);
    expect(deveAbrirSozinho(pulado, 3, 0)).toBe(false);
  });

  it("quem nunca respondeu ao convite só é guiado depois de começar", () => {
    expect(deveAbrirSozinho(nunca, 0, 0)).toBe(false);
    expect(deveAbrirSozinho(nunca, 2, 0)).toBe(true);
  });

  it("não afrouxa `podeAutoIniciar`: só aperta", () => {
    // A regra nova é um E, nunca um OU. Se algum dia alguém trocar o `&&` por
    // `||` aqui, este caso cai: tela virgem + pessoa que pulou = silêncio.
    for (const estado of [ativo, pulado, nunca]) {
      for (const total of [0, 1, 5]) {
        for (const nesta of [0, 1]) {
          if (deveAbrirSozinho(estado, total, nesta)) {
            expect(podeAutoIniciar(estado, total)).toBe(true);
          }
        }
      }
    }
  });
});
