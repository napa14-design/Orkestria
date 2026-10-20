/**
 * Supervisor (perfil de chão, 19/10/2026) PELAS ROTAS — não só pelas funções de
 * permissão. "O bug mora na composição": `podeRegistrarRealizado` true não prova
 * que a rota deixa marcar, nem que barra cancelar.
 *
 * A sessão é simulada (mock de `obterSessao`); o resto é o caminho real:
 * rota → serviço → banco de memória.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoUsuario } from "@/lib/permissions";
import { getDataSource } from "@/lib/datasource";
import { hojeISO, somarDias } from "@/lib/dateUtils";
import { reiniciarBanco } from "@/lib/memoryStore";
import { hashSenha } from "@/lib/senha";
import type { RotinaPlanejada } from "@/types";

let sessao: SessaoUsuario | null = null;
let sessoesGravadas = 0;
vi.mock("@/lib/session", () => ({
  obterSessao: async () => sessao,
  gravarSessao: async () => void sessoesGravadas++,
}));

const { POST: postExecucao, GET: getExecucoes } = await import("@/app/api/execucoes/route");
const { POST: postConforme } = await import("@/app/api/execucoes/conforme/route");
const { PUT: putRotina } = await import("@/app/api/rotinas/[id]/route");
const { POST: postAusencia, GET: getAusencias } = await import("@/app/api/ausencias/route");
const { POST: postParametro } = await import("@/app/api/parametros/route");
const { GET: getFuncionarios } = await import("@/app/api/funcionarios/route");
const { GET: getHistorico } = await import("@/app/api/historico/route");
const { GET: getFichaPdf } = await import("@/app/api/fichas/pdf/route");
const { POST: postLogin } = await import("@/app/api/auth/login/route");

const SUP: SessaoUsuario = { id: "s1", nome: "Sup", email: "sup@x.com", perfil: "supervisor", sede_id: "christus_dt", sedes: ["christus_dt"] };

const json = (corpo: unknown) =>
  new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Bloco já terminado (dia útil passado), na sede pedida. */
async function bloco(sede_id = "christus_dt", data = somarDias(hojeISO(), -7)): Promise<RotinaPlanejada> {
  const ds = await getDataSource();
  const r: RotinaPlanejada = {
    id: `r-${Math.random()}`, data, funcionario_id: "christus_f1", sede_id, tarefa_id: "christus_t2",
    local_id: "christus_l1", inicio_planejado: "08:00", fim_planejado: "08:20", tempo_previsto_min: 20,
    tempo_visual_min: 30, blocos_ocupados: 1, status: "planejada", observacao: "", supervisor_id: "u1",
    criado_em: "", atualizado_em: "",
  };
  await ds.criar("rotinas_planejadas", r);
  return r;
}
/** Funcionário inventado, com motivo de desligamento e observação sensíveis. */
async function pessoaFicticia(): Promise<string> {
  const ds = await getDataSource();
  const base = await ds.obter("funcionarios", "christus_f1");
  await ds.criar("funcionarios", {
    ...base!, id: "f-ficticia", nome: "Pessoa Fictícia", motivo_desligamento: "Demissão por justa causa", observacoes: "segredo",
  });
  return "f-ficticia";
}
const execucao = (r: RotinaPlanejada, extra: Record<string, unknown> = {}) => ({
  rotina_id: r.id, data_execucao: r.data, status_realizado: "conforme_planejado", inicio_real: "08:00",
  fim_real: "08:20", tempo_real_min: 20, justificativa: "", observacao: "", epis_confirmados: "", ...extra,
});

