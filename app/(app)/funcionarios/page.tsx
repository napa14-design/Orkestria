"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import CrudManager from "@/components/CrudManager";
import DivergenciasQuadro from "@/components/funcionarios/DivergenciasQuadro";
import Modal from "@/components/Modal";
import { apiPost, ErroApi } from "@/lib/clientApi";
import { hhmmParaMin, hojeISO } from "@/lib/dateUtils";
import { MOTIVOS_DESLIGAMENTO, motivoAbreVaga, motivoParaOCromos } from "@/lib/desligamento";
import { normalizarEmpresa } from "@/lib/empresas";
import {
  csvDoTrio,
  resumoIntervalos,
  rotularIntervalos,
  totalIntervaloMin,
} from "@/lib/intervalos";
import { cargaSemanalMin, intervalosDoFuncionario, jornadaLiquidaMin } from "@/lib/calculations";
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

/** No select do "Transferir": o destino é um setor fora das sedes, não uma sede. */
const OUTRO_SETOR = "__outro_setor__";
/** Idem: fica na mesma sede e muda de função (promoção). */
const OUTRA_FUNCAO = "__outra_funcao__";

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
    /** Obrigatório desde 13/11/2026 (contrato com o Chromos): só "saiu da empresa" vai para lá. */
    tipo: "" as "" | "saiu_da_empresa" | "saiu_do_posto",
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
    mutate(
      (k) =>
        typeof k === "string" &&
        (k.startsWith("/api/funcionarios") || k.startsWith("funcionarios-das-sedes") || k.startsWith("/api/quadro-infra")),
    );
  const dataBR = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "");
  const fraseDaVaga = (v: { aberta: boolean; codigo?: string; motivo?: string }) =>
    v.aberta ? `Vaga #${v.codigo} aberta no SGCP.` : `A vaga não foi aberta: ${v.motivo}`;

  /**
   * Transferir de sede (27/10/2026): botão próprio — "fica muito ruim no
   * desligar". Vaga no SGCP desmarcada por padrão (decisão do dono).
   */
  const [paraTransferir, setParaTransferir] = useState<Funcionario | null>(null);
  const [transferencia, setTransferencia] = useState({ sede_id: "", setor: "", funcao: "", data: hojeISO(), abrirVaga: false });
  const paraSetor = transferencia.sede_id === OUTRO_SETOR;
  const mudaFuncao = transferencia.sede_id === OUTRA_FUNCAO;
  const abrirTransferir = (f: Funcionario) => {
    setParaTransferir(f);
    setTransferencia({ sede_id: "", setor: "", funcao: "", data: hojeISO(), abrirVaga: false });
    setErro("");
  };
  const confirmarTransferencia = async () => {
    if (!paraTransferir) return;
    setEnviando(true);
    setErro("");
    try {
      if (mudaFuncao) {
        const r = await apiPost<{ funcao: string; avisouQuadro: boolean }>(`/api/funcionarios/${paraTransferir.id}/transferir`, {
          funcao: transferencia.funcao,
          data: transferencia.data,
        });
        setAviso({
          tipo: "ok",
          texto: `${paraTransferir.nome} agora é ${r.funcao}. A agenda e a rota continuam como estavam.${r.avisouQuadro ? " O RH vê a mudança na Movimentação do Chromos." : ""}`,
        });
        setParaTransferir(null);
        await recarregar();
        return;
      }
      const r = await apiPost<{ blocosRemovidos: number; vaga: { aberta: boolean; codigo?: string; motivo?: string } }>(
        `/api/funcionarios/${paraTransferir.id}/transferir`,
        paraSetor
          ? { setor: transferencia.setor, data: transferencia.data, abrirVaga: transferencia.abrirVaga }
          : { sede_id: transferencia.sede_id, data: transferencia.data, abrirVaga: transferencia.abrirVaga },
      );
      setAviso({
        tipo: "ok",
        texto:
          `${paraTransferir.nome} transferida para ${paraSetor ? transferencia.setor.trim() : nomeSede(transferencia.sede_id)} a partir de ${dataBR(transferencia.data)}. ` +
          (paraSetor
            ? "A rota daqui fica guardada como posto vago."
            : `A ficha dela já está lá — para dar a rota, edite e escolha "Assume o posto de".`) +
          (r.blocosRemovidos ? ` ${r.blocosRemovidos} bloco(s) planejado(s) saíram da agenda daqui.` : "") +
          (transferencia.abrirVaga ? ` ${fraseDaVaga(r.vaga)}` : ""),
      });
      setParaTransferir(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível transferir.");
    } finally {
      setEnviando(false);
    }
  };

  /** `data`: a do Quadro da Infra, quando o Desligar vem de lá. */
  const abrirDesligar = (f: Funcionario, data = hojeISO()) => {
    setParaDesligar(f);
    setDesligamento({ tipo: "", data, motivo: "", abrirVaga: true, extinguirPosto: false });
    setErro("");
  };

  const saiuDoPosto = desligamento.tipo === "saiu_do_posto";
  const confirmarDesligamento = async () => {
    if (!paraDesligar) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await apiPost<{
        blocosRemovidos: number;
        itensDeRotaApagados?: number;
        /** Ausente no "saiu do posto": a pessoa continua na empresa, não há vaga. */
        vaga?: { aberta: boolean; codigo?: string; motivo?: string };
        /** Só no "saiu do posto": a ficha-posto criada (null se a pessoa não tinha rota). */
        postoVagoId?: string | null;
        itensDeRotaMovidos?: number;
      }>(
        `/api/funcionarios/${paraDesligar.id}/desligar`,
        saiuDoPosto
          ? { tipo: "saiu_do_posto", data: desligamento.data }
          : {
              ...desligamento,
              // Só vale sem vaga: com vaga aberta, o posto continua por definição.
              extinguirPosto: !desligamento.abrirVaga && desligamento.extinguirPosto,
            },
      );
      setAviso(
        saiuDoPosto
          ? {
              tipo: "ok",
              texto:
                `${paraDesligar.nome} saiu do posto a partir de ${dataBR(desligamento.data)} e continua na sede, sem rota` +
                (r.blocosRemovidos ? ` · ${r.blocosRemovidos} bloco(s) planejado(s) saíram da agenda` : "") +
                (r.postoVagoId
                  ? `. A rota (${r.itensDeRotaMovidos ?? 0} item(ns)) ficou como "Posto de ${paraDesligar.nome}" — escolha quem assume em "Assume o posto de".`
                  : ". Não havia rota para guardar."),
            }
          : {
              tipo: r.vaga?.aberta ? "ok" : "aviso",
              texto:
                `${paraDesligar.nome} desligado(a) a partir de ${dataBR(desligamento.data)}` +
                (r.blocosRemovidos ? ` · ${r.blocosRemovidos} bloco(s) planejado(s) saíram da agenda` : "") +
                (r.itensDeRotaApagados ? ` · posto extinto: ${r.itensDeRotaApagados} item(ns) da rota apagado(s)` : "") +
                `. ${r.vaga ? fraseDaVaga(r.vaga) : ""}`,
            },
      );
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

  /** Quem está no quadro precisa dos dados do RH; desligado e posto vago, não. */
  const noQuadro = (form: Record<string, unknown>) => {
    // A mesma régua do servidor (`validarFuncionario`): desligado OU inativo dispensa.
    const antes = form.__antes as Funcionario | undefined;
    return !antes?.desligado_em && antes?.ativo !== false;
  };
  /** As empresas ATIVAS do cadastro (Sistema › Empresas): a lista fechada do campo Empresa. */
  const { data: empresas } = useSWR<string[]>("/api/empresas", fetcher);

  /**
   * Prévia do ajuste de horário (13/11/2026): a rota anda junto com a entrada de quem
   * assume — ver `lib/rotaNoHorario.ts`. Dito antes de salvar, não depois.
   */
  const horarioDoPosto = (form: Record<string, unknown>) => {
    const antigo = (equipe ?? []).find((f) => f.id === form.substitui);
    const de = hhmmParaMin(antigo?.entrada ?? "");
    const para = hhmmParaMin(String(form.entrada ?? ""));
    if (!antigo || Number.isNaN(de) || Number.isNaN(para)) return "";
    if (de === para) {
      // Mesma entrada, pausas diferentes: a rota também se mexe (contorna as pausas novas).
      // Pelo mesmo leitor das pausas que a regra usa: ficha antiga guarda a pausa em
      // `intervalo_inicio`/`intervalo_fim`, não em `intervalos`.
      const pausas = (f: Partial<Funcionario>) =>
        intervalosDoFuncionario({ intervalos: f.intervalos ?? "", intervalo_inicio: f.intervalo_inicio ?? "", intervalo_fim: f.intervalo_fim ?? "" })
          .map((p) => `${p.inicio}-${p.fim}`)
          .join(";");
      return pausas(antigo) !== pausas(form as Partial<Funcionario>)
        ? ` As pausas de ${antigo.nome} eram outras: a tarefa que cair numa pausa desta pessoa vai para logo depois dela, na mesma ordem.`
        : "";
    }
    const quanto = formatarDuracao(Math.abs(para - de));
    return ` ${antigo.nome} entrava ${antigo.entrada} e esta pessoa entra ${form.entrada}: a rota anda ${quanto} mais ${para < de ? "cedo" : "tarde"}, na mesma ordem, contornando as pausas dela. O que não couber fica depois da saída, marcado na agenda.`;
  };

  /**
   * Quem pode ter o posto assumido na sede escolhida: quem está lá hoje e os
   * POSTOS VAGOS — desligados cuja rota ninguém assumiu ainda.
   */
  // Só POSTO VAGO (decisão do dono, 16/11/2026): tomar o posto de quem está ativo tirava
  // a pessoa do quadro sem desligamento — e sem aviso ao Quadro da Infra. Quem sai,
  // sai pelo "Desligar" (da empresa ou do posto); aí o posto fica vago para assumir.
  const candidatos = (form: Record<string, unknown>) =>
    (equipe ?? [])
      .filter(
        (f) =>
          f.sede_id === form.sede_id &&
          f.id !== form.id && // na edição, a própria pessoa não é candidata
          Boolean(f.desligado_em) &&
          !f.substituido_por &&
          !f.posto_extinto,
      )
      .map((f) => ({ valor: f.id, rotulo: `${f.nome} — posto vago desde ${dataBR(f.desligado_em!)}` }));

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
      acimaDaTabela={(sedeId) => (
        <DivergenciasQuadro
          sedeId={sedeId}
          aoMudar={() => void recarregar()}
          aoDesligar={(id, data) => {
            const f = equipe?.find((x) => x.id === id);
            if (f) abrirDesligar(f, data);
          }}
        />
      )}
      // Cadastrar pode assumir um posto: a lista de candidatas (outra chave SWR,
      // de todas as sedes) precisa refletir isso antes do próximo cadastro.
      aoCriar={() => void recarregar()}
      // A edição também pode passar um posto ("Assume o posto de", 27/10/2026).
      aoEditar={() => void recarregar()}
      textoNovo="+ Novo funcionário"
      vazio="Adicione a equipe (ASGs): horário, sede e escala. Depois é só montar a rotina arrastando tarefas."
      // Funcionário não se exclui, se desliga: com data, motivo e vaga no SGCP.
      permissao={{ excluir: false }}
      // Quem já saiu (desligado ou transferido) sai da lista; quem está em aviso
      // prévio continua até a data. "ver desligados (N)" no fim, para quando
      // precisar — o "Abrir vaga" mora na linha deles (pedido do dono, 13/11/2026).
      ocultos={{ quando: (f) => Boolean(f.desligado_em && f.desligado_em <= hojeISO()), nome: "desligados" }}
      acoesExtra={(f) =>
        !f.desligado_em ? (
          <>
            <button className="btn btn-mini btn-fantasma" onClick={() => abrirTransferir(f)}>
              Transferir
            </button>
            <button
              className="btn btn-mini btn-fantasma"
              style={{ color: "var(--vermelho)" }}
              onClick={() => abrirDesligar(f)}
            >
              Desligar
            </button>
          </>
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
        // O RH dá o nome completo; a agenda mostra o apelido (pedido do dono, 13/11/2026:
        // "eles colocam 1 nome só"). A coluna continua `nome`.
        { key: "nome_completo", rotulo: "Nome completo", tipo: "texto", obrigatorio: noQuadro },
        {
          key: "nome",
          rotulo: "Apelido (aparece na agenda)",
          tipo: "texto",
          obrigatorio: true,
          dica: "Como a equipe chama a pessoa (ex.: \"Gisele\"). É este que aparece nas colunas da agenda e nas listas.",
        },
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          opcoes: (sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          // Escolhe-se só ao cadastrar: trocar de sede é pelo "Transferir", que avisa o
          // Quadro da Infra (contrato com o Chromos, 13/11/2026). Na edição o valor segue
          // no formulário, sem campo para mudar.
          mostrarSe: (f) => f.__novo === true,
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
          dica: "Horário de saída SÓ no sábado. Ex.: entrada 07:00 e saída 11:15. A pausa do sábado vai em \"Intervalos (sábado)\", logo abaixo.",
        },
        {
          key: "intervalos_sabado",
          rotulo: "Intervalos (sábado)",
          tipo: "intervalos",
          inteira: true,
          padrao: "",
          // Só com o horário de sábado: sem ele, o sábado usa o horário do dia útil.
          mostrarSe: (f) => Boolean(f.entrada_sabado && f.saida_sabado),
          ajuda: (form) =>
            resumoIntervalos(
              String(form.intervalos_sabado ?? ""),
              Math.max(0, hhmmParaMin(String(form.saida_sabado ?? "")) - hhmmParaMin(String(form.entrada_sabado ?? ""))),
            ),
          dica: "Pausas SÓ do sábado, no formato HH:mm-HH:mm. Ex.: lanche de 15 min \"09:00-09:15\". Deixe vazio se no sábado não há pausa.",
        },
        // Como a sede: escolhe-se ao cadastrar; depois é pelo "Transferir › Outra função", que avisa o
        // Quadro. Aqui, mudar a função fazia o servidor recusar a edição inteira (24/11/2026).
        { key: "cargo", rotulo: "Cargo/Função", tipo: "texto", padrao: "ASG", mostrarSe: (f) => f.__novo === true },
        // Dados do RH: obrigatórios desde 13/11/2026 para quem está no quadro.
        // Desligado e posto vago editam sem eles (o servidor tem a mesma regra).
        {
          key: "matricula",
          rotulo: "Matrícula",
          tipo: "texto",
          obrigatorio: noQuadro,
          dica: "Matrícula do RH. É por ela que outros sistemas da Infraestrutura encontram a pessoa, porque nome pode repetir.",
        },
        {
          key: "empresa",
          rotulo: "Empresa",
          // Lista FECHADA com cadastro (decisão do dono, 13/11/2026): as empresas vêm de
          // Sistema › Empresas, mantido pelo administrador. Empresa nova entra por lá.
          // Ficha gravada em outra grafia ("Apel - Matriz") abre já na do cadastro.
          valorInicial: (item) => normalizarEmpresa(item.empresa),
          tipo: "select",
          obrigatorio: noQuadro,
          opcoes: (f) => {
            const atual = normalizarEmpresa(f.empresa);
            // Ficha antiga com empresa fora do cadastro: aparece para não sumir, marcada.
            const fora = atual && !(empresas ?? []).includes(atual) ? [{ valor: atual, rotulo: `${atual} (fora do cadastro)` }] : [];
            return [...(empresas ?? []).map((e) => ({ valor: e, rotulo: e })), ...fora];
          },
          ajuda: (f) =>
            f.empresa && !(empresas ?? []).includes(normalizarEmpresa(f.empresa))
              ? "Esta empresa não está no cadastro: escolha uma da lista. Se faltar alguma, o administrador cadastra em Sistema › Empresas."
              : "",
          dica: "A empresa que registra a pessoa (APEL MATRIZ, APEL 7, IPADE…), na mesma grafia do Quadro da Infra. Cada empresa numera a sua matrícula. Faltou alguma? O administrador cadastra em Sistema › Empresas.",
        },
        { key: "data_admissao", rotulo: "Data de admissão", tipo: "data", obrigatorio: noQuadro },
        // Sem checkbox "Ativo": desmarcar era o caminho antigo de saída, sem data,
        // sem motivo e sem vaga. Quem sai, sai pelo "Desligar" (13/10/2026).
        { key: "observacoes", rotulo: "Observações", tipo: "textarea", inteira: true },
        // Só para a lista de candidatos saber quem está sendo editado.
        { key: "id", rotulo: "id", tipo: "texto", mostrarSe: () => false },
        {
          key: "substitui",
          rotulo: "Assume o posto de",
          tipo: "select",
          inteira: true,
          opcoes: candidatos,
          // Ao cadastrar e também depois, na edição (27/10/2026: uma pessoa foi
          // cadastrada antes de se saber de quem ficaria com a rota). Na
          // edição, a rota que a pessoa já tiver é TROCADA pela do posto.
          mostrarSe: (f) => candidatos(f).length > 0,
          ajuda: (f) =>
            (f.__novo === true
              ? "Opcional. A rota padrão de quem sai passa para quem entra."
              : "Opcional. A rota padrão de quem sai passa para esta pessoa — se ela já tiver rota, a dela é trocada pela do posto (o que já foi feito não muda).") +
            horarioDoPosto(f),
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
        {
          key: "nome",
          rotulo: "Apelido",
          render: (f) => (
            <>
              {f.nome}
              {f.deixou_asg_em && <div style={{ fontSize: 11, color: "var(--acento)" }}>{f.cargo}</div>}
              {f.nome_completo && f.nome_completo !== f.nome && (
                <div style={{ fontSize: 11, color: "var(--tinta-3)" }}>{f.nome_completo}</div>
              )}
            </>
          ),
        },
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
              // Transferência não é desligamento para quem lê a lista.
              if (f.transferido_para || f.transferido_setor)
                return (
                  <span className={`selo ${futuro ? "selo-amarelo" : "selo-azul"}`} title={vaga.replace(/^ · /, "")}>
                    {futuro ? "Vai para" : "Transferida para"} {f.transferido_setor || nomeSede(f.transferido_para ?? "")} em {dataBR(f.desligado_em)}
                  </span>
                );
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
      {/* Tipo obrigatório (contrato com o Chromos, 13/11/2026): só "saiu da empresa"
          desliga lá; "saiu do posto" fica aqui — a pessoa continua na sede, sem rota. */}
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px", display: "grid", gap: 8, fontSize: 13.5 }}>
        <legend className="rotulo" style={{ marginBottom: 6 }}>O que aconteceu?</legend>
        <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <input
            type="radio"
            name="tipo-desligamento"
            checked={desligamento.tipo === "saiu_da_empresa"}
            onChange={() => setDesligamento((d) => ({ ...d, tipo: "saiu_da_empresa" }))}
          />
          <span>
            <strong>Saiu da empresa</strong> — demissão, fim de contrato… Vai também para o Quadro da Infra.
          </span>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <input
            type="radio"
            name="tipo-desligamento"
            checked={desligamento.tipo === "saiu_do_posto"}
            onChange={() => setDesligamento((d) => ({ ...d, tipo: "saiu_do_posto" }))}
          />
          <span>
            <strong>Saiu do posto</strong> — continua na empresa e na sede, mas sem esta rota.
          </span>
        </label>
      </fieldset>
      {desligamento.tipo && (
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--tinta-2)", marginTop: 0 }}>
          {saiuDoPosto
            ? `A partir da data, ${paraDesligar?.nome ?? ""} fica sem rota (continua na sede e na lista). A rota vira um posto vago, para quem for assumir pelo "Assume o posto de". Nada muda no Quadro da Infra.`
            : `A partir da data, ${paraDesligar?.nome ?? ""} sai da agenda e da geração do dia. Os dias já trabalhados continuam no nome de quem trabalhou, e a rota padrão fica guardada como posto vago para quem for contratado assumir.`}
        </p>
      )}
      {desligamento.tipo && (
      <div className="form-grade">
        <label className="campo">
          <span className="rotulo">{saiuDoPosto ? "A partir de" : "Data do desligamento"}</span>
          <input
            type="date"
            value={desligamento.data}
            // "Saiu do posto" só hoje ou para trás: com data futura a rota sairia na
            // hora e a pessoa ficaria sem agenda até a data (auditoria, 16/11/2026).
            max={saiuDoPosto ? hojeISO() : undefined}
            onChange={(e) => setDesligamento((d) => ({ ...d, data: e.target.value }))}
          />
        </label>
        {saiuDoPosto && desligamento.data > hojeISO() && (
          <p style={{ fontSize: 12.5, color: "var(--vermelho)", margin: 0 }}>Tirar do posto vale de hoje para trás.</p>
        )}
        {!saiuDoPosto && (
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
        )}
      </div>
      )}
      {desligamento.tipo === "saiu_da_empresa" && desligamento.motivo && !motivoParaOCromos(desligamento.motivo) && (
        <p style={{ fontSize: 12.5, color: "var(--tinta-3)", margin: "10px 0 0" }}>
          Este motivo não existe no Quadro da Infra: lá o desligamento fica para alguém conferir.
        </p>
      )}
      {desligamento.tipo === "saiu_da_empresa" && desligamento.data > hojeISO() && (
        <p style={{ fontSize: 12.5, color: "var(--tinta-3)", margin: "10px 0 0" }}>
          Data futura (aviso prévio): até lá, a pessoa segue na agenda normalmente.
        </p>
      )}
      {desligamento.tipo !== "saiu_da_empresa" ? null : desligamento.motivo === "Abandono de emprego" ? (
        <p style={{ fontSize: 12.5, color: "var(--tinta-3)", margin: "10px 0 0" }}>
          Abandono não abre vaga por aqui: depois de 15 dias de falta o Chromos avisa a Coordenação, que pede a vaga por lá.
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
      {desligamento.tipo === "saiu_da_empresa" && !desligamento.abrirVaga && desligamento.motivo !== "Abandono de emprego" && (
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
          disabled={
            enviando || !desligamento.tipo || !desligamento.data || (!saiuDoPosto && !desligamento.motivo) ||
            (saiuDoPosto && desligamento.data > hojeISO())
          }
        >
          {enviando ? "Gravando…" : saiuDoPosto ? "Tirar do posto" : "Desligar"}
        </button>
      </div>
    </Modal>

    <Modal
      titulo={`Transferir ${paraTransferir?.nome ?? ""}`}
      aberto={!!paraTransferir}
      aoFechar={() => setParaTransferir(null)}
      larguraMax={460}
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--tinta-2)", marginTop: 0 }}>
        {mudaFuncao ? (
          <>
            {paraTransferir?.nome} ({paraTransferir?.cargo || "sem função"}) continua em {paraTransferir ? nomeSede(paraTransferir.sede_id) : ""}, com a mesma agenda e rota; só a
            função muda. Se o posto ficou sem ninguém, use depois Desligar › Saiu do posto. Quem deixa de ser ASG não volta por
            aqui, e o RH é avisado no Chromos.
          </>
        ) : (
          <>A partir da data, {paraTransferir?.nome} sai da agenda de {paraTransferir ? nomeSede(paraTransferir.sede_id) : ""}</>
        )}
        {mudaFuncao ? null : paraSetor ? (
          ". A rota daqui fica guardada como posto vago para quem assumir."
        ) : (
          <>
            {" "}e ganha uma ficha na sede nova, com o mesmo horário e matrícula. A rota daqui fica guardada como posto vago; lá,
            para dar a rota, edite a ficha e escolha "Assume o posto de".
          </>
        )}
      </p>
      <div className="form-grade">
        <label className="campo">
          <span className="rotulo">Para onde</span>
          <select
            value={transferencia.sede_id}
            onChange={(e) => {
              setTransferencia((t) => ({ ...t, sede_id: e.target.value }));
              setErro("");
            }}
          >
            <option value="">Escolha…</option>
            {(sedes ?? [])
              .filter((s) => s.id !== paraTransferir?.sede_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome_sede}
                </option>
              ))}
            <option value={OUTRA_FUNCAO}>Outra função (continua nesta sede)</option>
            <option value={OUTRO_SETOR}>Outro setor (fora das sedes)</option>
          </select>
        </label>
        <label className="campo">
          <span className="rotulo">A partir de</span>
          <input
            type="date"
            value={transferencia.data}
            onChange={(e) => setTransferencia((t) => ({ ...t, data: e.target.value }))}
          />
        </label>
      </div>
      {mudaFuncao && (
        <label className="campo" style={{ marginTop: 12 }}>
          <span className="rotulo">Nova função</span>
          <input
            type="text"
            maxLength={60}
            placeholder="Ex.: Ascensorista"
            value={transferencia.funcao}
            onChange={(e) => setTransferencia((t) => ({ ...t, funcao: e.target.value }))}
          />
        </label>
      )}
      {paraSetor && (
        <label className="campo" style={{ marginTop: 12 }}>
          <span className="rotulo">Qual setor</span>
          <input
            type="text"
            maxLength={60}
            placeholder="Ex.: Cantina"
            value={transferencia.setor}
            onChange={(e) => setTransferencia((t) => ({ ...t, setor: e.target.value }))}
          />
        </label>
      )}
      {!mudaFuncao && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5 }}>
          <input
            type="checkbox"
            checked={transferencia.abrirVaga}
            onChange={(e) => setTransferencia((t) => ({ ...t, abrirVaga: e.target.checked }))}
          />
          Abrir vaga de substituição no SGCP para o posto daqui
        </label>
      )}
      {erro && (
        <div className="alerta alerta-erro" style={{ marginTop: 12 }}>
          {erro}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => setParaTransferir(null)}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primario"
          onClick={() => void confirmarTransferencia()}
          disabled={
            enviando || !transferencia.sede_id || !transferencia.data || (paraSetor && !transferencia.setor.trim()) ||
            (mudaFuncao && !transferencia.funcao.trim())
          }
        >
          {mudaFuncao ? (enviando ? "Mudando…" : "Mudar função") : enviando ? "Transferindo…" : "Transferir"}
        </button>
      </div>
    </Modal>
    </>
  );
}
