/**
 * Senha, código de primeiro acesso e o estado do tutorial.
 *
 * O código é credencial: se o sorteio for enviesado ou a validação frouxa,
 * ninguém percebe olhando a tela.
 */
import { describe, expect, it } from "vitest";
import {
  ALFABETO_CODIGO,
  gerarCodigoAcesso,
  hashSenha,
  normalizarCodigo,
  problemaNaSenha,
  verificarSenha,
} from "@/lib/senha";
import { MIN_SENHA } from "@/lib/sessionConstants";
import {
  deveConvidar,
  escreverEstado,
  lerEstado,
  podeAutoIniciar,
} from "@/lib/tutorial/estado";

describe("senha guardada", () => {
  it("confere a senha certa e recusa a errada", () => {
    const guardado = hashSenha("minhaSenha9");
    expect(verificarSenha("minhaSenha9", guardado)).toBe(true);
    expect(verificarSenha("minhaSenha8", guardado)).toBe(false);
  });

  it("nunca guarda a senha em texto", () => {
    expect(hashSenha("minhaSenha9")).not.toContain("minhaSenha9");
  });

  it("dois hashes da mesma senha são diferentes (sal por senha)", () => {
    expect(hashSenha("igual")).not.toBe(hashSenha("igual"));
  });

  it("valor guardado inválido não autentica ninguém", () => {
    // O ":" é o caso que importa: com salt e hash vazios, o scrypt devolvia 0
    // byte e a comparação de dois vazios dava VERDADEIRO — qualquer senha
    // entrava. Foi um bug real, achado por este teste.
    for (const lixo of ["", "sem-dois-pontos", ":", ":abc", "abc:", "zz:zz"]) {
      expect(verificarSenha("qualquer", lixo)).toBe(false);
    }
    expect(verificarSenha("qualquer", undefined)).toBe(false);
    expect(verificarSenha("qualquer", null)).toBe(false);
  });
});

describe("problemaNaSenha", () => {
  it("recusa senha curta", () => {
    expect(problemaNaSenha("boa" + "x".repeat(MIN_SENHA - 4))).toBeTruthy();
    expect(problemaNaSenha("boa" + "x".repeat(MIN_SENHA - 3))).toBeNull();
  });

  it("recusa senha só de números — 6 dígitos caem em 19 min sem freio", () => {
    // Medido em 20/08: 56ms por verificação, login sem limite de tentativas.
    // O tamanho não salva: 10 dígitos ainda é um espaço pequeno para máquina.
    expect(problemaNaSenha("123456")).toBeTruthy();
    expect(problemaNaSenha("1234567890")).toBeTruthy();
    expect(problemaNaSenha("98765432109876")).toBeTruthy();
    expect(problemaNaSenha("1234senha56")).toBeNull(); // com letra, passa
  });

  it("recusa o mesmo caractere repetido, por mais longo que seja", () => {
    expect(problemaNaSenha("a".repeat(MIN_SENHA))).toBeTruthy();
    expect(problemaNaSenha("a".repeat(40))).toBeTruthy();
  });

  it("recusa só espaços", () => {
    expect(problemaNaSenha("        ")).toBeTruthy();
  });

  it("recusa repetir o código recebido, inclusive com outra caixa e sem hífen", () => {
    expect(problemaNaSenha("K7M-4QP-92X", "K7M-4QP-92X")).toBeTruthy();
    expect(problemaNaSenha("k7m4qp92x", "K7M-4QP-92X")).toBeTruthy();
  });

  it("aceita senha boa mesmo havendo código", () => {
    expect(problemaNaSenha("outraSenha1", "K7M-4QP-92X")).toBeNull();
  });
});

