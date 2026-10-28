/**
 * Desligar — o "Excluir" do funcionário que virou "Desligar" (13/10/2026).
 *
 * As fronteiras que estes testes guardam:
 *  1. A DATA: antes dela (aviso prévio) a pessoa trabalha; dela em diante, não
 *     tem dia — nem bloco gerado, nem coluna.
 *  2. O HISTÓRICO: bloco com realizado nunca sai, e a pessoa nunca é apagada.
 *  3. O POSTO: a rota padrão fica, para quem for contratado assumir.
 *  4. A VAGA: o desligamento não depende dela; ela é idempotente; abandono não
 *     abre (a Coordenação pede a vaga pelo Chromos).
 *  5. O FURO ANTIGO: a geração criava blocos para inativo — nada olhava `ativo`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import {
  comAtivoDoDia,
  motivoAbreVaga,
  noQuadro,
  pedidoDeVaga,
  siglaNoSgcp,
  validarDesligamento,
} from "@/lib/desligamento";
import { reiniciarBanco } from "@/lib/memoryStore";
import { projetarDiaDaRota, type ContextoProjecao } from "@/lib/projecaoDia";
import {
  abrirVagaNoSgcp,
  createFuncionario,
  desligarFuncionario,
  getFuncionarios,
  substituirNoPosto,
  updateFuncionario,
} from "@/services/funcionariosService";
import { salvarModelo } from "@/services/modelosService";
import { createRotina } from "@/services/rotinasService";
import type { ModeloRotinaItem } from "@/types";
import { funcionario, tarefa } from "./fixtures";

const SEDE = "christus_dt";
const PESSOA = "christus_f1"; // Aurilene, do seed
const SOLICITANTE = { nome: "Larissa", email: "larissa@x.com" };

/** Segunda-feira de uma semana à frente (o seed monta a agenda de HOJE). */
function proximaSegunda(base: string): string {
  let d = somarDias(base, 7);
  while (new Date(`${d}T12:00:00`).getDay() !== 1) d = somarDias(d, 1);
  return d;
}
const ANTES = proximaSegunda(hojeISO());
const DATA = somarDias(ANTES, 1);
const DEPOIS = somarDias(ANTES, 2);

async function bloco(data: string, hora = "07:00") {
  const { rotina } = await createRotina(
    { data, funcionario_id: PESSOA, tarefa_id: "christus_t1", local_id: "christus_l1", inicio_planejado: hora, supervisor_id: "u1" } as never,
    "t@t.com",
  );
  return rotina;
}

describe("regras puras", () => {
  it("no quadro: até a véspera sim; NO dia do desligamento, não; inativo nunca", () => {
    const f = { ativo: true, desligado_em: "2026-10-20" };
    expect(noQuadro(f, "2026-10-19")).toBe(true);
    expect(noQuadro(f, "2026-10-20")).toBe(false);
    expect(noQuadro({ ativo: false }, "2026-01-01")).toBe(false);
    expect(noQuadro({ ativo: true }, "2099-01-01")).toBe(true);
  });

  it("o ativo das telas vira falso quando a data chega, não antes", () => {
    const f = { ativo: true, desligado_em: "2026-10-20" };
    expect(comAtivoDoDia(f, "2026-10-19").ativo).toBe(true);
    expect(comAtivoDoDia(f, "2026-10-20").ativo).toBe(false);
  });

  it("abandono não abre vaga; os outros motivos abrem", () => {
    expect(motivoAbreVaga("Abandono de emprego")).toBe(false);
    expect(motivoAbreVaga("Pedido de demissão")).toBe(true);
  });

  it("recusa sem data ou com motivo fora da lista", () => {
    expect(validarDesligamento({ motivo: "Pedido de demissão" })).toMatch(/data/);
    expect(validarDesligamento({ data: "2026-10-20", motivo: "Sumiu" })).toMatch(/motivo/);
    expect(validarDesligamento({ data: "2026-10-20", motivo: "Outros" })).toBeNull();
    // Os que vieram da lista do SGCP.
    for (const m of ["Término de experiência", "Acordo", "Aposentadoria"])
      expect(validarDesligamento({ data: "2026-10-20", motivo: m })).toBeNull();
  });

  it("sigla do SGCP: DT 2 vira DT, CES vira CESIU; as outras seguem como estão", () => {
    expect(siglaNoSgcp({ codigo: "DT2", nome_sede: "Dionísio Torres 2" })).toBe("DT");
    // "CES" não casa com nada no SGCP: lá a CESIU é "CESIU" (nome e sigla).
    expect(siglaNoSgcp({ codigo: "CES", nome_sede: "CESIU" })).toBe("CESIU");
    // A Benfica daqui é a da Universidade: "BN" lá é a do Colégio.
    expect(siglaNoSgcp({ codigo: "BN", nome_sede: "Benfica" })).toBe("UBN");
    expect(siglaNoSgcp({ codigo: "SUL 1", nome_sede: "Sul 1" })).toBe("SUL 1");
    expect(siglaNoSgcp({ codigo: "", nome_sede: "Benfica" })).toBe("Benfica");
  });

  it("o pedido leva quem saiu, a rota em ordem e cargo/setor padrão", () => {
    const p = pedidoDeVaga({
      funcionario: { id: "christus_dt_f6", nome: "Aliciane", cargo: "", motivo_desligamento: "Pedido de demissão", desligado_em: "2026-10-20" },
      sede: { codigo: "DT2", nome_sede: "Dionísio Torres 2" },
      rota: [
        { inicio: "13:00", duracao: 60, tarefa: "Praça" },
        { inicio: "07:05", duracao: 10, tarefa: "Garrafas" },
      ],
      solicitante: SOLICITANTE,
    });
    expect(p).toMatchObject({
      versao: 1,
      origem: { sistema: "Orkestria", caso: "christus_dt_f6" },
      cargo: "ASG",
      setor: "Infraestrutura",
      sede: "DT",
      motivo: "Pedido de demissão",
      substituido: { nome: "Aliciane" },
    });
    expect(p.substituido).not.toHaveProperty("matricula"); // vazia não vai
    expect(p.descricao).toMatch(/20\/10\/2026.*07:05 \(10 min\) Garrafas; 13:00 \(60 min\) Praça/);
  });
});

