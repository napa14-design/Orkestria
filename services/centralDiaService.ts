import {
  feriadoDoDia,
  funcionarioNoDia,
  jornadaDoDia,
  jornadaLiquidaMin,
  NIVEL_CRITICA,
  nivelPrioridade,
  ocupaHorario,
  rotuloPrioridade,
  tempoPlanejadoMin,
} from "@/lib/calculations";
import { rotinaAguardaConfirmacao } from "@/lib/agenda";
import { getDataSource } from "@/lib/datasource";
import { agoraHHMM, hhmmParaMin, hojeISO, intervalosSobrepoem } from "@/lib/dateUtils";
import {
  limitarSedeConsulta,
  podeAlterarSede,
  podeEscrever,
  sedesPermitidas,
  type SessaoUsuario,
} from "@/lib/permissions";
import { validarAlocacao } from "@/lib/validations";
import type {
  AcaoCentralDia,
  CentralDiaDados,
  Funcionario,
  Local,
  ParametrosResolvidos,
  QualificacaoFuncionario,
  Requisito,
  ResolucaoCentralDia,
  RotinaPlanejada,
  Tarefa,
} from "@/types";
import { getAusencias } from "./ausenciasService";
import { ErroPermissao, ErroValidacao } from "./erros";
import { getExecucoes, registrarExecucao } from "./execucoesService";
import { getFuncionarios } from "./funcionariosService";
import { getLocais } from "./locaisService";
import { getRotaPadrao } from "./modelosService";
import { resolverParametros } from "./parametrosService";
import { getQualificacoes } from "./qualificacoesService";
import { getRotinasByData, updateRotina } from "./rotinasService";
import { getTarefas } from "./tarefasService";

/**
 * Minutos desde a meia-noite **no fuso da operação**.
 *
 * Era `new Date().getHours()`, ou seja, a hora do ambiente: no servidor (UTC) dava
 * três horas adiante, e a Central passava a considerar "já terminou" um bloco que
 * ainda não tinha acontecido. Mesmo bug do `hojeISO`, que já foi corrigido — este
 * ficou vivo aqui.
 */
function minutosAgora(): number {
  return hhmmParaMin(agoraHHMM());
}

/**
 * Lê cada coisa uma vez por montagem da Central. A Central tenta até 5 blocos
 * de quem faltou, e cada tentativa relia parâmetros, requisitos, qualificações,
 * tarefas e locais da sede inteira — mais de mil leituras por abertura numa sede
 * grande (levantamento de leituras, 20/10/2026; o Firestore agora é pago).
 */
type Carregador = <T>(chave: string, ler: () => Promise<T>) => Promise<T>;
function criarCarregador(): Carregador {
  const lidos = new Map<string, Promise<unknown>>();
  return <T>(chave: string, ler: () => Promise<T>) => {
    if (!lidos.has(chave)) lidos.set(chave, ler());
    return lidos.get(chave) as Promise<T>;
  };
}

/**
 * Escolhe uma única troca realmente segura. Qualquer alerta, inclusive
 * sobrecarga, devolve a decisão para a Agenda em vez de decidir pelo operador.
 */
