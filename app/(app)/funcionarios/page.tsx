"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import CrudManager from "@/components/CrudManager";
import Modal from "@/components/Modal";
import { apiPost, ErroApi } from "@/lib/clientApi";
import { hhmmParaMin, hojeISO } from "@/lib/dateUtils";
import { MOTIVOS_DESLIGAMENTO, motivoAbreVaga } from "@/lib/desligamento";
import {
  csvDoTrio,
  resumoIntervalos,
  rotularIntervalos,
  totalIntervaloMin,
} from "@/lib/intervalos";
import { cargaSemanalMin, jornadaLiquidaMin } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { formatarDuracao } from "@/lib/dateUtils";
import { useDasSedes } from "@/lib/useDasSedes";
import type { Funcionario, Sede } from "@/types";

const TURNOS = [
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
  { valor: "integral", rotulo: "Integral" },
];

const ESCALAS = [
  { valor: "seg_sex", rotulo: "Segunda a sexta" },
  { valor: "seg_sab", rotulo: "Segunda a sábado" },
  { valor: "todos", rotulo: "Todos os dias" },
];

export default function PaginaFuncionarios() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  // Todas as sedes da pessoa: as candidatas a ser substituídas são escolhidas
  // pela sede do FORMULÁRIO, que pode não ser a que está aberta na tabela — e
  // sem `?sede` a API só devolvia a principal do coordenador.
  const { data: equipe } = useDasSedes<Funcionario>("funcionarios");
  const nomeSede = (id: string) =>
    sedes?.find((s) => s.id === id)?.nome_sede ?? id;

  const { mutate } = useSWRConfig();
  const [paraDesligar, setParaDesligar] = useState<Funcionario | null>(null);
  const [desligamento, setDesligamento] = useState({
    data: hojeISO(),
    motivo: "",
    abrirVaga: true,
    extinguirPosto: false,
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  /** O que aconteceu, dito depois de desligar ou de tentar a vaga de novo. */
  const [aviso, setAviso] = useState<{ tipo: "ok" | "aviso"; texto: string } | null>(null);

  const recarregar = () =>
    mutate((k) => typeof k === "string" && (k.startsWith("/api/funcionarios") || k.startsWith("funcionarios-das-sedes")));
  const dataBR = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "");
  const fraseDaVaga = (v: { aberta: boolean; codigo?: string; motivo?: string }) =>
    v.aberta ? `Vaga #${v.codigo} aberta no SGCP.` : `A vaga não foi aberta: ${v.motivo}`;

  const abrirDesligar = (f: Funcionario) => {
    setParaDesligar(f);
    setDesligamento({ data: hojeISO(), motivo: "", abrirVaga: true, extinguirPosto: false });
    setErro("");
  };

  const confirmarDesligamento = async () => {
    if (!paraDesligar) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await apiPost<{
        blocosRemovidos: number;
        itensDeRotaApagados: number;
        vaga: { aberta: boolean; codigo?: string; motivo?: string };
      }>(`/api/funcionarios/${paraDesligar.id}/desligar`, {
        ...desligamento,
        // Só vale sem vaga: com vaga aberta, o posto continua por definição.
        extinguirPosto: !desligamento.abrirVaga && desligamento.extinguirPosto,
      });
      setAviso({
        tipo: r.vaga.aberta ? "ok" : "aviso",
        texto:
          `${paraDesligar.nome} desligado(a) a partir de ${dataBR(desligamento.data)}` +
          (r.blocosRemovidos ? ` · ${r.blocosRemovidos} bloco(s) planejado(s) saíram da agenda` : "") +
          (r.itensDeRotaApagados ? ` · posto extinto: ${r.itensDeRotaApagados} item(ns) da rota apagado(s)` : "") +
          `. ${fraseDaVaga(r.vaga)}`,
      });
      setParaDesligar(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível desligar.");
    } finally {
      setEnviando(false);
    }
  };

  const tentarVaga = async (f: Funcionario) => {
    try {
      const v = await apiPost<{ aberta: boolean; codigo?: string; motivo?: string }>(
        `/api/funcionarios/${f.id}/vaga`,
        {},
      );
      setAviso({ tipo: v.aberta ? "ok" : "aviso", texto: `${f.nome}: ${fraseDaVaga(v)}` });
      await recarregar();
    } catch (e) {
      setAviso({ tipo: "aviso", texto: e instanceof ErroApi ? e.message : "Não foi possível falar com o SGCP." });
    }
  };

  /**
   * Quem pode ter o posto assumido na sede escolhida: quem está lá hoje e os
   * POSTOS VAGOS — desligados cuja rota ninguém assumiu ainda.
   */
  const candidatos = (form: Record<string, unknown>) =>
    (equipe ?? [])
      .filter(
        (f) =>
          f.sede_id === form.sede_id &&
          !f.substituido_por &&
          !f.posto_extinto &&
          (f.ativo !== false || Boolean(f.desligado_em)),
      )
      .map((f) => ({
        valor: f.id,
        rotulo: f.desligado_em
          ? `${f.nome} — posto vago desde ${dataBR(f.desligado_em)}`
          : `${f.nome} (${f.entrada}–${f.saida})`,
      }));

  return (
    <>
    {aviso && (
      <div
        className={`alerta ${aviso.tipo === "ok" ? "alerta-ok" : "alerta-aviso"}`}
        style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <span>{aviso.texto}</span>
        <button type="button" className="btn btn-mini btn-fantasma" onClick={() => setAviso(null)}>
          ×
        </button>
      </div>
    )}
    <CrudManager<Funcionario>
      titulo="Funcionários"
      subtitulo="Equipe ASG/serviços gerais. A jornada líquida é calculada automaticamente."
      endpoint="/api/funcionarios"
      porSede
      // Cadastrar pode assumir um posto: a lista de candidatas (outra chave SWR,
      // de todas as sedes) precisa refletir isso antes do próximo cadastro.
      aoCriar={() => void recarregar()}
      textoNovo="+ Novo funcionário"
      vazio="Adicione a equipe (ASGs): horário, sede e escala. Depois é só montar a rotina arrastando tarefas."
      // Funcionário não se exclui, se desliga: com data, motivo e vaga no SGCP.
      permissao={{ excluir: false }}
      acoesExtra={(f) =>
        !f.desligado_em ? (
          <button
            className="btn btn-mini btn-fantasma"
            style={{ color: "var(--vermelho)" }}
            onClick={() => abrirDesligar(f)}
          >
            Desligar
          </button>
        ) : !f.vaga_sgcp && !f.posto_extinto && motivoAbreVaga(f.motivo_desligamento ?? "") ? (
          <button
            className="btn btn-mini btn-fantasma"
            title="A vaga de substituição ainda não foi aberta no SGCP."
            onClick={() => void tentarVaga(f)}
          >
            Abrir vaga
          </button>
        ) : null
      }
      campos={[
        { key: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          opcoes: (sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
        },
        {
          key: "genero",
          rotulo: "Gênero",
          tipo: "select",
          opcoes: [
            { valor: "feminino", rotulo: "Feminino" },
            { valor: "masculino", rotulo: "Masculino" },
            { valor: "outro", rotulo: "Outro" },
          ],
        },
        { key: "turno", rotulo: "Turno", tipo: "select", obrigatorio: true, opcoes: TURNOS },
        {
          key: "entrada",
          rotulo: "Entrada",
          tipo: "hora",
          obrigatorio: true,
          padrao: "07:00",
          dica: "Horário em que o funcionário começa o expediente. Junto com a saída, define a janela em que ele pode receber tarefas na agenda.",
        },
        {
          key: "saida",
          rotulo: "Saída",
          tipo: "hora",
          obrigatorio: true,
          padrao: "16:00",
          dica: "Horário em que o expediente termina. Tarefas não podem ser alocadas depois disso.",
        },
        {
          key: "intervalos",
          rotulo: "Intervalos do dia (almoço e lanches)",
          tipo: "intervalos",
          inteira: true,
          padrao: "12:00-13:00",
          // A conta ao vivo, em vez da regra: é o que mata a dúvida no campo.
          ajuda: (form) =>
            resumoIntervalos(
              String(form.intervalos ?? ""),
              Math.max(0, hhmmParaMin(String(form.saida ?? "")) - hhmmParaMin(String(form.entrada ?? ""))),
            ),
          dica: "Todos os intervalos do dia, no formato HH:mm-HH:mm, separados por ponto e vírgula. Um só: \"12:00-13:00\". Com lanches: \"09:00-09:15;11:30-13:00;15:00-15:15\". É esta lista que a agenda bloqueia (faixa hachurada) e que sai da JORNADA LÍQUIDA = (saída − entrada) − intervalos. Deixe vazio se não há intervalo.",
        },
        {
          key: "escala",
          rotulo: "Escala (dias)",
          tipo: "select",
          padrao: "seg_sex",
          opcoes: ESCALAS,
          dica: "Em quais dias o funcionário trabalha. Nos dias fora da escala a agenda mostra \"Folga\" e bloqueia tarefas. Ex.: jornada de 44h costuma ser \"Segunda a sábado\" (sábado mais curto).",
        },
        {
          key: "entrada_sabado",
          rotulo: "Entrada (sábado)",
          tipo: "hora",
          dica: "Horário de entrada SÓ no sábado, quando é diferente dos outros dias (ex.: turno de 4h). Deixe vazio se o sábado tem o mesmo horário dos demais dias (ou se não trabalha sábado).",
        },
        {
          key: "saida_sabado",
          rotulo: "Saída (sábado)",
          tipo: "hora",
          dica: "Horário de saída SÓ no sábado. Ex.: entrada 07:00 e saída 11:00 = 4 h no sábado. No sábado não é descontado intervalo.",
        },
        { key: "cargo", rotulo: "Cargo/Função", tipo: "texto", padrao: "ASG" },
        {
          key: "matricula",
          rotulo: "Matrícula",
          tipo: "texto",
          dica: "Matrícula do RH. Opcional — é por ela que outros sistemas da Infraestrutura encontram a pessoa, porque nome pode repetir.",
        },
        // Sem checkbox "Ativo": desmarcar era o caminho antigo de saída, sem data,
        // sem motivo e sem vaga. Quem sai, sai pelo "Desligar" (13/10/2026).
        { key: "observacoes", rotulo: "Observações", tipo: "textarea", inteira: true },
        {
          key: "substitui",
          rotulo: "Assume o posto de",
          tipo: "select",
          inteira: true,
          opcoes: candidatos,
          // Só ao cadastrar, e só quando existe alguém na sede para substituir.
          mostrarSe: (f) => f.__novo === true && candidatos(f).length > 0,
          ajuda: "Opcional. A rota padrão de quem sai passa para quem entra.",
          dica:
            "A rota é do posto, não da pessoa. Ao salvar, a rota padrão de quem sai é copiada " +
            "para quem entra, os dias ainda não realizados a partir da data abaixo trocam de " +
            "dono, e quem saiu fica inativo. Os dias anteriores continuam com o nome de quem " +
            "trabalhou neles — o histórico não é reescrito.",
        },
        {
          key: "substitui_desde",
          rotulo: "A partir de",
          tipo: "data",
          padrao: hojeISO(),
          mostrarSe: (f) => Boolean(f.substitui),
          ajuda: "Do dia anterior para trás, a agenda continua com quem saiu.",
        },
      ]}
      colunas={[
        { key: "nome", rotulo: "Nome" },
        { key: "sede_id", rotulo: "Sede", render: (f) => nomeSede(f.sede_id) },
        {
          key: "turno",
          rotulo: "Turno",
          render: (f) => TURNOS.find((t) => t.valor === f.turno)?.rotulo ?? f.turno,
        },
        {
          key: "entrada",
          rotulo: "Jornada",
          render: (f) => (
            <span className="num">
              {f.entrada}–{f.saida}
              {f.entrada_sabado && f.saida_sabado && (
                <span style={{ color: "var(--tinta-3)" }}>
                  {" "}
                  · sáb {f.entrada_sabado}–{f.saida_sabado}
                </span>
              )}
            </span>
          ),
        },
        {
          key: "intervalos",
          rotulo: "Intervalos",
          render: (f) => (
            <span className="num" style={{ fontSize: 11, color: "var(--tinta-2)" }}>
              {rotularIntervalos(csvDoTrio(f))}
              {totalIntervaloMin(csvDoTrio(f)) > 0 && (
                <span style={{ color: "var(--tinta-3)" }}>
                  {" · "}
                  {formatarDuracao(totalIntervaloMin(csvDoTrio(f)))}
                </span>
              )}
            </span>
          ),
        },
        {
          key: "escala",
          rotulo: "Escala",
          render: (f) =>
            ESCALAS.find((e) => e.valor === (f.escala || "seg_sex"))?.rotulo ?? "—",
        },
        {
          key: "id",
          rotulo: "Carga semanal",
          render: (f) => {
            // 44h é o teto semanal da CLT. O sistema já sabia somar e mostrava
            // 46h30 em negrito, sem dizer nada — número que serve para medir
            // não pode ficar mudo (mesma regra da régua de ocupação).
            const min = cargaSemanalMin(f);
            const passa = min > 44 * 60;
            return (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                <strong className="num">{formatarDuracao(min)}</strong>
                {passa && (
                  <span
                    className="selo selo-amarelo"
                    title={`${formatarDuracao(min - 44 * 60)} acima das 44h semanais. Confira a escala e os intervalos — ou registre como hora extra.`}
                  >
                    +{formatarDuracao(min - 44 * 60)}
                  </span>
                )}
              </span>
            );
          },
        },
        {
          key: "ativo",
          rotulo: "Status",
          render: (f) => {
            if (f.desligado_em) {
              const futuro = f.desligado_em > hojeISO();
              const vaga = f.vaga_sgcp ? ` · vaga #${f.vaga_sgcp} no SGCP` : "";
              return (
                <span
                  className={`selo ${futuro ? "selo-amarelo" : "selo-cinza"}`}
                  title={`${f.motivo_desligamento ?? ""}${vaga}`}
                >
                  {futuro ? "Desliga em" : "Desligado em"} {dataBR(f.desligado_em)}
                </span>
              );
            }
            return (
              <span className={`selo ${f.ativo ? "selo-verde" : "selo-cinza"}`}>
                {f.ativo ? "Ativo" : "Inativo"}
              </span>
            );
          },
        },
      ]}
    />

    <Modal
      titulo={`Desligar ${paraDesligar?.nome ?? ""}`}
      aberto={!!paraDesligar}
      aoFechar={() => setParaDesligar(null)}
      larguraMax={460}
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--tinta-2)", marginTop: 0 }}>
        A partir da data, {paraDesligar?.nome} sai da agenda e da geração do dia. Os dias
        já trabalhados continuam no nome de quem trabalhou, e a rota padrão fica guardada
        como posto vago para quem for contratado assumir.
      </p>
      <div className="form-grade">
        <label className="campo">
          <span className="rotulo">Data do desligamento</span>
          <input
            type="date"
            value={desligamento.data}
            onChange={(e) => setDesligamento((d) => ({ ...d, data: e.target.value }))}
          />
        </label>
        <label className="campo">
          <span className="rotulo">Motivo</span>
          <select
            value={desligamento.motivo}
            onChange={(e) => setDesligamento((d) => ({ ...d, motivo: e.target.value }))}
          >
            <option value="">Escolha…</option>
            {MOTIVOS_DESLIGAMENTO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      {desligamento.data > hojeISO() && (
        <p style={{ fontSize: 12.5, color: "var(--tinta-3)", margin: "10px 0 0" }}>
          Data futura (aviso prévio): até lá, a pessoa segue na agenda normalmente.
        </p>
      )}
      {desligamento.motivo === "Abandono de emprego" ? (
        <p style={{ fontSize: 12.5, color: "var(--tinta-3)", margin: "10px 0 0" }}>
          Abandono não abre vaga por aqui: o Chromos já abre sozinho depois de 15 dias de falta.
        </p>
      ) : (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5 }}>
          <input
            type="checkbox"
            checked={desligamento.abrirVaga}
            onChange={(e) => setDesligamento((d) => ({ ...d, abrirVaga: e.target.checked }))}
          />
          Abrir vaga de substituição no SGCP
        </label>
      )}
      {!desligamento.abrirVaga && desligamento.motivo !== "Abandono de emprego" && (
        <fieldset style={{ border: 0, padding: 0, margin: "10px 0 0 22px", display: "grid", gap: 6, fontSize: 13.5 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <input
              type="radio"
              name="posto"
              checked={!desligamento.extinguirPosto}
              onChange={() => setDesligamento((d) => ({ ...d, extinguirPosto: false }))}
            />
            O posto continua — a rota fica guardada para quem for contratado
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <input
              type="radio"
              name="posto"
              checked={desligamento.extinguirPosto}
              onChange={() => setDesligamento((d) => ({ ...d, extinguirPosto: true }))}
            />
            O posto deixa de existir — o quadro diminui e a rota é apagada
          </label>
        </fieldset>
      )}
      {erro && (
        <div className="alerta alerta-erro" style={{ marginTop: 12 }}>
          {erro}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => setParaDesligar(null)}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primario"
          onClick={() => void confirmarDesligamento()}
          disabled={enviando || !desligamento.data || !desligamento.motivo}
        >
          {enviando ? "Desligando…" : "Desligar"}
        </button>
      </div>
    </Modal>
    </>
  );
}