describe("desligarFuncionario", () => {
  beforeEach(() => reiniciarBanco());

  it("aviso prévio: antes da data fica; da data em diante o planejado sai; a pessoa segue ativa", async () => {
    const antes = await bloco(ANTES);
    const noDia = await bloco(DATA);
    const depois = await bloco(DEPOIS);

    const r = await desligarFuncionario(PESSOA, { data: DATA, motivo: "Pedido de demissão" }, "t@t.com", SOLICITANTE);

    const ds = await getDataSource();
    expect(await ds.obter("rotinas_planejadas", antes.id)).not.toBeNull();
    expect(await ds.obter("rotinas_planejadas", noDia.id)).toBeNull();
    expect(await ds.obter("rotinas_planejadas", depois.id)).toBeNull();
    expect(r.blocosRemovidos).toBe(2);
    const f = await ds.obter("funcionarios", PESSOA);
    expect(f).toMatchObject({ desligado_em: DATA, motivo_desligamento: "Pedido de demissão", ativo: true });
    expect(f?.observacoes).toContain("Desligado(a) em");
  });

  it("bloco com realizado NUNCA sai, nem depois da data", async () => {
    const feito = await bloco(DEPOIS);
    const ds = await getDataSource();
    await ds.atualizar("rotinas_planejadas", feito.id, { status: "realizada" });
    const r = await desligarFuncionario(PESSOA, { data: DATA, motivo: "Outros" }, "t@t.com", SOLICITANTE);
    expect(await ds.obter("rotinas_planejadas", feito.id)).not.toBeNull();
    expect(r.blocosPreservados).toBe(1);
  });

  it("data de hoje ou passada: inativo na hora, e as telas já o veem fora", async () => {
    await desligarFuncionario(PESSOA, { data: hojeISO(), motivo: "Outros" }, "t@t.com", SOLICITANTE);
    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", PESSOA))?.ativo).toBe(false);
    expect((await getFuncionarios(SEDE)).find((f) => f.id === PESSOA)?.ativo).toBe(false);
  });

  it("a rota padrão fica (posto vago) e o cadastro não é apagado", async () => {
    await bloco(ANTES);
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    const ds = await getDataSource();
    const rota = () => ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: PESSOA }]);
    const antes = (await rota()).length;
    await desligarFuncionario(PESSOA, { data: DATA, motivo: "Outros" }, "t@t.com", SOLICITANTE);
    expect(antes).toBeGreaterThan(0);
    expect((await rota()).length).toBe(antes);
    expect((await ds.obter("funcionarios", PESSOA))?.nome).toBe("Aurilene");
  });

  it("posto vago: quem for contratado assume a rota, e o posto deixa de ser vago", async () => {
    await bloco(ANTES);
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    await desligarFuncionario(PESSOA, { data: DATA, motivo: "Pedido de demissão" }, "t@t.com", SOLICITANTE);
    const novo = await createFuncionario(
      { nome: "Jorge", sede_id: SEDE, turno: "integral", entrada: "06:00", saida: "16:00", ativo: true } as never,
      "t@t.com",
    );
    const r = await substituirNoPosto(novo.id, PESSOA, DATA, "t@t.com");
    const ds = await getDataSource();
    expect(r.itensDeRota).toBeGreaterThan(0);
    expect((await ds.obter("funcionarios", PESSOA))?.substituido_por).toBe(novo.id);
  });

  it("o PUT do cadastro não mexe no desligamento — só o Desligar e o Assume o posto", async () => {
    for (const campo of [
      { desligado_em: DATA }, { motivo_desligamento: "afastado por depressão" }, { vaga_sgcp: "" },
      { posto_extinto: false }, { substituido_por: "x" }, { ativo: false },
    ])
      await expect(updateFuncionario(PESSOA, campo as never, "t@t.com")).rejects.toThrow(/só mudam pelo/);
    expect((await (await getDataSource()).obter("funcionarios", PESSOA))?.desligado_em).toBeUndefined();
  });

  it("cadastro novo entra ativo mesmo sem o campo (o checkbox saiu do formulário)", async () => {
    const novo = await createFuncionario(
      { nome: "Sem checkbox", sede_id: SEDE, turno: "integral", entrada: "07:00", saida: "16:00" } as never,
      "t@t.com",
    );
    expect(novo.ativo).toBe(true);
  });

  it("recusa desligar duas vezes e motivo inválido", async () => {
    await expect(desligarFuncionario(PESSOA, { data: DATA, motivo: "Sumiu" }, "t@t.com", SOLICITANTE)).rejects.toThrow();
    await desligarFuncionario(PESSOA, { data: DATA, motivo: "Outros" }, "t@t.com", SOLICITANTE);
    await expect(desligarFuncionario(PESSOA, { data: DEPOIS, motivo: "Outros" }, "t@t.com", SOLICITANTE)).rejects.toThrow(/já está desligad/);
  });
});