async function proporRedistribuicao(args: {
  rotina: RotinaPlanejada;
  funcionarios: Funcionario[];
  disponiveisIds: Set<string>;
  rotinasDoDia: RotinaPlanejada[];
  /** Blocos que já têm realizado — feito não se cede. */
  execucoesPorRotina: Set<string>;
  carregar: Carregador;
}): Promise<ResolucaoCentralDia | undefined> {
  const { rotina, funcionarios, disponiveisIds, rotinasDoDia, carregar } = args;
  const ds = await getDataSource();
  const tarefa = await ds.obter("tarefas", rotina.tarefa_id);
  if (!tarefa || !tarefa.ativo || tarefa.sede_id !== rotina.sede_id) return undefined;

  const [local, parametros] = await Promise.all([
    ds.obter("locais", tarefa.local_id),
    carregar("parametros", () => resolverParametros(rotina.sede_id)),
  ]);
  if (!local || !local.ativo || local.sede_id !== rotina.sede_id) return undefined;

  const requisitosIds = (tarefa.requisitos ?? "").split(",").filter(Boolean);
  const [requisitosCatalogo, qualificacoes] = await Promise.all([
    requisitosIds.length ? carregar("requisitos", () => ds.listar("requisitos")) : Promise.resolve([]),
    requisitosIds.length ? carregar("qualificacoes", () => getQualificacoes(rotina.sede_id)) : Promise.resolve([]),
  ]);
  const inicioMin = hhmmParaMin(rotina.inicio_planejado);
  const fimMin = hhmmParaMin(rotina.fim_planejado);
  if (Number.isNaN(inicioMin) || Number.isNaN(fimMin) || fimMin <= inicioMin) return undefined;

  const candidatos = funcionarios
    .filter(
      (funcionario) =>
        funcionario.sede_id === rotina.sede_id &&
        funcionario.id !== rotina.funcionario_id &&
        disponiveisIds.has(funcionario.id),
    )
    .map((funcionario) => {
      const rotinasExistentes = rotinasDoDia.filter(
        (item) => item.funcionario_id === funcionario.id && item.id !== rotina.id,
      );
      const efetivo = funcionarioNoDia(funcionario, rotina.data);
      const alertas = validarAlocacao({
        funcionario: efetivo,
        rotinasExistentes,
        inicioMin,
        fimMin,
        tarefa,
        local,
        parametros,
        tempoPrevistoNovo: rotina.tempo_previsto_min,
        requisitosCatalogo,
        qualificacoesFuncionario: qualificacoes.filter(
          (qualificacao) => qualificacao.funcionario_id === funcionario.id,
        ),
        data: rotina.data,
      });
      const jornada = jornadaLiquidaMin(efetivo);
      return {
        funcionario,
        segura: alertas.length === 0,
        carga: jornada > 0 ? tempoPlanejadoMin(rotinasExistentes) / jornada : Infinity,
      };
    })
    .filter((candidato) => candidato.segura)
    .sort(
      (a, b) =>
        a.carga - b.carga ||
        a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR"),
    );

  const escolhido = candidatos[0]?.funcionario;
  const origem = funcionarios.find((funcionario) => funcionario.id === rotina.funcionario_id);
  if (!escolhido) {
    return proporTrocaPorPrioridade({
      ...args,
      tarefa,
      local,
      parametros,
      requisitosCatalogo,
      qualificacoes,
      inicioMin,
      fimMin,
      origemNome: origem?.nome ?? "Pessoa indisponível",
    });
  }
  return {
    tipo: "redistribuir_rotina",
    rotina_id: rotina.id,
    sede_id: rotina.sede_id,
    funcionario_id: escolhido.id,
    funcionario_nome: escolhido.nome,
    funcionario_origem_nome: origem?.nome ?? "Pessoa indisponível",
    tarefa_nome: tarefa.nome_tarefa,
    inicio_planejado: rotina.inicio_planejado,
    fim_planejado: rotina.fim_planejado,
  };
}

/**
 * Quando ninguém tem o horário livre (o normal: as equipes rodam perto de
 * 100%), procura quem está nesse horário com tarefa de prioridade MENOR e
 * propõe a troca: a pessoa assume a tarefa da falta e o que ela fazia ali fica
 * "remanejado" para amanhã, com o motivo escrito sozinho. Pedido da reunião de
 * coordenadores de 19/10/2026: "a sala prioritária de quem faltou vai para
 * quem está numa sala que hoje não é prioridade".
 *
 * Regras (decisão do dono): só cede o que é de prioridade estritamente menor
 * que a da falta — baixa antes de média; crítica nunca é cedida; bloco já
 * realizado também não. Fora o choque com o que é cedido, a troca tem que
 * passar limpa em `validarAlocacao` (requisito, gênero, intervalo, jornada).
 */
