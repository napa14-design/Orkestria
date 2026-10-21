"use client";

/**
 * Serviços eventuais e imprevistos (Fase C) — o "segundo eixo": trabalho fora
 * da rotina planejada, registrado a posteriori. Alimenta a calibração da folga
 * (buffer) por sede.
 */
import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { useSessao } from "@/components/SessaoContexto";
import { fetcher } from "@/lib/clientApi";
import { sedesPermitidas } from "@/lib/permissions";
import { formatarDataBR, formatarDuracao } from "@/lib/dateUtils";
import type { Categoria, Funcionario, Local, Sede, ServicoEventual } from "@/types";

const TIPOS = [
  { valor: "eventual", rotulo: "Serviço eventual (trabalho avulso)" },
  { valor: "imprevisto", rotulo: "Imprevisto (consumiu tempo)" },
];

/**
 * Lista de TODAS as sedes que a pessoa opera. Sem `?sede`, a API devolve ao
 * coordenador só a sede principal: quem operava Parquelândia 1 e 2 não achava
 * ninguém da 2 no formulário (relato de 21/10/2026). Quem vê todas as sedes
 * continua numa chamada só.
 */
function useDasSedes<T>(recurso: string, sedesDoEscopo: string[] | null) {
  const chave =
    sedesDoEscopo && sedesDoEscopo.length > 1 ? `${recurso}-das-sedes:${sedesDoEscopo.join(",")}` : `/api/${recurso}`;
  return useSWR<T[]>(chave, (c: string): Promise<T[]> =>
    c === `/api/${recurso}`
      ? (fetcher(c) as Promise<T[]>)
      : Promise.all(
          sedesDoEscopo!.map((id) => fetcher(`/api/${recurso}?sede=${encodeURIComponent(id)}`) as Promise<T[]>),
        ).then((listas) => listas.flat()),
  );
}

export default function PaginaEventuais() {
  const sessao = useSessao();
  const sedesDoEscopo = sessao ? sedesPermitidas(sessao) : null;
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: funcionarios } = useDasSedes<Funcionario>("funcionarios", sedesDoEscopo);
  const { data: locais } = useDasSedes<Local>("locais", sedesDoEscopo);
  const { data: categorias } = useSWR<Categoria[]>("/api/categorias", fetcher);

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const nomeFunc = (id: string) => funcionarios?.find((f) => f.id === id)?.nome ?? "—";
  /** Só o que é da sede escolhida no formulário (sem sede ainda: tudo). */
  const daSede = <T extends { sede_id: string }>(lista: T[] | undefined, form: Record<string, unknown>) =>
    (lista ?? []).filter((x) => !form.sede_id || x.sede_id === form.sede_id);

  return (
    <CrudManager<ServicoEventual>
      titulo="Serviços eventuais"
      subtitulo="Trabalho fora da rotina planejada, registrado depois. Use “eventual” para trabalho avulso e “imprevisto” para ocorrências que consumiram tempo — os imprevistos calibram a folga por sede."
      endpoint="/api/servicos-eventuais"
      textoNovo="+ Registrar eventual"
      campos={[
        {
          key: "data",
          rotulo: "Data",
          tipo: "data",
          obrigatorio: true,
          dica: "Dia em que o serviço/ocorrência aconteceu. Como é registrado depois, costuma ser hoje ou um dia recente.",
        },
        {
          key: "tipo",
          rotulo: "Tipo",
          tipo: "select",
          opcoes: TIPOS,
          padrao: "eventual",
          obrigatorio: true,
          dica: "“Serviço eventual” = trabalho avulso produtivo que surgiu (ex.: apoio a um evento). “Imprevisto” = ocorrência que consumiu tempo (ex.: vazamento, queda de energia) — não é ociosidade e serve para calibrar a folga da sede.",
        },
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          opcoes: (sedes ?? []).filter((s) => s.ativo).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          dica: "Sede onde ocorreu. Coordenadores só registram nas sedes que operam.",
        },
        {
          key: "descricao",
          rotulo: "Descrição",
          tipo: "textarea",
          inteira: true,
          obrigatorio: true,
          dica: "O que foi feito ou o que aconteceu, em poucas palavras.",
        },
        {
          key: "funcionario_id",
          rotulo: "Funcionário",
          tipo: "select",
          opcoes: (form) =>
            daSede(funcionarios, form).map((f) => ({ valor: f.id, rotulo: `${f.nome} — ${nomeSede(f.sede_id)}` })),
          ajuda: "Opcional — deixe em branco se não foi de uma pessoa específica",
          dica: "Quem executou/atendeu. Opcional: alguns imprevistos envolvem a equipe toda.",
        },
        {
          key: "categoria_id",
          rotulo: "Categoria",
          tipo: "select",
          opcoes: (categorias ?? []).filter((c) => c.ativo).map((c) => ({ valor: c.id, rotulo: c.nome })),
          ajuda: "Opcional",
          dica: "Categoria de atividade, quando se encaixar em uma (ex.: Higienização). Opcional.",
        },
        {
          key: "local_id",
          rotulo: "Local",
          tipo: "select",
          opcoes: (form) =>
            daSede(locais, form).map((l) => ({ valor: l.id, rotulo: `${l.nome_local} — ${nomeSede(l.sede_id)}` })),
          ajuda: "Opcional",
          dica: "Onde ocorreu, quando aplicável. Opcional.",
        },
        {
          key: "inicio",
          rotulo: "Início",
          tipo: "hora",
          dica: "Hora de início, se souber. Opcional — o que conta para o cálculo é o tempo em minutos.",
        },
        {
          key: "fim",
          rotulo: "Fim",
          tipo: "hora",
          dica: "Hora de término, se souber. Opcional.",
        },
        {
          key: "tempo_min",
          rotulo: "Tempo (min)",
          tipo: "numero",
          padrao: 0,
          obrigatorio: true,
          ajuda: "Duração real em minutos",
          dica: "Quanto tempo consumiu, em minutos. É o número que entra na soma de tempo eventual/imprevisto da sede.",
        },
        { key: "observacao", rotulo: "Observações", tipo: "textarea", inteira: true },
      ]}
      colunas={[
        { key: "data", rotulo: "Data", render: (e) => <span className="num">{formatarDataBR(e.data)}</span> },
        {
          key: "tipo",
          rotulo: "Tipo",
          render: (e) => (
            <span className={`selo ${e.tipo === "imprevisto" ? "selo-vermelho" : "selo-azul"}`}>
              {e.tipo === "imprevisto" ? "Imprevisto" : "Eventual"}
            </span>
          ),
        },
        { key: "descricao", rotulo: "Descrição", render: (e) => <strong>{e.descricao}</strong> },
        { key: "sede_id", rotulo: "Sede", render: (e) => nomeSede(e.sede_id) },
        {
          key: "funcionario_id",
          rotulo: "Funcionário",
          render: (e) => (e.funcionario_id ? nomeFunc(e.funcionario_id) : <span style={{ color: "var(--tinta-3)" }}>—</span>),
        },
        {
          key: "tempo_min",
          rotulo: "Tempo",
          render: (e) => <strong className="num">{formatarDuracao(e.tempo_min)}</strong>,
        },
      ]}
    />
  );
}
