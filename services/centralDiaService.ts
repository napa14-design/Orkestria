import { jornadaDoDia } from "@/lib/calculations";
import { hhmmParaMin, hojeISO, somarDias } from "@/lib/dateUtils";
import { calcularPendenciasCobertura, type PendenciasCobertura } from "@/lib/pendenciasCobertura";
import type { SessaoUsuario } from "@/lib/permissions";
import type { CentralDiaDados, ItemCentralDia, ItemProntidaoSede, ItemSaudeCadastro } from "@/types";
import { getAusencias } from "./ausenciasService";
import { getExecucoes } from "./execucoesService";
import { getFuncionarios } from "./funcionariosService";
import { getLocais } from "./locaisService";
import { getPeriodosLetivos } from "./periodosLetivosService";
import { getQualificacoes } from "./qualificacoesService";
import { getRotinasByData, getRotinasPeriodo } from "./rotinasService";
import { getSedes } from "./sedesService";
import { getTarefas } from "./tarefasService";
import { getUsuarios } from "./usuariosService";

function sedeDoEscopo(sessao: SessaoUsuario): string | undefined {
  if (sessao.perfil !== "supervisor" || sessao.sede_id === "geral") return undefined;
  return sessao.sede_id;
}

/** Consolida somente dados de leitura para a fila operacional da página inicial. */
export async function getCentralDia(sessao: SessaoUsuario): Promise<CentralDiaDados> {
  const data = hojeISO();
  const sedeId = sedeDoEscopo(sessao);
  const coberturaCalculada = Boolean(sedeId);

  const [
    sedes,
    funcionarios,
    locais,
    tarefas,
    rotinas,
    historico,
    execucoes,
    ausencias,
    qualificacoes,
    periodos,
    usuarios,
  ] = await Promise.all([
    getSedes(),
    getFuncionarios(sedeId),
    getLocais(sedeId),
    getTarefas(sedeId),
    getRotinasByData(data, sedeId),
    // Cobertura periódica é operacional e só faz sentido por sede. No escopo
    // global, esta consulta leria 31 dias de todas as unidades a cada /inicio.
    sedeId
      ? getRotinasPeriodo(somarDias(data, -31), somarDias(data, -1), sedeId)
      : Promise.resolve([]),
    getExecucoes(data, data, sedeId),
    getAusencias({ data, sedeId }),
    getQualificacoes(sedeId),
    sedeId ? getPeriodosLetivos({ sedeId }) : Promise.resolve([]),
    sessao.perfil === "administrador" ? getUsuarios() : Promise.resolve([]),
  ]);

  const funcionariosAtivos = funcionarios.filter((f) => f.ativo);
  const ausentesIds = new Set(ausencias.map((a) => a.funcionario_id));
  const funcionariosDisponiveis = funcionariosAtivos.filter(
    (f) => jornadaDoDia(f, data).trabalha && !ausentesIds.has(f.id),
  );
  const rotinasValidas = rotinas.filter((r) => r.status !== "cancelada");
  const rotinasDeAusentes = rotinasValidas.filter((r) =>
    ausentesIds.has(r.funcionario_id),
  );
  const rotinasCobertas = rotinasValidas.filter(
    (r) => !ausentesIds.has(r.funcionario_id),
  );
  const pendenciasCobertura: PendenciasCobertura = coberturaCalculada
    ? calcularPendenciasCobertura({
        tarefas,
        rotinasDoDia: rotinasCobertas,
        historico,
        data,
        periodos,
      })
    : {
        criticasSemCobertura: [],
        diariasFaltando: [],
        devidasHoje: [],
        periodicasVencidas: [],
        letivasSemCalendario: [],
      };
  const totalCobertura =
    pendenciasCobertura.criticasSemCobertura.length +
    pendenciasCobertura.diariasFaltando.length +
    pendenciasCobertura.devidasHoje.length +
    pendenciasCobertura.periodicasVencidas.length;
  const execucoesPorRotina = new Set(execucoes.map((e) => e.rotina_id));
  const aguardandoRealizado = rotinasValidas.filter(
    (r) => !execucoesPorRotina.has(r.id),
  ).length;

  const rotinasHref = `/rotinas?data=${data}${sedeId ? `&sede=${encodeURIComponent(sedeId)}` : ""}`;
  const prioridades: ItemCentralDia[] = [];
  const sede = sedeId ? sedes.find((item) => item.id === sedeId) : undefined;
  const sedesIds = new Set(sedes.map((item) => item.id));
  const usuariosComSedeInvalida = usuarios.filter(
    (usuario) =>
      usuario.ativo &&
      usuario.sede_id !== "geral" &&
      !sedesIds.has(usuario.sede_id),
  );

  if (sedeId && !sede) {
    prioridades.push({
      id: "sede-da-conta-invalida",
      nivel: "critico",
      titulo: "A sede vinculada à sua conta não existe",
      descricao: "O administrador precisa atualizar seu vínculo de sede antes que a Central consiga mostrar a equipe e a agenda corretas.",
      quantidade: 1,
      href: "/conta",
      acao: "Ver minha conta",
    });
  }
  if (usuariosComSedeInvalida.length > 0) {
    prioridades.push({
      id: "usuarios-com-sede-invalida",
      nivel: "critico",
      titulo: "Contas apontam para sedes inexistentes",
      descricao: `${usuariosComSedeInvalida.length} conta(s) ativa(s) não conseguem receber o escopo correto até que o vínculo seja atualizado.`,
      quantidade: usuariosComSedeInvalida.length,
      href: "/usuarios?filtro=sede_invalida",
      acao: "Corrigir contas",
    });
  }

  if (pendenciasCobertura.criticasSemCobertura.length > 0) {
    prioridades.push({
      id: "circuito-essencial",
      nivel: "critico",
      titulo: "Circuito essencial descoberto",
      descricao: `${pendenciasCobertura.criticasSemCobertura.length} tarefa(s) crítica(s) ainda precisam de responsável disponível.`,
      quantidade: pendenciasCobertura.criticasSemCobertura.length,
      href: rotinasHref,
      acao: "Cobrir agora",
    });
  }
  if (rotinasDeAusentes.length > 0) {
    prioridades.push({
      id: "agenda-de-ausentes",
      nivel: "critico",
      titulo: "Agenda atribuída a pessoa ausente",
      descricao: `${rotinasDeAusentes.length} bloco(s) precisam ser redistribuídos antes do início da execução.`,
      quantidade: rotinasDeAusentes.length,
      href: rotinasHref,
      acao: "Redistribuir",
    });
  }
  if (rotinasValidas.length === 0 && funcionariosDisponiveis.length > 0) {
    prioridades.push({
      id: "dia-sem-planejamento",
      nivel: "atencao",
      titulo: "O dia ainda não foi montado",
      descricao: `${funcionariosDisponiveis.length} pessoa(s) estão disponíveis, mas nenhuma rotina foi planejada.`,
      href: rotinasHref,
      acao: "Montar o dia",
    });
  }
  const coberturaNaoCritica =
    pendenciasCobertura.diariasFaltando.length +
    pendenciasCobertura.devidasHoje.length +
    pendenciasCobertura.periodicasVencidas.length;
  if (coberturaNaoCritica > 0) {
    prioridades.push({
      id: "cobertura-pendente",
      nivel: "atencao",
      titulo: "Tarefas esperadas ficaram de fora",
      descricao: `${coberturaNaoCritica} tarefa(s) diária(s), de dia fixo ou periódica(s) ainda não aparecem na agenda.`,
      quantidade: coberturaNaoCritica,
      href: rotinasHref,
      acao: "Completar agenda",
    });
  }
  if (ausencias.length > 0 && rotinasDeAusentes.length === 0) {
    prioridades.push({
      id: "ausencias",
      nivel: "informativo",
      titulo: "Equipe reduzida hoje",
      descricao: `${ausencias.length} ausência(s) registrada(s); a agenda atual não deixou blocos atribuídos a essas pessoas.`,
      quantidade: ausencias.length,
      href: "/ausencias",
      acao: "Ver ausências",
    });
  }
  if (aguardandoRealizado > 0 && rotinasValidas.length > 0) {
    prioridades.push({
      id: "realizado-pendente",
      nivel: "informativo",
      titulo: "Realizado ainda não lançado",
      descricao: `${aguardandoRealizado} de ${rotinasValidas.length} bloco(s) planejados ainda aguardam conferência.`,
      quantidade: aguardandoRealizado,
      href: "/acompanhamento",
      acao: "Atualizar realizado",
    });
  }
  if (prioridades.length === 0) {
    prioridades.push({
      id: "dia-em-ordem",
      nivel: "ok",
      titulo: "Operação em ordem",
      descricao: "Não há exceções operacionais abertas para o escopo de hoje.",
      href: rotinasHref,
      acao: "Abrir agenda",
    });
  }

  const locaisSemMetragem = locais.filter((l) => l.ativo && (!l.metragem || l.metragem <= 0));
  const tarefasSemCategoria = tarefas.filter((t) => t.ativo && !t.categoria_id);
  const tarefasSemTempo = tarefas.filter(
    (t) => t.ativo && (t.tempo_base_min <= 0 || (t.regra_calculo === "por_unidade" && t.quantidade <= 0)),
  );
  const funcionariosSemJornada = funcionariosAtivos.filter((f) => {
    const entrada = hhmmParaMin(f.entrada);
    const saida = hhmmParaMin(f.saida);
    return !Number.isFinite(entrada) || !Number.isFinite(saida) || saida <= entrada;
  });
  const qualificacoesVencidas = qualificacoes.filter(
    (q) => q.validade && q.validade < data,
  );
  const limiteValidade = somarDias(data, 30);
  const qualificacoesAVencer = qualificacoes.filter(
    (q) => q.validade && q.validade >= data && q.validade <= limiteValidade,
  );

  const itensSaude: ItemSaudeCadastro[] = [
    {
      id: "sede-da-conta-invalida",
      titulo: "Vínculo de sede da conta inválido",
      descricao: "Peça ao administrador para associar esta conta a uma sede existente.",
      quantidade: sedeId && !sede ? 1 : 0,
      href: "/conta",
    },
    {
      id: "usuarios-com-sede-invalida",
      titulo: "Contas com sede inexistente",
      descricao: "Esses usuários ficam sem equipe e agenda até a correção do vínculo.",
      quantidade: usuariosComSedeInvalida.length,
      href: "/usuarios?filtro=sede_invalida",
    },
    {
      id: "locais-sem-metragem",
      titulo: "Locais sem metragem",
      descricao: "Afetam o cálculo das tarefas por m².",
      quantidade: locaisSemMetragem.length,
      href: "/locais?filtro=sem_metragem",
    },
    {
      id: "tarefas-sem-categoria",
      titulo: "Tarefas sem categoria",
      descricao: "Dificultam filtros, leitura da agenda e análise.",
      quantidade: tarefasSemCategoria.length,
      href: "/tarefas?filtro=sem_categoria",
    },
    {
      id: "tarefas-sem-tempo",
      titulo: "Tarefas sem tempo válido",
      descricao: "Não podem gerar uma previsão confiável.",
      quantidade: tarefasSemTempo.length,
      href: "/tarefas?filtro=sem_tempo",
    },
    {
      id: "funcionarios-sem-jornada",
      titulo: "Jornadas incompletas",
      descricao: "Impedem o cálculo de capacidade e o encaixe automático.",
      quantidade: funcionariosSemJornada.length,
      href: "/funcionarios?filtro=sem_jornada",
    },
    {
      id: "qualificacoes-vencidas",
      titulo: "Qualificações vencidas",
      descricao: "Bloqueiam tarefas que exigem a habilitação.",
      quantidade: qualificacoesVencidas.length,
      href: "/qualificacoes?filtro=vencidas",
    },
    {
      id: "qualificacoes-a-vencer",
      titulo: "Qualificações vencendo em 30 dias",
      descricao: "Antecipe a renovação antes de afetar a escala.",
      quantidade: qualificacoesAVencer.length,
      href: "/qualificacoes?filtro=vencendo",
    },
    {
      id: "calendario-ausente",
      titulo: "Calendário acadêmico ausente",
      descricao: "Tarefas letivas podem ser cobradas em períodos incorretos.",
      quantidade: pendenciasCobertura.letivasSemCalendario.length > 0 ? 1 : 0,
      href: "/periodos-letivos",
    },
  ].filter((item) => item.quantidade > 0);

  const pendenciasSaude = itensSaude.reduce((total, item) => total + item.quantidade, 0);
  const baseSaude = Math.max(
    1,
    locais.filter((l) => l.ativo).length +
      tarefas.filter((t) => t.ativo).length +
      funcionariosAtivos.length +
      qualificacoes.length +
      usuarios.filter((usuario) => usuario.ativo).length,
  );
  const indiceCalculado = Math.max(0, Math.round(100 - (pendenciasSaude / baseSaude) * 100));
  const indiceSaude = pendenciasSaude > 0 ? Math.min(99, indiceCalculado) : 100;
  const sedesAtivas = sedeId ? (sede?.ativo ? 1 : 0) : sedes.filter((item) => item.ativo).length;
  const locaisAtivos = locais.filter((item) => item.ativo).length;
  const tarefasAtivas = tarefas.filter((item) => item.ativo && item.tempo_base_min > 0).length;
  const jornadasValidas = funcionariosAtivos.filter((funcionario) => {
    const entrada = hhmmParaMin(funcionario.entrada);
    const saida = hhmmParaMin(funcionario.saida);
    return Number.isFinite(entrada) && Number.isFinite(saida) && saida > entrada;
  }).length;
  const itensProntidao: ItemProntidaoSede[] = [
    {
      id: "sede",
      titulo: sedeId ? "Sede vinculada" : "Sedes ativas",
      descricao: sedesAtivas > 0 ? `${sedesAtivas} estrutura(s) disponível(is).` : "Cadastre ou reative a estrutura principal.",
      quantidade: sedesAtivas,
      concluida: sedesAtivas > 0,
      href: "/sedes",
      acao: sedesAtivas > 0 ? "Revisar" : "Cadastrar sede",
    },
    {
      id: "locais",
      titulo: "Locais de trabalho",
      descricao: locaisAtivos > 0 ? `${locaisAtivos} ambiente(s) pronto(s) para receber tarefas.` : "Cadastre o primeiro ambiente da sede.",
      quantidade: locaisAtivos,
      concluida: locaisAtivos > 0,
      href: "/locais",
      acao: locaisAtivos > 0 ? "Preparar kits" : "Cadastrar local",
    },
    {
      id: "tarefas",
      titulo: "Tarefas utilizáveis",
      descricao: tarefasAtivas > 0 ? `${tarefasAtivas} tarefa(s) ativa(s) com tempo previsto.` : "Use um kit de local ou cadastre a primeira tarefa.",
      quantidade: tarefasAtivas,
      concluida: tarefasAtivas > 0,
      href: locaisAtivos > 0 && tarefasAtivas === 0 ? "/locais" : "/tarefas",
      acao: tarefasAtivas > 0 ? "Revisar" : locaisAtivos > 0 ? "Usar um kit" : "Cadastrar tarefa",
    },
    {
      id: "equipe",
      titulo: "Equipe com jornada",
      descricao: jornadasValidas > 0 ? `${jornadasValidas} pessoa(s) com capacidade calculável.` : "Cadastre a equipe e seus horários básicos.",
      quantidade: jornadasValidas,
      concluida: jornadasValidas > 0,
      href: "/funcionarios",
      acao: jornadasValidas > 0 ? "Revisar" : "Cadastrar equipe",
    },
  ];
  const etapasConcluidas = itensProntidao.filter((item) => item.concluida).length;
  const prontaParaPlanejar = etapasConcluidas === itensProntidao.length;
  return {
    data,
    atualizado_em: new Date().toISOString(),
    escopo: {
      sede_id: sedeId ?? "geral",
      nome: sede?.nome_sede ?? (sedeId ? "Sede vinculada não encontrada" : "Todas as sedes"),
    },
    resumo: {
      funcionarios_ativos: funcionariosAtivos.length,
      funcionarios_disponiveis: funcionariosDisponiveis.length,
      ausencias: ausencias.length,
      rotinas_planejadas: rotinasValidas.length,
      realizados_registrados: execucoes.length,
      aguardando_realizado: aguardandoRealizado,
      cobertura_pendente: totalCobertura,
      cobertura_calculada: coberturaCalculada,
    },
    prioridades,
    saude: {
      indice: indiceSaude,
      pendencias: pendenciasSaude,
      itens: itensSaude,
    },
    prontidao: {
      indice: Math.round((etapasConcluidas / itensProntidao.length) * 100),
      concluidas: etapasConcluidas,
      total: itensProntidao.length,
      pronta_para_planejar: prontaParaPlanejar,
      itens: itensProntidao,
    },
    configuracao_inicial: !prontaParaPlanejar,
  };
}