async function proporTrocaPorPrioridade(a: {
  rotina: RotinaPlanejada;
  funcionarios: Funcionario[];
  disponiveisIds: Set<string>;
  rotinasDoDia: RotinaPlanejada[];
  execucoesPorRotina: Set<string>;
  tarefa: Tarefa;
  local: Local;
  parametros: ParametrosResolvidos;
  requisitosCatalogo: Requisito[];
  qualificacoes: QualificacaoFuncionario[];
  inicioMin: number;
  fimMin: number;
  origemNome: string;
  carregar: Carregador;
}): Promise<ResolucaoCentralDia | undefined> {
  const { rotina, tarefa, local } = a;
  // Tarefa de espera não disputa a pessoa: se não coube, o motivo é outro.
  if (tarefa.espera) return undefined;
  const nivelFalta = nivelPrioridade(tarefa, local);
  // Atalho, não regra: abaixo de baixa não há o que ceder — só poupa as leituras.
  if (nivelFalta <= 1) return undefined;

  const [tarefas, locais] = await Promise.all([
    a.carregar("tarefas", () => getTarefas(rotina.sede_id)),
    a.carregar("locais", () => getLocais(rotina.sede_id)),
  ]);
  const tarefaPorId = new Map(tarefas.map((t) => [t.id, t]));
  const localPorId = new Map(locais.map((l) => [l.id, l]));
  const nivelDe = (r: RotinaPlanejada) => {
    const t = tarefaPorId.get(r.tarefa_id);
    // Tarefa que não se acha (apagada, outra sede) fecha a regra: nunca é cedida.
    return t ? nivelPrioridade(t, localPorId.get(t.local_id)) : NIVEL_CRITICA;
  };
  const agoraMin = minutosAgora();
  const tarefasEspera = new Set(tarefas.filter((t) => t.espera).map((t) => t.id));

  const opcoes = a.funcionarios
    .filter(
      (f) => f.sede_id === rotina.sede_id && f.id !== rotina.funcionario_id && a.disponiveisIds.has(f.id),
    )
    .flatMap((f) => {
      const doDia = a.rotinasDoDia.filter(
        (r) => r.funcionario_id === f.id && r.id !== rotina.id && ocupaHorario(r),
      );
      const choques = doDia.filter(
        (r) =>
          !tarefasEspera.has(r.tarefa_id) &&
          intervalosSobrepoem(a.inicioMin, a.fimMin, hhmmParaMin(r.inicio_planejado), hhmmParaMin(r.fim_planejado)),
      );
      if (choques.length === 0) return []; // sem choque e mesmo assim não coube: outro alerta
      const cedivel = choques.every(
        (r) =>
          (r.status === "planejada" || r.status === "pendente") &&
          !a.execucoesPorRotina.has(r.id) &&
          // Só o que ainda não começou: ceder o que já passou gravaria
          // "remanejada" no que talvez tenha sido feito (revisão de segurança).
          hhmmParaMin(r.inicio_planejado) >= agoraMin &&
          nivelDe(r) < nivelFalta,
      );
      if (!cedivel) return [];
      const ficam = doDia.filter((r) => !choques.includes(r));
      const efetivo = funcionarioNoDia(f, rotina.data);
      const alertas = validarAlocacao({
        funcionario: efetivo,
        rotinasExistentes: ficam,
        inicioMin: a.inicioMin,
        fimMin: a.fimMin,
        tarefa,
        local,
        parametros: a.parametros,
        tempoPrevistoNovo: rotina.tempo_previsto_min,
        requisitosCatalogo: a.requisitosCatalogo,
        qualificacoesFuncionario: a.qualificacoes.filter((q) => q.funcionario_id === f.id),
        data: rotina.data,
        tarefasEspera,
      });
      if (alertas.length > 0) return [];
      const jornada = jornadaLiquidaMin(efetivo);
      return [
        {
          funcionario: f,
          choques,
          pior: Math.max(...choques.map(nivelDe)),
          minutosCedidos: choques.reduce((s, r) => s + (r.tempo_previsto_min || 0), 0),
          carga: jornada > 0 ? tempoPlanejadoMin(ficam) / jornada : Infinity,
        },
      ];
    })
    // Baixa antes de média; depois quem cede menos; depois quem está mais leve.
    .sort(
      (x, y) =>
        x.pior - y.pior ||
        x.minutosCedidos - y.minutosCedidos ||
        x.carga - y.carga ||
        x.funcionario.nome.localeCompare(y.funcionario.nome, "pt-BR"),
    );

  const melhor = opcoes[0];
  if (!melhor) return undefined;
  return {
    tipo: "trocar_por_prioridade",
    rotina_id: rotina.id,
    sede_id: rotina.sede_id,
    funcionario_id: melhor.funcionario.id,
    funcionario_nome: melhor.funcionario.nome,
    funcionario_origem_nome: a.origemNome,
    tarefa_nome: tarefa.nome_tarefa,
    inicio_planejado: rotina.inicio_planejado,
    fim_planejado: rotina.fim_planejado,
    tarefa_prioridade: rotuloPrioridade(nivelFalta),
    cedidas: [...melhor.choques]
      .sort((x, y) => x.inicio_planejado.localeCompare(y.inicio_planejado))
      .map((r) => ({
        rotina_id: r.id,
        tarefa_nome: tarefaPorId.get(r.tarefa_id)?.nome_tarefa ?? "Tarefa",
        prioridade: rotuloPrioridade(nivelDe(r)),
        inicio_planejado: r.inicio_planejado,
        fim_planejado: r.fim_planejado,
      })),
  };
}

