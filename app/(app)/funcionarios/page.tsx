"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { jornadaLiquidaMin } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { formatarDuracao } from "@/lib/dateUtils";
import type { Funcionario, Sede } from "@/types";

const TURNOS = [
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
  { valor: "integral", rotulo: "Integral" },
];

export default function PaginaFuncionarios() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const nomeSede = (id: string) =>
    sedes?.find((s) => s.id === id)?.nome_sede ?? id;

  return (
    <CrudManager<Funcionario>
      titulo="Funcionários"
      subtitulo="Equipe ASG/serviços gerais. A jornada líquida é calculada automaticamente."
      endpoint="/api/funcionarios"
      textoNovo="+ Novo funcionário"
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
          key: "intervalo_inicio",
          rotulo: "Início do intervalo",
          tipo: "hora",
          padrao: "12:00",
          dica: "Quando começa o almoço/descanso. Esse período fica bloqueado na agenda (hachurado) e não aceita tarefas.",
        },
        {
          key: "intervalo_fim",
          rotulo: "Fim do intervalo",
          tipo: "hora",
          padrao: "13:00",
          dica: "Quando o almoço/descanso termina e o funcionário volta a poder receber tarefas.",
        },
        {
          key: "intervalo_min",
          rotulo: "Intervalo (min)",
          tipo: "numero",
          padrao: 60,
          ajuda: "Descontado da jornada líquida",
          dica: "Duração do intervalo em minutos. É descontado da jornada para chegar na JORNADA LÍQUIDA = (saída − entrada) − intervalo. Ex.: 07:00 às 16:00 com 60 min de almoço = 8 h líquidas, que é a base do cálculo de ocupação e ociosidade.",
        },
        { key: "cargo", rotulo: "Cargo/Função", tipo: "texto", padrao: "ASG" },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
        { key: "observacoes", rotulo: "Observações", tipo: "textarea", inteira: true },
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
            </span>
          ),
        },
        {
          key: "intervalo_inicio",
          rotulo: "Intervalo",
          render: (f) => (
            <span className="num">
              {f.intervalo_inicio}–{f.intervalo_fim}
            </span>
          ),
        },
        {
          key: "id",
          rotulo: "Jornada líquida",
          render: (f) => <strong className="num">{formatarDuracao(jornadaLiquidaMin(f))}</strong>,
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