describe("vaga no SGCP", () => {
  const original = globalThis.fetch;
  let chamadas: { url: string; init: RequestInit }[];
  let respostaSgcp: () => Response;

  beforeEach(() => {
    reiniciarBanco();
    chamadas = [];
    respostaSgcp = () => Response.json({ id: "orkestria_x", codigo: "2147180600" }, { status: 201 });
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return respostaSgcp();
    }) as unknown as typeof fetch;
    vi.stubEnv("SGCP_VAGAS_URL", "https://sgcp.test/api/vagas-externas");
    vi.stubEnv("CHAVE_ORKESTRIA", "chave-do-orkestria-de-teste-com-32-caracteres");
  });
  afterEach(() => {
    globalThis.fetch = original;
    vi.unstubAllEnvs();
  });

  it("abre a vaga com o token, guarda o código, e não chama de novo", async () => {
    // A sede do seed não tem código; em produção a DT tem "DT".
    await (await getDataSource()).atualizar("sedes", SEDE, { codigo: "DT" });
    const r = await desligarFuncionario(PESSOA, { data: DATA, motivo: "Pedido de demissão" }, "t@t.com", SOLICITANTE);
    expect(r.vaga).toEqual({ aberta: true, codigo: "2147180600" });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("https://sgcp.test/api/vagas-externas");
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe("Bearer chave-do-orkestria-de-teste-com-32-caracteres");
    const corpo = JSON.parse(String(chamadas[0].init.body));
    expect(corpo).toMatchObject({ origem: { sistema: "Orkestria", caso: PESSOA }, sede: "DT", solicitante: { nome: "Larissa" } });

    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", PESSOA))?.vaga_sgcp).toBe("2147180600");
    expect(await abrirVagaNoSgcp(PESSOA, SOLICITANTE)).toEqual({ aberta: true, codigo: "2147180600" });
    expect(chamadas).toHaveLength(1); // idempotente aqui também
  });

  it("SGCP recusa: o desligamento fica gravado, a vaga não, e dá para tentar de novo", async () => {
    respostaSgcp = () => Response.json({ erro: 'Sede "CESIU" não está no cadastro de sedes do SGPC.' }, { status: 400 });
    const r = await desligarFuncionario(PESSOA, { data: DATA, motivo: "Outros" }, "t@t.com", SOLICITANTE);
    expect(r.vaga).toEqual({ aberta: false, motivo: expect.stringMatching(/recusou.*CESIU/) });
    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", PESSOA))?.desligado_em).toBe(DATA);
    expect((await ds.obter("funcionarios", PESSOA))?.vaga_sgcp ?? "").toBe("");

    respostaSgcp = () => Response.json({ id: "x", codigo: "2147180601" }, { status: 201 });
    expect(await abrirVagaNoSgcp(PESSOA, SOLICITANTE)).toEqual({ aberta: true, codigo: "2147180601" });
  });

  it("quem desliga pode não querer a vaga: desliga igual, não chama o SGCP, e pode abrir depois", async () => {
    const r = await desligarFuncionario(
      PESSOA, { data: DATA, motivo: "Transferência", abrirVaga: false }, "t@t.com", SOLICITANTE,
    );
    expect(r.vaga.aberta).toBe(false);
    expect(chamadas).toHaveLength(0);
    const ds = await getDataSource();
    expect((await ds.obter("funcionarios", PESSOA))?.desligado_em).toBe(DATA);
    // Mudou de ideia: o botão "Abrir vaga" chama o SGCP normalmente.
    expect(await abrirVagaNoSgcp(PESSOA, SOLICITANTE)).toEqual({ aberta: true, codigo: "2147180600" });
    expect(chamadas).toHaveLength(1);
  });

  it("posto extinto (quadro diminui): rota apagada, sem vaga, e o 'Abrir vaga' depois recusa", async () => {
    await bloco(ANTES);
    await salvarModelo("Rota padrão", ANTES, SEDE, "t@t.com", { padrao: true, comDuracao: true });
    const r = await desligarFuncionario(
      PESSOA,
      { data: DATA, motivo: "Demissão sem justa causa", abrirVaga: false, extinguirPosto: true },
      "t@t.com",
      SOLICITANTE,
    );
    const ds = await getDataSource();
    expect(r.itensDeRotaApagados).toBeGreaterThan(0);
    expect(await ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: PESSOA }])).toHaveLength(0);
    expect((await ds.obter("funcionarios", PESSOA))?.posto_extinto).toBe(true);
    expect(r.vaga.aberta).toBe(false);
    expect((await abrirVagaNoSgcp(PESSOA, SOLICITANTE)).aberta).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("posto extinto com vaga se contradizem: recusa sem gravar nada", async () => {
    await expect(
      desligarFuncionario(PESSOA, { data: DATA, motivo: "Outros", extinguirPosto: true }, "t@t.com", SOLICITANTE),
    ).rejects.toThrow(/posto deixa de existir/);
    expect((await (await getDataSource()).obter("funcionarios", PESSOA))?.desligado_em).toBeUndefined();
  });

  it("URL do SGCP sem https não recebe o token", async () => {
    vi.stubEnv("SGCP_VAGAS_URL", "http://sgcp.test/api/vagas-externas");
    const r = await desligarFuncionario(PESSOA, { data: DATA, motivo: "Outros" }, "t@t.com", SOLICITANTE);
    expect(r.vaga).toEqual({ aberta: false, motivo: expect.stringMatching(/https/) });
    expect(chamadas).toHaveLength(0);
  });

  it("justa causa não vai para o SGCP: o pedido leva só 'Desligamento'", async () => {
    await desligarFuncionario(PESSOA, { data: DATA, motivo: "Demissão por justa causa" }, "t@t.com", SOLICITANTE);
    expect(JSON.parse(String(chamadas[0].init.body)).motivo).toBe("Desligamento");
  });

  it("abandono de emprego não chama o SGCP", async () => {
    const r = await desligarFuncionario(PESSOA, { data: DATA, motivo: "Abandono de emprego" }, "t@t.com", SOLICITANTE);
    expect(r.vaga.aberta).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("sem a integração configurada: desliga e diz que a vaga não abriu", async () => {
    vi.stubEnv("CHAVE_ORKESTRIA", "");
    const r = await desligarFuncionario(PESSOA, { data: DATA, motivo: "Outros" }, "t@t.com", SOLICITANTE);
    expect(r.vaga).toEqual({ aberta: false, motivo: expect.stringMatching(/não está configurada/) });
    expect(chamadas).toHaveLength(0);
  });
});