/**
 * Nomes das sedes do seletor — só para quem opera mais de uma.
 *
 * Quem tem escopo único (o caso comum) não paga leitura nenhuma por isto: a
 * lista sai vazia antes de tocar no banco. Para quem tem várias, lê apenas os
 * documentos das sedes dele, e reaproveita o nome da sede já carregada.
 */
async function sedesDoSeletor(
  sessao: SessaoUsuario,
  sedeAtual: string | undefined,
  nomeAtual: string | undefined,
): Promise<{ id: string; nome: string }[]> {
  const permitidas = sedesPermitidas(sessao);
  if (!permitidas || permitidas.length < 2) return [];
  const ds = await getDataSource();
  const sedes = await Promise.all(
    permitidas.map(async (id) => {
      if (id === sedeAtual && nomeAtual) return { id, nome: nomeAtual };
      const doc = await ds.obter("sedes", id);
      return { id, nome: doc?.nome_sede ?? "Sede não encontrada" };
    }),
  );
  return sedes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Consolida só o que pode exigir uma decisão hoje.
 *
 * Deliberadamente não calcula saúde cadastral, prontidão nem cobertura de 31
 * dias. No escopo global isso recriaria milhares de leituras na página mais
 * visitada; no escopo de sede, a própria Agenda já calcula cobertura quando o
 * supervisor realmente entra para planejar.
 */
export async function getCentralDia(
  sessao: SessaoUsuario,
  sedeSolicitada?: string,
): Promise<CentralDiaDados> {
  const data = hojeISO();
  // Uma sede por vez: quem opera várias troca no seletor. Manter uma única
  // sede por consulta é o que impede a Central de multiplicar leituras.
  const sedeId = limitarSedeConsulta(sessao, sedeSolicitada);
  const ds = await getDataSource();

  const [sede, funcionarios, rotinas, execucoes, ausencias, feriados] = await Promise.all([
    sedeId ? ds.obter("sedes", sedeId) : Promise.resolve(null),
    getFuncionarios(sedeId),
    getRotinasByData(data, sedeId),
    getExecucoes(data, data, sedeId),
    getAusencias({ data, sedeId }),
    // Coleção de uma dúzia de linhas por ano. Sem isto, "nenhum bloco hoje" e
    // "hoje a sede não abre" ficam indistinguíveis na tela.
    ds.listar("feriados"),
  ]);
  const feriado = feriadoDoDia(feriados, sedeId, data);

  const funcionariosAtivos = funcionarios.filter((funcionario) => funcionario.ativo);
  const ausentesIds = new Set(ausencias.map((ausencia) => ausencia.funcionario_id));
  const disponiveis = funcionariosAtivos.filter(
    (funcionario) => jornadaDoDia(funcionario, data).trabalha && !ausentesIds.has(funcionario.id),
  );
  const disponiveisIds = new Set(disponiveis.map((funcionario) => funcionario.id));
  const rotinasValidas = rotinas.filter(ocupaHorario);
  const rotinasDeIndisponiveis = rotinasValidas.filter(
    (rotina) => !disponiveisIds.has(rotina.funcionario_id),
  );
  const execucoesPorRotina = new Set(execucoes.map((execucao) => execucao.rotina_id));
  const agoraMin = minutosAgora();
  const aguardandoConfirmacao = rotinasValidas.filter(
    (rotina) =>
      !execucoesPorRotina.has(rotina.id) && rotinaAguardaConfirmacao(rotina, data, agoraMin),
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
  } else if (feriado) {
    // **Dia fechado é estado resolvido, não exceção.** A Central não pede decisão
    // nenhuma: nada foi planejado porque a sede não opera, e isso é a resposta.
    // Antes, este dia caía em "o dia ainda não foi montado" e mandava gerar — o
    // supervisor seguiria a sugestão e a geração recusaria.
    acoes.push({
      id: "sede-fechada",
      nivel: "ok",
      titulo: `Hoje a sede não opera: ${feriado.nome}`,
      descricao:
        rotinasValidas.length > 0
          ? `Ainda há ${rotinasValidas.length} bloco(s) planejado(s) nesta data — provavelmente gerados antes do feriado ser cadastrado. Revise se alguém vai trabalhar.`
          : "Não há nada a montar nem a confirmar. Se houver trabalho hoje, ajuste em Estrutura › Feriados e recessos.",
      href: rotinasValidas.length > 0 ? "/rotinas" : "/feriados",
      acao: rotinasValidas.length > 0 ? "Ver o que ficou planejado" : "Ver feriados",
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
      // Só vale cobrir o que ainda não terminou — o bloco das 07:00 às 09:00
      // ninguém mais faz. Antes a Central olhava sempre o PRIMEIRO bloco de quem
      // faltou: com a falta percebida no meio do turno ele já tinha começado, a
      // troca não achava nada a ceder e os blocos seguintes nunca eram tentados
      // (auditoria, 20/10/2026). Tenta os próximos, até um limite de leituras.
      const cobriveis = rotinasDeIndisponiveis
        .filter((r) => !execucoesPorRotina.has(r.id) && hhmmParaMin(r.fim_planejado) > agoraMin)
        .sort((a, b) => a.inicio_planejado.localeCompare(b.inicio_planejado) || a.id.localeCompare(b.id))
        .slice(0, 5);
      let resolucao: ResolucaoCentralDia | undefined;
      const carregar = criarCarregador();
      for (const rotina of podeCorrigirCadastro ? cobriveis : []) {
        resolucao = await proporRedistribuicao({
          rotina,
          funcionarios: funcionariosAtivos,
          disponiveisIds,
          rotinasDoDia: rotinasValidas,
          execucoesPorRotina,
          carregar,
        });
        if (resolucao) break;
      }
      const troca = resolucao?.tipo === "trocar_por_prioridade";
      const cedidasTexto = (resolucao?.cedidas ?? [])
        .map((c) => `“${c.tarefa_nome}” (${c.prioridade})`)
        .join(", ");
      acoes.push({
        id: "agenda-indisponivel",
        nivel: "critico",
        titulo: resolucao
          ? "Quem assume a próxima tarefa?"
          : deAusentes > 0
            ? "Há tarefas com pessoas ausentes"
            : "Há tarefas fora da escala",
        descricao: troca
          ? `“${resolucao!.tarefa_nome}” (${resolucao!.tarefa_prioridade}) era de ${resolucao!.funcionario_origem_nome}. Ninguém tem o horário livre: ${resolucao!.funcionario_nome} assume e deixa ${cedidasTexto} para outro dia — fica registrado como remanejado, com o motivo.`
          : resolucao
            ? `“${resolucao.tarefa_nome}” era de ${resolucao.funcionario_origem_nome}. A troca proposta não gera conflito, sobrecarga ou alerta cadastral.`
            : `${rotinasDeIndisponiveis.length} bloco(s) precisam de outra pessoa antes da execução.`,
        quantidade: rotinasDeIndisponiveis.length,
        href: "/rotinas",
        acao: troca ? "Confirmar troca" : resolucao ? "Confirmar alocação" : "Redistribuir",
        resolucao,
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
        // "Gerar o dia" só é uma ação de verdade se existir rota padrão. Sem ela, a
        // Central mandava gerar, o supervisor clicava e a geração recusava — um
        // beco. A leitura extra é paga só neste galho, que é justamente onde ela
        // decide o que dizer.
        const temRotaPadrao = sedeId ? (await getRotaPadrao(sedeId)).length > 0 : false;
        acoes.push(
          temRotaPadrao
            ? {
                id: "dia-nao-montado",
                nivel: "atencao",
                titulo: "O dia ainda não foi montado",
                descricao: `${disponiveis.length} pessoa(s) estão disponíveis e ainda não têm uma agenda para hoje.`,
                href: "/rotinas",
                acao: "Gerar o dia",
              }
            : {
                id: "sem-rota-padrao",
                nivel: "atencao",
                titulo: "Esta sede ainda não tem uma rota padrão",
                descricao: `${disponiveis.length} pessoa(s) disponíveis, mas não há de onde gerar o dia. Monte um dia na agenda e salve como rota padrão — a partir daí, montar o dia vira um clique.`,
                href: "/rotinas",
                acao: "Montar o primeiro dia",
              },
        );
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
      sedes: await sedesDoSeletor(sessao, sedeId, sede?.nome_sede),
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

/**
 * Confirma somente a proposta que ainda é a próxima decisão da Central.
 * Recalcular aqui impede que um clique antigo ou corpo manipulado mova rotina.
 */
export async function resolverProximaExcecao(
  sessao: SessaoUsuario,
  rotinaId: string,
  funcionarioId: string,
  /** Na troca, os blocos que a pessoa viu que ia ceder — têm que ser os mesmos. */
  cedidasIds: string[] = [],
  sedeSolicitada?: string,
) {
  if (!podeEscrever(sessao)) throw new ErroPermissao();
  const central = await getCentralDia(sessao, sedeSolicitada);
  const proposta = central.proxima.resolucao;
  const mesmasCedidas =
    [...(proposta?.cedidas ?? []).map((c) => c.rotina_id)].sort().join(",") ===
    [...cedidasIds].sort().join(",");
  if (
    !proposta ||
    proposta.rotina_id !== rotinaId ||
    proposta.funcionario_id !== funcionarioId ||
    !mesmasCedidas
  ) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "PROPOSTA_DESATUALIZADA",
        mensagem: "A situação mudou. Atualize a Central para receber a próxima decisão segura.",
      },
    ]);
  }
  if (!podeAlterarSede(sessao, proposta.sede_id))
    throw new ErroPermissao("Coordenadores só redistribuem tarefas das sedes que operam.");

  // Primeiro libera o horário (remanejado, com o motivo), depois move: ao
  // contrário, a validação do `updateRotina` veria o choque e recusaria. Se o
  // mover falhar, as cedidas voltam — ninguém perde a tarefa numa troca que não
  // aconteceu (revisão de segurança).
  const ds = await getDataSource();
  const feitas: { rotinaId: string; statusAntes: RotinaPlanejada["status"]; execucaoId: string }[] = [];
  try {
    for (const cedida of proposta.cedidas ?? []) {
      const antes = await ds.obter("rotinas_planejadas", cedida.rotina_id);
      const execucao = await registrarExecucao(
        {
          rotina_id: cedida.rotina_id,
          data_execucao: central.data,
          status_realizado: "remanejada",
          inicio_real: "",
          fim_real: "",
          tempo_real_min: 0,
          justificativa: `Cedida para cobrir “${proposta.tarefa_nome}” (${proposta.tarefa_prioridade}), que era de ${proposta.funcionario_origem_nome}.`,
          observacao: "Troca por prioridade na Central do dia.",
          supervisor_id: sessao.id,
          epis_confirmados: "",
        },
        { perfil: sessao.perfil },
      );
      feitas.push({ rotinaId: cedida.rotina_id, statusAntes: antes?.status ?? "planejada", execucaoId: execucao.id });
    }
    return await updateRotina(proposta.rotina_id, {
      funcionario_id: proposta.funcionario_id,
      bloquearAlertas: true,
    });
  } catch (erro) {
    for (const f of feitas) {
      await ds.excluir("execucoes_realizadas", f.execucaoId);
      await ds.atualizar("rotinas_planejadas", f.rotinaId, { status: f.statusAntes });
    }
    throw erro;
  }
}