describe("supervisor pelas rotas", () => {
  beforeEach(() => {
    reiniciarBanco();
    sessao = SUP;
  });

  it("marca feita e não feita na sede dele", async () => {
    const a = await bloco(), b = await bloco();
    expect((await postExecucao(json(execucao(a)))).status).toBe(201);
    expect((await postExecucao(json(execucao(b, { status_realizado: "nao_realizada", justificativa: "faltou material" })))).status).toBe(201);
    const ds = await getDataSource();
    expect((await ds.obter("rotinas_planejadas", b.id))?.status).toBe("nao_realizada");
  });

  it("NÃO cancela nem remaneja — a tarefa sumiria da medição", async () => {
    const r = await bloco();
    for (const status_realizado of ["cancelada", "remanejada"]) {
      const res = await postExecucao(json(execucao(r, { status_realizado, justificativa: "x" })));
      expect(res.status, status_realizado).toBe(403);
    }
    expect((await (await getDataSource()).obter("rotinas_planejadas", r.id))?.status).toBe("planejada");
  });

  it("não registra em outra sede", async () => {
    const r = await bloco("christus_ald");
    expect((await postExecucao(json(execucao(r)))).status).toBe(403);
  });

  it("a data do realizado é a da rotina, não a do corpo", async () => {
    const r = await bloco();
    await postExecucao(json(execucao(r, { data_execucao: "2020-01-01" })));
    const ds = await getDataSource();
    const regs = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: r.id }]);
    expect(regs.map((e) => e.data_execucao)).toEqual([r.data]);
  });

  it("não desfaz o que o coordenador cancelou ou remanejou", async () => {
    const r = await bloco();
    sessao = { ...SUP, perfil: "coordenador" };
    expect((await postExecucao(json(execucao(r, { status_realizado: "cancelada", justificativa: "evento" })))).status).toBe(201);
    sessao = SUP;
    expect((await postExecucao(json(execucao(r)))).status).toBe(403);
    expect((await (await getDataSource()).obter("rotinas_planejadas", r.id))?.status).toBe("cancelada");
  });

  it("nem pelo ✓ Conforme — as duas rotas do realizado têm a mesma regra", async () => {
    for (const status_realizado of ["cancelada", "remanejada"]) {
      const r = await bloco();
      sessao = { ...SUP, perfil: "coordenador" };
      await postExecucao(json(execucao(r, { status_realizado, justificativa: "evento" })));
      sessao = SUP;
      expect((await postConforme(json({ rotina_id: r.id }))).status, status_realizado).toBe(403);
      expect((await (await getDataSource()).obter("rotinas_planejadas", r.id))?.status).toBe(status_realizado);
    }
  });

  it("nem quando o coordenador cancelou direto na rotina, sem registro de execução", async () => {
    const r = await bloco();
    sessao = { ...SUP, perfil: "coordenador" };
    const put = await putRotina(new Request("http://x", { method: "PUT", body: JSON.stringify({ status: "cancelada" }) }), ctx(r.id));
    expect(put.status).toBe(200);
    sessao = SUP;
    expect((await postExecucao(json(execucao(r)))).status).toBe(403);
    expect((await postConforme(json({ rotina_id: r.id }))).status).toBe(403);
    expect((await (await getDataSource()).obter("rotinas_planejadas", r.id))?.status).toBe("cancelada");
  });

  it("não sobrescreve o que o coordenador lançou, mas corrige o que ele mesmo lançou", async () => {
    const a = await bloco(), b = await bloco();
    sessao = { ...SUP, id: "coord", perfil: "coordenador" };
    await postExecucao(json(execucao(a, { status_realizado: "nao_realizada", justificativa: "funcionária ausente" })));
    sessao = SUP;
    expect((await postExecucao(json(execucao(a)))).status).toBe(403);
    expect((await (await getDataSource()).obter("rotinas_planejadas", a.id))?.status).toBe("nao_realizada");

    await postExecucao(json(execucao(b, { status_realizado: "nao_realizada", justificativa: "faltou material" })));
    expect((await postExecucao(json(execucao(b)))).status).toBe(201);
    expect((await (await getDataSource()).obter("rotinas_planejadas", b.id))?.status).toBe("realizada");
  });

  it("'✓ Feita' em tarefa com EPI: o toque é a declaração, e os nomes vêm do cadastro", async () => {
    const ds = await getDataSource();
    const comEpi = { ...(await bloco()), id: `r-epi-${Math.random()}`, tarefa_id: "christus_t1" };
    await ds.criar("rotinas_planejadas", comEpi);
    // Sem declarar, o atalho continua não afirmando uso de EPI.
    expect((await postConforme(json({ rotina_id: comEpi.id }))).status).toBe(422);
    // Declarando: grava os EPIs da tarefa — mesmo que o corpo tente mandar outra lista.
    const res = await postConforme(json({ rotina_id: comEpi.id, declaro_epi: true, epis_confirmados: "Qualquer coisa" }));
    expect(res.status).toBe(201);
    const [exec] = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: comEpi.id }]);
    const esperados = (await ds.obter("tarefas", "christus_t1"))!.requisitos!.split(",")
      .map((id) => id.trim()).filter(Boolean);
    const nomes = (await Promise.all(esperados.map((id) => ds.obter("requisitos", id))))
      .filter((r) => r?.tipo === "epi").map((r) => r!.nome);
    expect(exec.epis_confirmados).toBe(nomes.join(", "));
    expect(exec.epis_confirmados).not.toContain("Qualquer coisa");
    expect((await ds.obter("rotinas_planejadas", comEpi.id))?.status).toBe("realizada");
  });

  it("corrigir 'não feita' para 'feita' declara todos os EPIs da tarefa, no mesmo registro", async () => {
    const ds = await getDataSource();
    // christus_t4: tarefa de banheiro com 3 requisitos.
    const r = { ...(await bloco()), id: `r-cor-${Math.random()}`, tarefa_id: "christus_t4" };
    await ds.criar("rotinas_planejadas", r);
    await postExecucao(json(execucao(r, { status_realizado: "nao_realizada", justificativa: "faltou material" })));
    expect((await postConforme(json({ rotina_id: r.id, declaro_epi: true }))).status).toBe(201);
    const execs = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: r.id }]);
    expect(execs.length).toBe(1);
    expect(execs[0].status_realizado).toBe("conforme_planejado");
    expect(execs[0].justificativa).toBe("");
    expect(execs[0].epis_confirmados.split(", ").length).toBeGreaterThanOrEqual(2);
  });

  it("'✓ Feita' com EPI não abre a sede alheia", async () => {
    const r = await bloco("christus_ald");
    expect((await postConforme(json({ rotina_id: r.id, declaro_epi: true }))).status).toBe(403);
  });

  it("não imprime ficha", async () => {
    await bloco();
    const url = `http://x/api/fichas/pdf?data=${somarDias(hojeISO(), -7)}&sede=christus_dt`;
    expect((await getFichaPdf(new Request(url))).status).toBe(403);
  });

  it("não marca como feito o que ainda não aconteceu", async () => {
    const r = await bloco("christus_dt", somarDias(hojeISO(), 7));
    expect((await postConforme(json({ rotina_id: r.id }))).status).toBe(422);
    expect((await postExecucao(json(execucao(r)))).status).toBe(422);
    // Nele a trava vale para tudo: "não realizada" de amanhã também é sem lastro.
    expect((await postExecucao(json(execucao(r, { status_realizado: "nao_realizada", justificativa: "x" })))).status).toBe(422);
  });

  it("a trava do horário é só para 'feita': o coordenador ainda cancela com antecedência", async () => {
    const amanha = somarDias(hojeISO(), 1);
    sessao = { ...SUP, perfil: "coordenador" };
    const a = await bloco("christus_dt", amanha), b = await bloco("christus_dt", amanha);
    expect((await postExecucao(json(execucao(a)))).status).toBe(422);
    expect((await postExecucao(json(execucao(b, { status_realizado: "cancelada", justificativa: "evento" })))).status).toBe(201);
  });

  it("não escreve no planejado, nas ausências nem nos parâmetros", async () => {
    const r = await bloco();
    expect((await putRotina(new Request("http://x", { method: "PUT", body: JSON.stringify({ inicio_planejado: "09:00" }) }), ctx(r.id))).status).toBe(403);
    expect((await postAusencia(json({ funcionario_id: "christus_f1", data_inicio: hojeISO(), data_fim: hojeISO(), tipo: "falta" }))).status).toBe(403);
    expect((await postParametro(json({ chave: "bloco_agenda_min", valor: "15", sede_id: "christus_dt", editavel_por_supervisor: true }))).status).toBe(403);
  });

  it("recebe só o necessário: sem motivo de desligamento, observação nem tipo de ausência", async () => {
    // Pessoa FICTÍCIA: os ids do seed são de gente real, e o repo é público —
    // não se junta nome de verdade com justa causa ou atestado, nem em teste.
    const ficticia = await pessoaFicticia();
    const funcs = (await (await getFuncionarios(new Request("http://x/api/funcionarios"))).json()) as Record<string, string>[];
    const f = funcs.find((x) => x.id === ficticia)!;
    expect(f.motivo_desligamento).toBe("");
    expect(f.observacoes).toBe("");

    sessao = { ...SUP, perfil: "coordenador" };
    await postAusencia(json({ funcionario_id: ficticia, data_inicio: hojeISO(), data_fim: hojeISO(), tipo: "atestado", observacao: "CID" }));
    sessao = SUP;
    const aus = (await (await getAusencias(new Request(`http://x/api/ausencias?data=${hojeISO()}`))).json()) as Record<string, string>[];
    expect(aus.length).toBeGreaterThan(0);
    expect(aus.every((a) => a.tipo === "outro" && a.observacao === "")).toBe(true);
  });

  it("no realizado, vê a própria justificativa e não a do coordenador", async () => {
    const a = await bloco(), b = await bloco();
    sessao = { ...SUP, id: "coord", perfil: "coordenador" };
    await postExecucao(json(execucao(a, { status_realizado: "nao_realizada", justificativa: "atestado" })));
    sessao = SUP;
    await postExecucao(json(execucao(b, { status_realizado: "nao_realizada", justificativa: "faltou material" })));
    const url = `http://x/api/execucoes?de=${a.data}&ate=${a.data}&sede=christus_dt`;
    const lista = (await (await getExecucoes(new Request(url))).json()) as Record<string, string>[];
    expect(lista.find((e) => e.rotina_id === a.id)?.justificativa).toBe("");
    expect(lista.find((e) => e.rotina_id === b.id)?.justificativa).toBe("faltou material");
  });
});