describe("código de primeiro acesso", () => {
  it("sai no formato de três grupos de três", () => {
    expect(gerarCodigoAcesso()).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });

  it("não usa caracteres que se confundem ao ditar", () => {
    const confusos = /[O0IL1U]/;
    for (let i = 0; i < 300; i++) {
      expect(gerarCodigoAcesso()).not.toMatch(confusos);
    }
  });

  it("não repete: 500 códigos, 500 valores distintos", () => {
    const vistos = new Set(Array.from({ length: 500 }, gerarCodigoAcesso));
    expect(vistos.size).toBe(500);
  });

  it("sorteia todos os caracteres do alfabeto de forma uniforme", () => {
    // `byte % 30` deixava os 16 primeiros ~12% mais frequentes; a rejeição de
    // bytes corrigiu. Este teste é o que impede a regressão silenciosa.
    const conta = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < 4000; i++) {
      for (const c of normalizarCodigo(gerarCodigoAcesso())) {
        conta.set(c, (conta.get(c) ?? 0) + 1);
        total++;
      }
    }
    expect(conta.size).toBe(ALFABETO_CODIGO.length);
    const esperado = total / ALFABETO_CODIGO.length;
    for (const [, n] of conta) {
      // margem folgada de propósito: pega viés estrutural, não ruído amostral.
      expect(Math.abs(n - esperado) / esperado).toBeLessThan(0.2);
    }
  });

  it("normaliza minúscula, espaço e hífen", () => {
    expect(normalizarCodigo("k7m 4qp-92x")).toBe("K7M4QP92X");
    expect(normalizarCodigo("")).toBe("");
  });
});

describe("estado do tutorial", () => {
  const agora = new Date("2026-08-10T12:00:00.000Z");

  it("lê e escreve os quatro estados", () => {
    expect(lerEstado("")).toEqual({ tipo: "nunca" });
    expect(lerEstado("ativo")).toEqual({ tipo: "ativo" });
    expect(lerEstado("pulado")).toEqual({ tipo: "pulado" });
    expect(lerEstado("adiado:2026-08-11T00:00:00.000Z")).toEqual({
      tipo: "adiado",
      ate: "2026-08-11T00:00:00.000Z",
    });
    expect(escreverEstado({ tipo: "adiado", ate: "X" })).toBe("adiado:X");
    expect(escreverEstado({ tipo: "nunca" })).toBe("");
  });

  it("texto desconhecido cai em 'nunca' em vez de quebrar", () => {
    expect(lerEstado("qualquer-coisa")).toEqual({ tipo: "nunca" });
    expect(lerEstado(undefined)).toEqual({ tipo: "nunca" });
  });

  it("convida quem nunca respondeu e não fez nada", () => {
    expect(deveConvidar({ tipo: "nunca" }, 0, agora)).toBe(true);
  });

  it("não convida quem já concluiu alguma etapa", () => {
    expect(deveConvidar({ tipo: "nunca" }, 1, agora)).toBe(false);
  });

  it("não convida quem pulou, nunca mais", () => {
    expect(deveConvidar({ tipo: "pulado" }, 0, agora)).toBe(false);
  });

  it("adiamento cala hoje e volta a perguntar depois de vencer", () => {
    const amanha = { tipo: "adiado" as const, ate: "2026-08-11T00:00:00.000Z" };
    expect(deveConvidar(amanha, 0, agora)).toBe(false);
    expect(deveConvidar(amanha, 0, new Date("2026-08-12T00:00:00.000Z"))).toBe(true);
  });

  it("data de adiamento corrompida volta a convidar (falha para o lado útil)", () => {
    expect(deveConvidar({ tipo: "adiado", ate: "nao-e-data" }, 0, agora)).toBe(true);
  });

  it("holofote automático só depois de aceitar", () => {
    expect(podeAutoIniciar({ tipo: "ativo" }, 0)).toBe(true);
    expect(podeAutoIniciar({ tipo: "nunca" }, 0)).toBe(false);
    expect(podeAutoIniciar({ tipo: "pulado" }, 5)).toBe(false);
    expect(podeAutoIniciar({ tipo: "adiado", ate: "X" }, 5)).toBe(false);
  });

  it("quem está no meio da trilha segue guiado mesmo sem estado", () => {
    expect(podeAutoIniciar({ tipo: "nunca" }, 3)).toBe(true);
  });
});
