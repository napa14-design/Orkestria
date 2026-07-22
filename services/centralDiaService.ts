import { jornadaDoDia } from "@/lib/calculations";
import { getDataSource } from "@/lib/datasource";
import { hhmmParaMin, hojeISO } from "@/lib/dateUtils";
import { podeEscrever, type SessaoUsuario } from "@/lib/permissions";
import type { AcaoCentralDia, CentralDiaDados } from "@/types";
import { getAusencias } from "./ausenciasService";
import { getExecucoes } from "./execucoesService";
import { getFuncionarios } from "./funcionariosService";
import { getRotinasByData } from "./rotinasService";
import { getTarefas } from "./tarefasService";

function sedeDoEscopo(sessao: SessaoUsuario): string | undefined {
  if (sessao.perfil !== "supervisor" || sessao.sede_id === "geral") return undefined;
  return sessao.sede_id;
}

function minutosAgora(): number {
  const agora = new Date();
  return agora.getHours() * 60 + agora.getMinutes();
}

/**
 * Consolida só o que pode exigir uma decisão hoje.
 *
 * Deliberadamente não calcula saúde cadastral, prontidão nem cobertura de 31
 * dias. No escopo global isso recriaria milhares de leituras na página mais
 * visitada; no escopo de sede, a própria Agenda já calcula cobertura quando o
 * supervisor realmente entra para planejar.
 */
export async function getCentralDia(sessao: SessaoUsuario): Promise<CentralDiaDados> {
  const data = hojeISO();
  const sedeId = sedeDoEscopo(sessao);
  const ds = await getDataSource();

  const [sede, funcionarios, rotinas, execucoes, ausencias] = await Promise.all([
    sedeId ? ds.obter("sedes", sedeId) : Promise.resolve(null),
    getFuncionarios(sedeId),
    getRotinasByData(data, sedeId),
    getExecucoes(data, data, sedeId),
    getAusencias({ data, sedeId }),
  ]);

  const funcionariosAtivos = funcionarios.filter((funcionario) => funcionario.ativo);
  const ausentesIds = new Set(ausencias.map((ausencia) => ausencia.funcionario_id));
  const disponiveis = funcionariosAtivos.filter(
    (funcionario) => jornadaDoDia(funcionario, data).trabalha && !ausentesIds.has(funcionario.id),
  );
  const disponiveisIds = new Set(disponiveis.map((funcionario) => funcionario.id));
  const rotinasValidas = rotinas.filter((rotina) => rotina.status !== "cancelada");
  const rotinasDeIndisponiveis = rotinasValidas.filter(
    (rotina) => !disponiveisIds.has(rotina.funcionario_id),
  );
  const execucoesPorRotina = new Set(execucoes.map((execucao) => execucao.rotina_id));
  const agoraMin = minutosAgora();
  const aguardandoConfirmacao = rotinasValidas.filter(
    (rotina) =>
      !execucoesPorRotina.has(rotina.id) && hhmmParaMin(rotina.fim_planejado) <= agoraMin,
  );

  const acoes: AcaoCentralDia[] = [];
  const podeCorrigirCadastro = podeEscrever(sessao);

  if (sedeId && !sede) {
    acoes.push({
      id: "sede-invalida",
      nivel: "critico",
      titulo: "Sua conta está sem uma sede válida",
      descricao:
        "A Central não consegue separar equipe e agenda até o vínculo da conta ser corrigido.",
      quantidade: 1,
      href: "/conta",
      acao: "Ver minha conta",
    });
  } else {
    if (funcionariosAtivos.length === 0) {
      acoes.push({
        id: "sem-equipe",
        nivel: "critico",
        titulo: "Não há equipe ativa para montar o dia",
        descricao: sedeId
          ? "Cadastre ou reative ao menos uma pessoa nesta sede antes de planejar."
          : "Nenhuma pessoa ativa foi encontrada no escopo geral.",
        href: "/funcionarios",
        acao: podeCorrigirCadastro ? "Corrigir equipe" : "Ver equipe",
      });
    }

    if (rotinasDeIndisponiveis.length > 0) {
      const deAusentes = rotinasDeIndisponiveis.filter((rotina) =>
        ausentesIds.has(rotina.funcionario_id),
      ).length;
      acoes.push({
        id: "agenda-indisponivel",
        nivel: "critico",
        titulo: deAusentes > 0 ? "Há tarefas com pessoas ausentes" : "Há tarefas fora da escala",
        descricao: `${rotinasDeIndisponiveis.length} bloco(s) precisam de outra pessoa antes da execução.`,
        quantidade: rotinasDeIndisponiveis.length,
        href: "/rotinas",
        acao: "Redistribuir",
      });
    }

    if (rotinasValidas.length === 0 && disponiveis.length > 0) {
      // Cadastro só entra na Central quando impede concretamente montar hoje.
      const tarefas = sedeId ? await getTarefas(sedeId) : [];
      const tarefasUtilizaveis = tarefas.filter(
        (tarefa) =>
          tarefa.ativo &&
          (tarefa.tempo_base_min > 0 || tarefa.regra_calculo === "manual" || tarefa.presenca),
      );
      if (sedeId && tarefasUtilizaveis.length === 0) {
        acoes.push({
          id: "sem-tarefas-utilizaveis",
          nivel: "critico",
          titulo: "O cadastro ainda impede montar o dia",
          descricao: "A sede tem equipe disponível, mas nenhuma tarefa ativa com tempo utilizável.",
          href: "/tarefas",
          acao: podeCorrigirCadastro ? "Preparar tarefas" : "Ver tarefas",
        });
      } else {
        acoes.push({
          id: "dia-nao-montado",
          nivel: "atencao",
          titulo: "O dia ainda não foi montado",
          descricao: `${disponiveis.length} pessoa(s) estão disponíveis e ainda não têm uma agenda para hoje.`,
          href: "/rotinas",
          acao: "Gerar o dia",
        });
      }
    }

    if (aguardandoConfirmacao.length > 0) {
      acoes.push({
        id: "realizado-pendente",
        nivel: "atencao",
        titulo: "Atividades concluídas no horário aguardam confirmação",
        descricao: `${aguardandoConfirmacao.length} bloco(s) já passaram do horário planejado e ainda não têm realizado.`,
        quantidade: aguardandoConfirmacao.length,
        href: "/acompanhamento",
        acao: "Confirmar realizado",
      });
    }
  }

  if (acoes.length === 0) {
    acoes.push({
      id: "dia-em-ordem",
      nivel: "ok",
      titulo: rotinasValidas.length > 0 ? "O dia está em ordem" : "Nenhuma operação está pendente hoje",
      descricao:
        rotinasValidas.length > 0
          ? "Não há exceções abertas neste momento."
          : "Não existe equipe disponível nem agenda que exija intervenção neste escopo.",
      href: "/rotinas",
      acao: "Abrir agenda",
    });
  }

  const [proxima, ...fila] = acoes;
  return {
    data,
    atualizado_em: new Date().toISOString(),
    escopo: {
      sede_id: sedeId ?? "geral",
      nome: sede?.nome_sede ?? (sedeId ? "Sede não encontrada" : "Todas as sedes"),
    },
    resumo: {
      funcionarios_disponiveis: disponiveis.length,
      ausencias: ausencias.length,
      rotinas_planejadas: rotinasValidas.length,
      realizados_registrados: execucoesPorRotina.size,
      aguardando_confirmacao: aguardandoConfirmacao.length,
    },
    proxima,
    fila,
  };
}