describe("perfil desconhecido falha fechando", () => {
  beforeEach(() => reiniciarBanco());

  it("não vê o histórico global", async () => {
    sessao = { ...SUP, perfil: "chefao" as never, sede_id: "christus_dt" };
    expect((await getHistorico(new Request("http://x/api/historico"))).status).toBe(403);
  });

  it("recebe o dado pessoal mascarado e não imprime ficha", async () => {
    const ficticia = await pessoaFicticia();
    sessao = { ...SUP, perfil: "chefao" as never };
    const funcs = (await (await getFuncionarios(new Request("http://x/api/funcionarios"))).json()) as Record<string, string>[];
    expect(funcs.find((x) => x.id === ficticia)?.motivo_desligamento).toBe("");
    const url = `http://x/api/fichas/pdf?data=${hojeISO()}&sede=christus_dt`;
    expect((await getFichaPdf(new Request(url))).status).toBe(403);
  });

  it("o login não cria sessão para perfil fora da lista", async () => {
    const ds = await getDataSource();
    const base = { nome: "X", sede_id: "christus_dt", sedes_extra: "", ativo: true, senha_hash: hashSenha("senha-forte-123"), criado_em: "", atualizado_em: "" };
    await ds.criar("usuarios", { ...base, id: "u-estranho", email: "estranho@x.com", perfil: "chefao" } as never);
    await ds.criar("usuarios", { ...base, id: "u-normal", email: "normal@x.com", perfil: "supervisor" } as never);
    sessoesGravadas = 0;
    const entrar = (email: string) => postLogin(json({ email, senha: "senha-forte-123" }));
    expect((await entrar("estranho@x.com")).status).toBe(403);
    expect(sessoesGravadas).toBe(0);
    // Controle: a mesma credencial com perfil conhecido entra — o 403 é do perfil.
    expect((await entrar("normal@x.com")).status).toBe(200);
    expect(sessoesGravadas).toBe(1);
  });
});
