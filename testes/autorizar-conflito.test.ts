/**
 * O que o supervisor pode autorizar na mão, e o que bloqueia de vez.
 *
 * Pedido do dono em 15/09/2026: *"o sistema mostra erro quando quer colocar uma
 * tarefa fora do horário, eu acho que tem que aparecer um modal avisando, e se
 * a pessoa quiser autorizar"*.
 *
 * O perigo desta mudança não era acrescentar o código — era **onde**. A lista
 * vivia em dois lugares (`CODIGOS_AUTORIZAVEIS` no serviço e uma cópia escrita à
 * mão no `page.tsx`). Mexer num só produz o pior dos defeitos: uma tela que
 * pergunta "autoriza?" e um servidor que recusa de qualquer jeito — ou o
 * contrário, um erro seco sem caixa nenhuma. O último teste deste arquivo existe
 * só para impedir que a lista volte a ser duplicada.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CODIGOS_AUTORIZAVEIS, podeAutorizar } from "@/lib/validations";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import { createRotina } from "@/services/rotinasService";

const erro = (codigo: string) => ({ nivel: "erro" as const, codigo, mensagem: codigo });

/** Segunda-feira futura: o seed enche HOJE, e sábado/domingo é folga. */
function proximaSegunda(base: string): string {
  let d = somarDias(base, 7);
  while (new Date(`${d}T12:00:00`).getDay() !== 1) d = somarDias(d, 1);
  return d;
}
const DIA = proximaSegunda(hojeISO());

describe("o que dá para autorizar", () => {
  it("fora do expediente virou autorizável — o pedido", () => {
    expect(podeAutorizar([erro("FORA_DO_EXPEDIENTE")])).toBe(true);
  });

  it("conflito e intervalo continuam autorizáveis", () => {
    expect(podeAutorizar([erro("SOBREPOSICAO")])).toBe(true);
    expect(podeAutorizar([erro("INTERVALO")])).toBe(true);
  });

  it("o que autorizar não resolve continua bloqueando", () => {
    // Autorizar não dá treinamento a ninguém nem inventa duração para a tarefa.
    for (const c of [
      "RESTRICAO_GENERO",
      "REQUISITO_FALTANDO",
      "REQUISITO_VENCIDO",
      "SEM_TEMPO_PREVISTO",
      "SEM_JORNADA",
      "JANELA_HORARIO",
    ]) {
      expect(podeAutorizar([erro(c)]), c).toBe(false);
    }
  });

  it("um erro não autorizável no meio derruba o conjunto", () => {
    expect(podeAutorizar([erro("FORA_DO_EXPEDIENTE"), erro("RESTRICAO_GENERO")])).toBe(false);
  });

  it("sem erro não há o que autorizar", () => {
    expect(podeAutorizar([])).toBe(false);
    expect(podeAutorizar([{ nivel: "alerta", codigo: "SOBRECARGA", mensagem: "x" }])).toBe(false);
  });
});

describe("gravar fora do expediente", () => {
  beforeEach(() => reiniciarBanco());

  // Aurilene, do seed, trabalha 06:00–16:00.
  const antesDaEntrada = {
    data: DIA,
    funcionario_id: "christus_f1",
    tarefa_id: "christus_t1",
    local_id: "christus_l1",
    inicio_planejado: "05:00",
    supervisor_id: "u1",
  };

  it("sem autorizar, continua recusando", async () => {
    await expect(createRotina(antesDaEntrada as never, "t@t.com")).rejects.toThrow();
  });

  it("autorizando, grava — e o histórico registra que foi decisão de alguém", async () => {
    const r = await createRotina({ ...antesDaEntrada, forcar: true } as never, "t@t.com");
    expect(r.rotina.inicio_planejado).toBe("05:00");
    const fora = r.alertas.find((a) => a.codigo === "FORA_DO_EXPEDIENTE");
    expect(fora?.nivel).toBe("alerta"); // rebaixado, não sumido
    expect(fora?.mensagem).toContain("autorizado manualmente");
  });

  it("autorizar não libera o que não é autorizável", async () => {
    // Domingo é folga pela escala: `forcar` não passa por cima disso.
    const domingo = somarDias(DIA, 6);
    await expect(
      createRotina({ ...antesDaEntrada, data: domingo, forcar: true } as never, "t@t.com"),
    ).rejects.toThrow();
  });
});

describe("a lista mora em um lugar só", () => {
  function arquivos(raizes = ["app", "components", "services"]): string[] {
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

  it("nenhuma tela ou serviço reescreve os códigos autorizáveis", () => {
    // O que se procura é a comparação literal ("SOBREPOSICAO" === / includes),
    // que foi exatamente a forma da cópia que existia no page.tsx.
    const reincidentes = arquivos().filter((f) => {
      const src = readFileSync(f, "utf8");
      return [...CODIGOS_AUTORIZAVEIS].some((c) =>
        new RegExp(`(===|includes\\(|\\[)\\s*["']${c}["']`, "u").test(src),
      );
    });
    expect(reincidentes, "devem importar CODIGOS_AUTORIZAVEIS/podeAutorizar de lib/validations").toEqual([]);
  });
});