describe("geração do dia", () => {
  const item: ModeloRotinaItem = {
    id: "m1", nome_modelo: "Rota padrão", sede_id: "aldeota", funcionario_id: "f1", tarefa_id: "t1",
    local_id: "l1", inicio_planejado: "08:00", padrao: true, criado_por: "t", criado_em: "",
  };
  const ctx = (f: ReturnType<typeof funcionario>, data = "2026-08-10"): ContextoProjecao => ({
    data, tarefas: new Map([["t1", tarefa()]]), funcionarios: new Map([["f1", f]]),
    blocosDoDia: [], ausentes: new Set(), letivoFora: false, duracaoDoItem: () => 30,
  });

  it("não gera para desligado a partir da data; gera antes dela (aviso prévio)", () => {
    const f = funcionario({ desligado_em: "2026-08-10" });
    expect(projetarDiaDaRota([item], ctx(f, "2026-08-10")).descartados[0].motivo).toBe("fora_do_quadro");
    expect(projetarDiaDaRota([item], ctx(f, "2026-08-07")).materializar).toHaveLength(1);
  });

  it("não gera para inativo — o furo antigo", () => {
    expect(projetarDiaDaRota([item], ctx(funcionario({ ativo: false }))).descartados[0].motivo).toBe("fora_do_quadro");
  });
});
