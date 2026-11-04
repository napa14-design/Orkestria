/**
 * Central do dia (04/11/2026): o link leva a sede que a pessoa está vendo, e o
 * "em ordem" só é dito depois de conferir o cadastro. Tarefa crítica fora da agenda
 * vira decisão; diária fora da agenda só é avisada, porque é crônica em quase
 * toda sede e como ação a Central nunca sairia dela.
 *
 * Sede sintética, com pessoas fictícias — o repo é público.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fraseDoFeito } from "@/lib/agenda";
import { getDataSource } from "@/lib/datasource";
import type { SessaoUsuario } from "@/lib/permissions";
import { reiniciarBanco } from "@/lib/memoryStore";
import { sedeDaTela } from "@/lib/sedeDaTela";
import { getCentralDia } from "@/services/centralDiaService";
import type { Tarefa } from "@/types";

const SEDE = "s-central";
const COORD: SessaoUsuario = { id: "c1", nome: "Coord", email: "c@x.com", perfil: "coordenador", sede_id: SEDE, sedes: [SEDE] };
const QUARTA = "2026-11-04T13:00:00Z"; // 10:00 em Fortaleza
const SABADO = "2026-11-07T13:00:00Z";

async function tarefa(id: string, extra: Partial<Tarefa> = {}) {
  const d = await getDataSource();
  const base = await d.obter("tarefas", "christus_t2");
  await d.criar("tarefas", {
    ...base!, id, nome_tarefa: id, sede_id: SEDE, local_id: "christus_l1", frequencia: "diaria", critica: false, ativo: true,
    depende_calendario: false, ...extra,
  });
}

async function bloco(tarefa_id: string, data: string) {
  (await getDataSource()).criar("rotinas_planejadas", {
    id: `b-${tarefa_id}-${data}`, data, funcionario_id: "fa", sede_id: SEDE, tarefa_id, local_id: "christus_l1",
    inicio_planejado: "16:00", fim_planejado: "16:30", tempo_previsto_min: 30, tempo_visual_min: 30, blocos_ocupados: 1,
    status: "planejada", observacao: "", supervisor_id: "", criado_em: "", atualizado_em: "",
  });
}

describe("Central do dia: sede no link e cobertura do cadastro", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(QUARTA));
    reiniciarBanco();
    const d = await getDataSource();
    const sede = await d.obter("sedes", "christus_dt");
    await d.criar("sedes", { ...sede!, id: SEDE, nome_sede: "Sede Teste" });
    const pessoa = await d.obter("funcionarios", "christus_f1");
    await d.criar("funcionarios", {
      ...pessoa!, id: "fa", nome: "Pessoa A", sede_id: SEDE, entrada: "07:00", saida: "17:00", escala: "seg_sab", desligado_em: "",
    });
    await tarefa("tNaAgenda");
    await bloco("tNaAgenda", "2026-11-04");
  });

  describe("sede no link", () => {
    it("toda ação que abre Rotina ou Acompanhamento leva a sede vista", async () => {
      expect((await getCentralDia(COORD, SEDE)).proxima.href).toBe(`/rotinas?sede=${SEDE}`);
      const d = await getDataSource();
      await d.atualizar("rotinas_planejadas", "b-tNaAgenda-2026-11-04", { inicio_planejado: "07:00", fim_planejado: "07:30" });
      const c = await getCentralDia(COORD, SEDE);
      expect(c.proxima).toMatchObject({ id: "realizado-pendente", href: `/acompanhamento?sede=${SEDE}` });
    });

    it("dia não montado também leva a sede: é o caso que geraria na sede errada", async () => {
      const d = await getDataSource();
      await d.excluir("rotinas_planejadas", "b-tNaAgenda-2026-11-04");
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "sem-rota-padrao", href: `/rotinas?sede=${SEDE}` });
      await d.criar("modelos_rotina", {
        id: "rota-fa", nome_modelo: "Rota padrão", sede_id: SEDE, funcionario_id: "fa", tarefa_id: "tNaAgenda", local_id: "christus_l1",
        inicio_planejado: "07:00", duracao_min: 30, padrao: true, criado_em: "", atualizado_em: "",
      } as never);
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "dia-nao-montado", href: `/rotinas?sede=${SEDE}` });
    });

    it("falta para cobrir e feriado com bloco também levam a sede", async () => {
      const d = await getDataSource();
      await d.criar("ausencias", {
        id: "aus", funcionario_id: "fa", sede_id: SEDE, tipo: "falta", data_inicio: "2026-11-04", data_fim: "2026-11-04", observacao: "",
        criado_em: "", atualizado_em: "",
      } as never);
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "agenda-indisponivel", href: `/rotinas?sede=${SEDE}` });
      await d.criar("feriados", {
        id: "fer", sede_id: SEDE, nome: "Feriado Teste", data_inicio: "2026-11-04", data_fim: "2026-11-04", ativo: true,
        criado_por: "", criado_em: "", atualizado_por: "", atualizado_em: "",
      } as never);
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "sede-fechada", href: `/rotinas?sede=${SEDE}` });
    });

    it("sede fora do escopo pedida na Central não entra no link", async () => {
      const href = (await getCentralDia(COORD, "christus_ald")).proxima.href;
      expect(href).not.toContain("christus_ald");
      expect(href).toContain(SEDE);
    });

    it("a tela usa a do link só se ela estiver na lista da pessoa", () => {
      const sedes = [
        { id: "a", ativo: true },
        { id: "b", ativo: true },
        { id: "c", ativo: false },
      ];
      expect(sedeDaTela(sedes, "", "b")).toBe("b");
      expect(sedeDaTela(sedes, "", null)).toBe("a");
      expect(sedeDaTela(sedes, "", "de-fora")).toBe("a");
      expect(sedeDaTela(sedes, "", "c")).toBe("a");
      expect(sedeDaTela(sedes, "a", "b")).toBe("a"); // a escolha na própria tela vence
      expect(sedeDaTela(undefined, "", "b")).toBe(""); // sem a lista, não busca nada
    });
  });

  describe("cobertura do cadastro", () => {
    it("com tudo na agenda: 'O dia está em ordem'", async () => {
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "dia-em-ordem", titulo: "O dia está em ordem" });
    });

    it("crítica fora da agenda vira decisão; com ela, 'em ordem' não aparece", async () => {
      await tarefa("tCritica", { critica: true });
      const c = await getCentralDia(COORD, SEDE);
      expect(c.proxima).toMatchObject({ id: "criticas-sem-bloco", nivel: "atencao", quantidade: 1, href: `/rotinas?sede=${SEDE}` });
      expect(c.proxima.descricao).toContain("tCritica");
    });

    it("crítica cancelada não conta como coberta", async () => {
      await tarefa("tCritica", { critica: true });
      await bloco("tCritica", "2026-11-04");
      const d = await getDataSource();
      await d.atualizar("rotinas_planejadas", "b-tCritica-2026-11-04", { status: "cancelada" });
      expect((await getCentralDia(COORD, SEDE)).proxima.id).toBe("criticas-sem-bloco");
    });

    it("diária fora da agenda não vira decisão, mas tira o 'em ordem' e diz quantas são", async () => {
      await tarefa("tDiaria1");
      await tarefa("tDiaria2");
      const { proxima, fila } = await getCentralDia(COORD, SEDE);
      expect(proxima).toMatchObject({ id: "dia-em-ordem", nivel: "ok", titulo: "Sem exceções abertas", acao: "Ver na agenda" });
      expect(proxima.descricao).toContain("2 tarefa(s)");
      expect(fila).toEqual([]);
    });

    it("periódica não entra: sem o histórico de 31 dias, toda ela pareceria vencida", async () => {
      await tarefa("tMensal", { frequencia: "mensal", critica: true });
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "dia-em-ordem", titulo: "O dia está em ordem" });
    });

    it("no sábado, com a rota parcial, não acusa falta nem afirma 'em ordem'", async () => {
      vi.setSystemTime(new Date(SABADO));
      await bloco("tNaAgenda", "2026-11-07");
      await tarefa("tCritica", { critica: true });
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "dia-em-ordem", titulo: "Sem exceções abertas" });
    });

    it("no domingo também não confere", async () => {
      vi.setSystemTime(new Date("2026-11-08T13:00:00Z"));
      const d = await getDataSource();
      await d.atualizar("funcionarios", "fa", { escala: "todos" });
      await bloco("tNaAgenda", "2026-11-08");
      await tarefa("tCritica", { critica: true });
      expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "dia-em-ordem", titulo: "Sem exceções abertas" });
    });

    describe("calendário letivo", () => {
      const periodo = async (data_inicio: string, data_fim: string) =>
        (await getDataSource()).criar("periodos_letivos", {
          id: `p-${data_inicio}`, sede_id: SEDE, nome: "Semestre", data_inicio, data_fim, dias_semana: "", ativo: true,
          criado_por: "", criado_em: "", atualizado_por: "", atualizado_em: "",
        } as never);

      it("em período letivo, a crítica letiva cobra", async () => {
        await periodo("2026-08-01", "2026-12-20");
        await tarefa("tLetiva", { critica: true, depende_calendario: true });
        expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "criticas-sem-bloco", quantidade: 1 });
      });

      it("fora do período, nem cobra nem conta", async () => {
        await periodo("2026-01-01", "2026-06-30");
        await tarefa("tLetiva", { critica: true, depende_calendario: true });
        expect((await getCentralDia(COORD, SEDE)).proxima).toMatchObject({ id: "dia-em-ordem", titulo: "O dia está em ordem" });
      });

      it("sede sem calendário: não vira decisão, porque alocar não resolveria, mas tira o 'em ordem'", async () => {
        await tarefa("tLetiva", { critica: true, depende_calendario: true });
        const { proxima } = await getCentralDia(COORD, SEDE);
        expect(proxima).toMatchObject({ id: "dia-em-ordem", titulo: "Sem exceções abertas" });
        expect(proxima.descricao).toContain("1 tarefa(s)");
      });
    });

    it("tarefa semanal conta só no dia dela, e inativa não conta", async () => {
      await tarefa("tDeQuarta", { frequencia: "semanal", dias_semana: "3" });
      await tarefa("tDeSegunda", { frequencia: "semanal", dias_semana: "1" });
      await tarefa("tInativa", { critica: true, ativo: false });
      const { proxima } = await getCentralDia(COORD, SEDE);
      expect(proxima).toMatchObject({ id: "dia-em-ordem", titulo: "Sem exceções abertas" });
      expect(proxima.descricao).toContain("1 tarefa(s)");
    });

    it("quem não planeja não recebe a pendência nem o 'em ordem' sem conferir", async () => {
      await tarefa("tCritica", { critica: true });
      const c = await getCentralDia({ ...COORD, perfil: "supervisor" }, SEDE);
      expect(c.proxima).toMatchObject({ id: "dia-em-ordem", titulo: "Sem exceções abertas" });
      expect(JSON.stringify(c)).not.toContain("tCritica");
    });

    it("dia não montado continua sendo a decisão, sem acusar o cadastro inteiro", async () => {
      await tarefa("tCritica", { critica: true });
      const d = await getDataSource();
      await d.excluir("rotinas_planejadas", "b-tNaAgenda-2026-11-04");
      expect((await getCentralDia(COORD, SEDE)).proxima.id).not.toBe("criticas-sem-bloco");
    });
  });

  describe("a frase depois de confirmar", () => {
    const base = {
      tipo: "redistribuir_rotina", rotina_id: "r", sede_id: SEDE, funcionario_id: "fb", funcionario_nome: "Pessoa B",
      funcionario_origem_nome: "Pessoa A", tarefa_nome: "Sala", inicio_planejado: "15:30", fim_planejado: "16:00",
    } as const;
    const cedida = (tarefa_nome: string) => ({ rotina_id: "x", tarefa_nome, prioridade: "baixa", inicio_planejado: "15:30", fim_planejado: "16:00" });

    it("diz quem assumiu o quê, quando e no lugar de quem", () => {
      expect(fraseDoFeito(base)).toBe("Pessoa B assumiu “Sala”, das 15:30 às 16:00, no lugar de Pessoa A.");
    });
    it("avisa quando o horário mudou", () => {
      expect(fraseDoFeito({ ...base, inicio_original: "15:00" })).toContain("das 15:30 às 16:00 (era às 15:00), no lugar");
    });
    it("uma cedida no singular, várias no plural", () => {
      expect(fraseDoFeito({ ...base, cedidas: [cedida("Escada")] })).toContain("“Escada” foi registrada como remanejada.");
      expect(fraseDoFeito({ ...base, cedidas: [cedida("Escada"), cedida("Corredor")] })).toContain(
        "“Escada”, “Corredor” foram registradas como remanejadas.",
      );
    });
  });
});
