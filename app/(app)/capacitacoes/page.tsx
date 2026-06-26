"use client";

/**
 * Painel de capacitações: cobertura de treinamento/aptidão por sede + alertas de
 * validade (vencidas / vencendo). É o "sistema de controle de treinamentos + KPIs"
 * pedido no diagnóstico de capacitação dos ASGs. Só leitura — agrega o catálogo
 * de `requisitos` (tipo treinamento/aptidão) e as `qualificacoes_funcionario`.
 * EPI não entra (não é capacitação "possuída").
 */
import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import Carregando from "@/components/Carregando";
import { CartaoKpi, ListaBarras, type ItemBarra } from "@/components/DashboardCards";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR, hojeISO, somarDias } from "@/lib/dateUtils";
import type { Funcionario, QualificacaoFuncionario, Requisito, Sede } from "@/types";

function corCobertura(pct: number): string {
  return pct >= 85 ? "var(--verde)" : pct >= 50 ? "var(--amarelo)" : "var(--vermelho)";
}

export default function PaginaCapacitacoes() {
  const { data: funcionarios } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: requisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);
  const { data: qualificacoes } = useSWR<QualificacaoFuncionario[]>("/api/qualificacoes", fetcher);

  const hoje = hojeISO();
  const limite30 = somarDias(hoje, 30);

  const d = useMemo(() => {
    if (!funcionarios || !sedes || !requisitos || !qualificacoes) return null;
    const reqPorId = new Map(requisitos.map((r) => [r.id, r]));
    const ehCapacitacao = (id: string) => {
      const r = reqPorId.get(id);
      return !!r && (r.tipo === "treinamento" || r.tipo === "aptidao");
    };
    const ativos = funcionarios.filter((f) => f.ativo);
    const sedeNome = new Map(sedes.map((s) => [s.id, s.nome_sede]));

    // capacitações (treino/aptidão) por funcionário, com situação de validade
    type Item = { req: Requisito; validade: string; vencida: boolean; vencendo: boolean };
    const porFunc = new Map<string, Item[]>();
    for (const q of qualificacoes) {
      if (!ehCapacitacao(q.requisito_id)) continue;
      const req = reqPorId.get(q.requisito_id)!;
      const vencida = !!q.validade && q.validade < hoje;
      const vencendo = !!q.validade && q.validade >= hoje && q.validade <= limite30;
      const arr = porFunc.get(q.funcionario_id) ?? porFunc.set(q.funcionario_id, []).get(q.funcionario_id)!;
      arr.push({ req, validade: q.validade, vencida, vencendo });
    }
    const capacitado = (fid: string) => (porFunc.get(fid) ?? []).some((x) => !x.vencida);

    // alertas (vencidas + vencendo) com nome do funcionário e sede
    const alertas = ativos
      .flatMap((f) =>
        (porFunc.get(f.id) ?? [])
          .filter((x) => x.vencida || x.vencendo)
          .map((x) => ({ func: f.nome, sede: sedeNome.get(f.sede_id) ?? f.sede_id, req: x.req.nome, validade: x.validade, vencida: x.vencida })),
      )
      .sort((a, b) => (a.validade || "").localeCompare(b.validade || ""));

    // cobertura por sede
    const grp = new Map<string, Funcionario[]>();
    for (const f of ativos) (grp.get(f.sede_id) ?? grp.set(f.sede_id, []).get(f.sede_id)!).push(f);
    const porSede = [...grp.entries()]
      .map(([sid, fs]) => {
        const cap = fs.filter((f) => capacitado(f.id)).length;
        return { sede: sedeNome.get(sid) ?? sid, total: fs.length, cap, pct: Math.round((cap / fs.length) * 100) };
      })
      .sort((a, b) => a.pct - b.pct);

    const totalCap = ativos.filter((f) => capacitado(f.id)).length;
    const temCatalogo = requisitos.some((r) => r.tipo === "treinamento" || r.tipo === "aptidao");
    return {
      ativos: ativos.length,
      totalCap,
      semCap: ativos.length - totalCap,
      nVencidas: alertas.filter((a) => a.vencida).length,
      nVencendo: alertas.filter((a) => !a.vencida).length,
      alertas,
      porSede,
      temCatalogo,
      semDados: porFunc.size === 0,
    };
  }, [funcionarios, sedes, requisitos, qualificacoes, hoje, limite30]);

  if (!d) return <div className="painel"><Carregando texto="Carregando capacitações…" style={{ padding: 64 }} /></div>;

  const pct = d.ativos ? Math.round((d.totalCap / d.ativos) * 100) : 0;
  const barras: ItemBarra[] = d.porSede.map((s) => ({
    rotulo: s.sede,
    valor: s.pct,
    texto: `${s.cap}/${s.total} · ${s.pct}%`,
    cor: corCobertura(s.pct),
  }));

  return (
    <div className="entra" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Capacitações</h1>
      <p style={{ color: "var(--tinta-2)", marginTop: 2, marginBottom: 18 }}>
        Cobertura de treinamento/aptidão das equipes e validade das capacitações — base para o
        Programa Permanente de Capacitação. Cadastre os cursos em{" "}
        <Link href="/requisitos" style={{ color: "var(--acento)" }}>Requisitos</Link> e atribua às
        pessoas em <Link href="/qualificacoes" style={{ color: "var(--acento)" }}>Qualificações</Link>.
      </p>

      {d.semDados && (
        <div className="alerta alerta-aviso" style={{ marginBottom: 18 }}>
          Ainda não há capacitações registradas{ d.temCatalogo ? "" : " (nem cursos no catálogo)" }.
          Comece cadastrando os treinamentos em <strong>Requisitos</strong> (tipo “treinamento”) e
          vinculando aos funcionários em <strong>Qualificações</strong> (com a validade) — depois os
          números aparecem aqui.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        <CartaoKpi rotulo="Funcionários ativos" valor={String(d.ativos)} />
        <CartaoKpi rotulo="Capacitados" valor={`${d.totalCap} · ${pct}%`} cor={corCobertura(pct)} detalhe="com ≥ 1 capacitação vigente" />
        <CartaoKpi rotulo="Sem capacitação" valor={String(d.semCap)} cor={d.semCap > 0 ? "var(--vermelho)" : "var(--verde)"} />
        <CartaoKpi rotulo="Vencendo (30 dias)" valor={String(d.nVencendo)} cor={d.nVencendo > 0 ? "var(--amarelo)" : "var(--tinta)"} />
        <CartaoKpi rotulo="Vencidas" valor={String(d.nVencidas)} cor={d.nVencidas > 0 ? "var(--vermelho)" : "var(--tinta)"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <ListaBarras titulo="Cobertura por sede" itens={barras} vazio="Sem funcionários ativos." />

        <div className="painel">
          <div className="painel-cabecalho" style={{ padding: "10px 14px" }}>
            <span className="rotulo">Validade — vencidas e vencendo (30 dias)</span>
          </div>
          <div style={{ padding: 14 }}>
            {d.alertas.length === 0 ? (
              <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>Nada vencido ou a vencer nos próximos 30 dias. 👍</span>
            ) : (
              <table className="tabela" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Capacitação</th>
                    <th style={{ width: 110 }}>Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {d.alertas.slice(0, 30).map((a, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>
                        {a.func}
                        <div style={{ fontSize: 10, color: "var(--tinta-3)" }}>{a.sede}</div>
                      </td>
                      <td>{a.req}</td>
                      <td className="num">
                        <span className={`selo ${a.vencida ? "selo-vermelho" : "selo-amarelo"}`}>
                          {a.vencida ? "vencida" : "vence"} {formatarDataBR(a.validade)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
