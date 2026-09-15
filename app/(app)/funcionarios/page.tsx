"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { hhmmParaMin, hojeISO } from "@/lib/dateUtils";
import {
  csvDoTrio,
  resumoIntervalos,
  rotularIntervalos,
  totalIntervaloMin,
} from "@/lib/intervalos";
import { cargaSemanalMin, jornadaLiquidaMin } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { formatarDuracao } from "@/lib/dateUtils";
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
  // Lista sem filtro de sede: as candidatas a ser substituídas são escolhidas
  // pela sede do FORMULÁRIO, que pode não ser a que está aberta na tabela.
  const { data: equipe } = useSWR<Funcionario[]>("/api/funcionarios", fetcher);
  const nomeSede = (id: string) =>
    sedes?.find((s) => s.id === id)?.nome_sede ?? id;

  /** Quem já está na sede escolhida e pode ter o posto assumido. */
  const candidatos = (form: Record<string, unknown>) =>
    (equipe ?? [])
      .filter((f) => f.sede_id === form.sede_id && f.ativo !== false)
      .map((f) => ({ valor: f.id, rotulo: `${f.nome} (${f.entrada}–${f.saida})` }));

  return (
    <CrudManager<Funcionario>
      titulo="Funcionários"
      subtitulo="Equipe ASG/serviços gerais. A jornada líquida é calculada automaticamente."
      endpoint="/api/funcionarios"
      porSede
      textoNovo="+ Novo funcionário"
      vazio="Adicione a equipe (ASGs): horário, sede e escala. Depois é só montar a rotina arrastando tarefas."
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
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
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
          render: (f) => (
            <span className={`selo ${f.ativo ? "selo-verde" : "selo-cinza"}`}>
              {f.ativo ? "Ativo" : "Inativo"}
            </span>
          ),
        },
      ]}
    />
  );
}
