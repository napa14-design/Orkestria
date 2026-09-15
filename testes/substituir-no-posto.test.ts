/**
 * Substituição no posto: "Jorge assumiu o lugar do Assis em 15/09".
 *
 * Pedido do dono em 15/09/2026, com a regra dita por ele: **a rota é do posto,
 * não da pessoa** — e, na frase que define tudo, *"a partir do dia 15 aparece
 * Jorge no lugar do Assis, e antes do dia 15 é o Assis"*.
 *
 * O que estes testes protegem é essa fronteira. A tentação barata é renomear o
 * cadastro: um registro só, zero código. Só que o bloco guarda o **id** do
 * funcionário e a tela lê o nome na hora de desenhar — renomear reescreve o
 * passado, e o dia já realizado passa a dizer que quem trabalhou foi o
 * substituto. Se algum dia alguém "simplificar" isto para um rename, o teste
 * "o passado continua com quem trabalhou" cai.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { reiniciarBanco } from "@/lib/memoryStore";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { createFuncionario, substituirNoPosto } from "@/services/funcionariosService";
import { createRotina } from "@/services/rotinasService";
import { salvarModelo } from "@/services/modelosService";

const SEDE = "christus_dt";
const ANTIGO = "christus_f1"; // Aurilene, do seed — faz o papel do "Assis"
/**
 * Segunda, terça e quarta de uma semana à frente. Duas armadilhas, as duas
 * pisadas ao escrever este arquivo:
 *
 * 1. **data fixa** — o seed monta a agenda de HOJE para este funcionário, e os
 *    17 blocos dele caíam do lado de lá do corte, entrando na contagem;
 * 2. **deslocamento fixo a partir de hoje** — "hoje + 5" caiu num domingo, e
 *    `createRotina` recusa com "folga pela escala". Rodando noutro dia da
 *    semana, passaria: é o tipo de teste que quebra sozinho na terça-feira.
 *
 * Ancorar numa segunda-feira futura resolve as duas de uma vez.
 */
function proximaSegunda(base: string): string {
  let d = somarDias(base, 7);
  while (new Date(`${d}T12:00:00`).getDay() !== 1) d = somarDias(d, 1);
  return d;
}
const ANTES = proximaSegunda(hojeISO());
const CORTE = somarDias(ANTES, 1);
const DEPOIS = somarDias(ANTES, 2);

/** O "Jorge": mesmo posto, mesma jornada. */
async function criarSubstituto(nome = "Jorge") {
  return createFuncionario(
    {
      nome,
      sede_id: SEDE,
      turno: "integral",
      entrada: "06:00",
      saida: "16:00",
      ativo: true,
    } as never,
    "t@t.com",
  );
}

/** Um bloco no dia/hora pedidos, para o funcionário do seed. */
async function bloco(data: string, hora: string, funcionarioId = ANTIGO) {
  const { rotina } = await createRotina(
    {
      data,
      funcionario_id: funcionarioId,
      tarefa_id: "christus_t1",
      local_id: "christus_l1",
      inicio_planejado: hora,
      supervisor_id: "u1",
    } as never,
    "t@t.com",
  );
  return rotina;
}

describe("substituirNoPosto", () => {
  beforeEach(() => reiniciarBanco());

  it("o passado continua com quem trabalhou — a fronteira da data", async () => {
    const antes = await bloco(ANTES, "07:00");
    const depois = await bloco(DEPOIS, "07:00");
    const jorge = await criarSubstituto();

    await substituirNoPosto(jorge.id, ANTIGO, CORTE, "t@t.com");

    const ds = await getDataSource();
    expect((await ds.obter("rotinas_planejadas", antes.id))?.funcionario_id).toBe(ANTIGO);
    expect((await ds.obter("rotinas_planejadas", depois.id))?.funcionario_id).toBe(jorge.id);
  });

  it("o próprio dia da troca já é do substituto", async () => {
    const noDia = await bloco(CORTE, "07:00");
    const jorge = await criarSubstituto();
    await substituirNoPosto(jorge.id, ANTIGO, CORTE, "t@t.com");
    const ds = await getDataSource();
    expect((await ds.obter("rotinas_planejadas", noDia.id))?.funcionario_id).toBe(jorge.id);
  });

  it("bloco com realizado registrado NUNCA muda de dono, nem depois da data", async () => {
    // Alguém pode ter trabalhado na manhã do próprio dia da troca. Esse
    // registro é histórico dele, e histórico não se transfere.
    const feito = await bloco(DEPOIS, "07:00");
    const ds = await getDataSource();
    await ds.atualizar("rotinas_planejadas", feito.id, { status: "realizada" });

    const jorge = await criarSubstituto();
    const r = await substituirNoPosto(jorge.id, ANTIGO, CORTE, "t@t.com");

    expect((await ds.obter("rotinas_planejadas", feito.id))?.funcionario_id).toBe(ANTIGO);
    expect(r.blocosTransferidos).toBe(0);
    expect(r.blocosPreservados).toBe(1);
  });

  it("a rota padrão passa inteira para o novo, e não fica duplicada no antigo", async () => {
    await bloco(ANTES, "07:00");
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", {
      padrao: true,
      comDuracao: true,
    });
    const jorge = await criarSubstituto();

    const r = await substituirNoPosto(jorge.id, ANTIGO, CORTE, "t@t.com");

    const ds = await getDataSource();
    const doNovo = await ds.consultar("modelos_rotina", [
      { campo: "funcionario_id", op: "==", valor: jorge.id },
    ]);
    const doAntigo = await ds.consultar("modelos_rotina", [
      { campo: "funcionario_id", op: "==", valor: ANTIGO },
    ]);
    expect(r.itensDeRota).toBeGreaterThan(0);
    expect(doNovo.length).toBe(r.itensDeRota);
    // O posto é um só: deixar a rota nos dois geraria o dia em dobro.
    expect(doAntigo.length).toBe(0);
  });

  it("quem saiu fica inativo, com o registro inteiro", async () => {
    const jorge = await criarSubstituto();
    await substituirNoPosto(jorge.id, ANTIGO, CORTE, "t@t.com");
    const ds = await getDataSource();
    const antigo = await ds.obter("funcionarios", ANTIGO);
    expect(antigo?.ativo).toBe(false);
    expect(antigo?.nome).toBe("Aurilene"); // o cadastro não é apagado nem renomeado
    expect(antigo?.observacoes).toContain("Substituído por Jorge");
  });

  it("recusa substituição entre sedes diferentes", async () => {
    const deOutraSede = await createFuncionario(
      { nome: "Fora", sede_id: "christus_ald", turno: "integral", entrada: "06:00", saida: "16:00", ativo: true } as never,
      "t@t.com",
    );
    await expect(substituirNoPosto(deOutraSede.id, ANTIGO, CORTE, "t@t.com")).rejects.toThrow();
  });

  it("recusa substituir a si mesmo", async () => {
    await expect(substituirNoPosto(ANTIGO, ANTIGO, CORTE, "t@t.com")).rejects.toThrow();
  });
});
