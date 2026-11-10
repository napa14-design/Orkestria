import {
  coberturaPorHistorico,
  criticaNoDia,
  feriadoDoDia,
  fimPlanejadoMin,
  funcionarioNoDia,
  intervalosDoFuncionario,
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
import { agoraHHMM, diaDaSemana, hhmmParaMin, hojeISO, intervalosSobrepoem, minParaHHMM, somarDias } from "@/lib/dateUtils";
import { pendenciasDoDia } from "@/lib/pendencias";
import { avaliarCandidatos } from "@/lib/redistribuicao";
import {
  limitarSedeConsulta,
  podeAlterarSede,
  podeEscrever,
  sedesPermitidas,
  type SessaoUsuario,
} from "@/lib/permissions";
import { avisosDeRemanejo, lerRemanejo, textoDoRemanejo, type AvisoRemanejo } from "@/lib/remanejoAuto";
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
  RemanejoAuto,
  RotinaPlanejada,
  Tarefa,
} from "@/types";
import { ausenteEm, getAusencias } from "./ausenciasService";
import { ErroPermissao, ErroValidacao } from "./erros";
import { getExecucoes, registrarExecucao } from "./execucoesService";
import { getFuncionarios } from "./funcionariosService";
import { getLocais } from "./locaisService";
import { getRotaPadrao } from "./modelosService";
import { resolverParametros } from "./parametrosService";
import { getPeriodosLetivos } from "./periodosLetivosService";
import { getQualificacoes } from "./qualificacoesService";
import { getRotinasByData, updateRotina, type ResultadoRotina } from "./rotinasService";
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
 * Até onde o dia já passou, para "só o que ainda vem": hoje é agora; um dia futuro
 * está inteiro em aberto; um dia passado, inteiro fechado. A Central só olha hoje,
 * mas o remanejo automático roda também nos dias já gerados à frente (10/11/2026).
 */
function minutosJaPassados(data: string): number {
  const hoje = hojeISO();
  return data > hoje ? 0 : data === hoje ? minutosAgora() : Number.POSITIVE_INFINITY;
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
  /**
   * Só no horário que a tarefa já tem: nem "livre em outro horário", nem troca em
   * outro horário. O remanejo automático usa para a crítica sem janela e sem
   * "Qualquer horário" escolhido (decisão do dono, 10/11/2026).
   */
  soNoHorario?: boolean;
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

  const melhor = avaliarCandidatos({
    rotina,
    funcionarios,
    disponiveisIds,
    rotinasDoDia,
    tarefa,
    local,
    parametros,
    requisitosCatalogo,
    qualificacoes,
  })[0];
  const escolhido = melhor?.alertas.length === 0 ? melhor.funcionario : undefined;
  const origem = funcionarios.find((funcionario) => funcionario.id === rotina.funcionario_id);
  if (!escolhido) {
    // Ninguém livre no horário: alguém livre em OUTRO horário do dia, sem tirar
    // nada de ninguém, vem antes da troca (decisão do dono, 26/10/2026: "antes
    // de tirar uma baixa, procurar quem esteja livre em qualquer horário").
    // Tarefa de espera (café) não ocupa a pessoa: sem saber quais são, um café
    // no meio do buraco dava "não cabe" (auditoria, 26/10/2026). Saber custa ler
    // as tarefas da sede — então primeiro sem; só se ninguém couber E a troca
    // abaixo for ler essas tarefas de qualquer jeito (prioridade acima de
    // baixa), tenta de novo sabendo. Tarefa baixa com café no buraco cai na
    // troca, que erra para o lado seguro.
    const buscar = (tarefasEspera: Set<string>) =>
      livreEmOutroHorario({ ...args, tarefa, local, parametros, requisitosCatalogo, qualificacoes, inicioMin, tarefasEspera });
    let livre = args.soNoHorario ? undefined : buscar(new Set());
    if (!livre && !args.soNoHorario && !tarefa.espera && nivelPrioridade(tarefa, local, rotina.data) > 1)
      livre = buscar(
        new Set((await carregar("tarefas", () => getTarefas(rotina.sede_id))).filter((t) => t.espera).map((t) => t.id)),
      );
    if (livre)
      return {
        tipo: "redistribuir_rotina",
        rotina_id: rotina.id,
        sede_id: rotina.sede_id,
        funcionario_id: livre.funcionario.id,
        funcionario_nome: livre.funcionario.nome,
        funcionario_origem_nome: origem?.nome ?? "Pessoa indisponível",
        tarefa_nome: tarefa.nome_tarefa,
        inicio_planejado: minParaHHMM(livre.inicio),
        fim_planejado: minParaHHMM(livre.fim),
        inicio_original: rotina.inicio_planejado,
      };
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
 * Alguém com um buraco livre em outro horário do dia, que comporte a tarefa sem
 * conflito nem alerta. Inícios tentados: onde um buraco começa (a entrada, o fim
 * de cada bloco, o fim de cada intervalo), **agora** e o **início da janela da
 * tarefa**. Os dois últimos existem porque o
 * buraco que começou antes de agora — a pessoa ociosa desde cedo, com a falta
 * percebida no meio do turno — ficava invisível, e a Central cedia uma baixa à
 * toa (auditoria, 26/10/2026). Só o que ainda vem; o mais perto do horário
 * original ganha, depois quem está mais leve.
 */
function livreEmOutroHorario(a: {
  rotina: RotinaPlanejada;
  funcionarios: Funcionario[];
  disponiveisIds: Set<string>;
  rotinasDoDia: RotinaPlanejada[];
  tarefa: Tarefa;
  local: Local;
  parametros: ParametrosResolvidos;
  requisitosCatalogo: Requisito[];
  qualificacoes: QualificacaoFuncionario[];
  inicioMin: number;
  tarefasEspera: Set<string>;
}): { funcionario: Funcionario; inicio: number; fim: number } | undefined {
  const { rotina } = a;
  const agoraMin = minutosJaPassados(rotina.data);
  // "Agora" entra de dois jeitos: o próximo passo da grade, estável por um passo
  // inteiro, e o minuto exato — este SÓ quando o passo não cabe (o buraco curto
  // em andamento: 10:07, livre até 10:40, tarefa de 30 min). Com o minuto exato
  // sempre, a proposta vencia quando o relógio virava o minuto e o clique de
  // quem leu antes de confirmar era recusado (auditoria, 26/10/2026).
  const passo = a.parametros.bloco_agenda_min > 0 ? a.parametros.bloco_agenda_min : 15;
  const agoraNaGrade = Math.ceil(agoraMin / passo) * passo;
  const fixos = [
    agoraNaGrade,
    agoraMin,
    ...(a.tarefa.janela_inicio ? [hhmmParaMin(a.tarefa.janela_inicio)] : []),
  ];
  const opcoes = a.funcionarios
    .filter((f) => f.sede_id === rotina.sede_id && f.id !== rotina.funcionario_id && a.disponiveisIds.has(f.id))
    .flatMap((f) => {
      const existentes = a.rotinasDoDia.filter((r) => r.funcionario_id === f.id && r.id !== rotina.id);
      const efetivo = funcionarioNoDia(f, rotina.data);
      const jornada = jornadaLiquidaMin(efetivo);
      const carga = jornada > 0 ? tempoPlanejadoMin(existentes) / jornada : Infinity;
      const bordas = [
        ...fixos,
        hhmmParaMin(efetivo.entrada),
        ...existentes.filter(ocupaHorario).map((r) => hhmmParaMin(r.fim_planejado)),
        // O mesmo leitor da validação: aceita espaços no CSV e o trio antigo.
        ...intervalosDoFuncionario(efetivo).map((iv) => hhmmParaMin(iv.fim)),
      ];
      const daPessoa = [...new Set(bordas)]
        .filter((ini) => !Number.isNaN(ini) && ini !== a.inicioMin && ini >= agoraMin)
        .flatMap((ini) => {
          const fim = fimPlanejadoMin(ini, rotina.tempo_previsto_min);
          const alertas = validarAlocacao({
            funcionario: efetivo,
            rotinasExistentes: existentes,
            inicioMin: ini,
            fimMin: fim,
            tarefa: a.tarefa,
            local: a.local,
            parametros: a.parametros,
            tempoPrevistoNovo: rotina.tempo_previsto_min,
            requisitosCatalogo: a.requisitosCatalogo,
            qualificacoesFuncionario: a.qualificacoes.filter((q) => q.funcionario_id === f.id),
            data: rotina.data,
            tarefasEspera: a.tarefasEspera,
          });
          return alertas.length ? [] : [{ funcionario: f, inicio: ini, fim, deslocamento: Math.abs(ini - a.inicioMin), carga }];
        });
      // O minuto exato só vale se o passo da grade não coube para esta pessoa.
      return agoraMin !== agoraNaGrade && daPessoa.some((o) => o.inicio === agoraNaGrade)
        ? daPessoa.filter((o) => o.inicio !== agoraMin)
        : daPessoa;
    })
    .sort(
      (x, y) =>
        x.deslocamento - y.deslocamento ||
        x.carga - y.carga ||
        x.funcionario.nome.localeCompare(y.funcionario.nome, "pt-BR"),
    );
  return opcoes[0];
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
  soNoHorario?: boolean;
}): Promise<ResolucaoCentralDia | undefined> {
  const { rotina, tarefa, local } = a;
  // Tarefa de espera não disputa a pessoa: se não coube, o motivo é outro.
  if (tarefa.espera) return undefined;
  const nivelFalta = nivelPrioridade(tarefa, local, rotina.data);
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
    return t ? nivelPrioridade(t, localPorId.get(t.local_id), rotina.data) : NIVEL_CRITICA;
  };
  const agoraMin = minutosJaPassados(rotina.data);
  const tarefasEspera = new Set(tarefas.filter((t) => t.espera).map((t) => t.id));

  /** Pode ser cedido: planejado, sem realizado, ainda não começou e de prioridade menor. */
  const cedivel = (r: RotinaPlanejada) =>
    (r.status === "planejada" || r.status === "pendente") &&
    !a.execucoesPorRotina.has(r.id) &&
    // Só o que ainda não começou: ceder o que já passou gravaria
    // "remanejada" no que talvez tenha sido feito (revisão de segurança).
    hhmmParaMin(r.inicio_planejado) >= agoraMin &&
    nivelDe(r) < nivelFalta;

  const opcoes = a.funcionarios
    .filter(
      (f) => f.sede_id === rotina.sede_id && f.id !== rotina.funcionario_id && a.disponiveisIds.has(f.id),
    )
    .flatMap((f) => {
      const doDia = a.rotinasDoDia.filter(
        (r) => r.funcionario_id === f.id && r.id !== rotina.id && ocupaHorario(r),
      );
      const efetivo = funcionarioNoDia(f, rotina.data);
      const jornada = jornadaLiquidaMin(efetivo);
      // O horário da falta primeiro; depois, QUALQUER horário do dia que comece
      // num bloco cedível desta pessoa (26/10/2026, decisão do dono: "pode ser
      // qualquer horário"). Ex.: duas baixas às 10:00 que somam o tempo da
      // crítica das 08:00. A janela da tarefa (`janela_inicio/fim`) continua
      // valendo — quem confere é o `validarAlocacao`.
      const inicios = [
        a.inicioMin,
        ...(a.soNoHorario
          ? []
          : doDia
              .filter((r) => cedivel(r) && !tarefasEspera.has(r.tarefa_id))
              .map((r) => hhmmParaMin(r.inicio_planejado))
              .filter((m) => m !== a.inicioMin)),
      ];
      return [...new Set(inicios)].flatMap((ini) => {
        // Em outro horário, o fim é o que o `updateRotina` vai gravar (início +
        // tempo previsto): a janela validada aqui é a mesma que fica no banco.
        const fim = ini === a.inicioMin ? a.fimMin : fimPlanejadoMin(ini, rotina.tempo_previsto_min);
        const choques = doDia.filter(
          (r) =>
            !tarefasEspera.has(r.tarefa_id) &&
            intervalosSobrepoem(ini, fim, hhmmParaMin(r.inicio_planejado), hhmmParaMin(r.fim_planejado)),
        );
        if (choques.length === 0) return []; // sem choque e mesmo assim não coube: outro alerta
        if (!choques.every(cedivel)) return [];
        const ficam = doDia.filter((r) => !choques.includes(r));
        const alertas = validarAlocacao({
          funcionario: efetivo,
          rotinasExistentes: ficam,
          inicioMin: ini,
          fimMin: fim,
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
        return [
          {
            funcionario: f,
            inicio: ini,
            fim,
            choques,
            pior: Math.max(...choques.map(nivelDe)),
            minutosCedidos: choques.reduce((s, r) => s + (r.tempo_previsto_min || 0), 0),
            deslocamento: Math.abs(ini - a.inicioMin),
            carga: jornada > 0 ? tempoPlanejadoMin(ficam) / jornada : Infinity,
          },
        ];
      });
    })
    // Baixa antes de média; depois quem cede menos; depois o mais perto do
    // horário de origem (o mesmo horário ganha empate); depois quem está mais leve.
    .sort(
      (x, y) =>
        x.pior - y.pior ||
        x.minutosCedidos - y.minutosCedidos ||
        x.deslocamento - y.deslocamento ||
        x.carga - y.carga ||
        x.funcionario.nome.localeCompare(y.funcionario.nome, "pt-BR"),
    );

  const melhor = opcoes[0];
  if (!melhor) return undefined;
  const mudou = melhor.inicio !== a.inicioMin;
  return {
    tipo: "trocar_por_prioridade",
    rotina_id: rotina.id,
    sede_id: rotina.sede_id,
    funcionario_id: melhor.funcionario.id,
    funcionario_nome: melhor.funcionario.nome,
    funcionario_origem_nome: a.origemNome,
    tarefa_nome: tarefa.nome_tarefa,
    inicio_planejado: mudou ? minParaHHMM(melhor.inicio) : rotina.inicio_planejado,
    fim_planejado: mudou ? minParaHHMM(melhor.fim) : rotina.fim_planejado,
    ...(mudou ? { inicio_original: rotina.inicio_planejado } : {}),
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
 * visitada; no escopo de sede, confere só as tarefas de hoje, e as periódicas
 * ficam com a Agenda, que as calcula quando o coordenador entra para planejar.
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
  // O link leva a sede que a pessoa está vendo. Sem isto, a Rotina abria na
  // primeira sede da lista: quem via "o dia não foi montado" na Sul 3 podia gerar
  // o dia em outra sede (consulta de 04/11/2026; a maioria dos coordenadores opera várias).
  const naSede = (href: string) => (sedeId ? `${href}?sede=${encodeURIComponent(sedeId)}` : href);

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
  /** `null` = a cobertura do cadastro não foi conferida hoje (ver abaixo). */
  let foraDaAgenda: number | null = null;

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
      href: rotinasValidas.length > 0 ? naSede("/rotinas") : "/feriados",
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
          ? `“${resolucao!.tarefa_nome}” (${resolucao!.tarefa_prioridade}) era de ${resolucao!.funcionario_origem_nome}. Ninguém tem o horário livre: ${resolucao!.funcionario_nome} assume${resolucao!.inicio_original ? ` às ${resolucao!.inicio_planejado} (era às ${resolucao!.inicio_original})` : ""} e deixa ${cedidasTexto} para outro dia — fica registrado como remanejado, com o motivo.`
          : resolucao
            ? `“${resolucao.tarefa_nome}” era de ${resolucao.funcionario_origem_nome}.${resolucao.inicio_original ? ` Ninguém está livre às ${resolucao.inicio_original}: ${resolucao.funcionario_nome} faz às ${resolucao.inicio_planejado}, num horário livre, sem deixar nenhuma tarefa.` : ""} A alocação proposta não gera conflito, sobrecarga ou alerta cadastral.`
            : `${rotinasDeIndisponiveis.length} bloco(s) precisam de outra pessoa antes da execução.`,
        quantidade: rotinasDeIndisponiveis.length,
        href: naSede("/rotinas"),
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
                href: naSede("/rotinas"),
                acao: "Gerar o dia",
              }
            : {
                id: "sem-rota-padrao",
                nivel: "atencao",
                titulo: "Esta sede ainda não tem uma rota padrão",
                descricao: `${disponiveis.length} pessoa(s) disponíveis, mas não há de onde gerar o dia. Monte um dia na agenda e salve como rota padrão — a partir daí, montar o dia vira um clique.`,
                href: naSede("/rotinas"),
                acao: "Montar o primeiro dia",
              },
        );
      }
    }

    // A régua do painel de Pendências, para o "em ordem" não dizer o que não
    // conferiu. Só em dia útil: no sábado a rota é parcial e toda diária fora dela
    // pareceria falta. E sem as periódicas:
    // o vencimento delas leria 31 dias de blocos a cada abertura; ficam no painel.
    // E só sem decisão pendente antes: ler as tarefas da sede é custo, e com uma
    // falta para cobrir nada disto apareceria como a próxima ação.
    if (acoes.length === 0 && sedeId && podeCorrigirCadastro && rotinasValidas.length > 0 && [1, 2, 3, 4, 5].includes(diaDaSemana(data))) {
      const [tarefas, periodos] = await Promise.all([getTarefas(sedeId), getPeriodosLetivos({ sedeId })]);
      const { criticasSemCobertura, diariasFaltando, devidasHoje, letivasSemCalendario } = pendenciasDoDia({
        tarefas: tarefas.filter((t) => !coberturaPorHistorico(t)),
        rotinasDoDia: rotinasValidas,
        historico: [],
        data,
        periodos,
        ausentes: new Set(funcionariosAtivos.filter((f) => !disponiveisIds.has(f.id)).map((f) => f.id)),
      });
      // Só a crítica vira decisão. A diária fora da agenda é crônica na maioria das
      // sedes (medido em 04/11/2026): como ação, a Central nunca sairia dela.
      // Crítica letiva em sede sem calendário não é falta: ninguém sabe se hoje tem
      // aula, e alocar não resolveria. O painel da Agenda avisa do calendário.
      const semCalendario = new Set(letivasSemCalendario.map((t) => t.id));
      const criticas = criticasSemCobertura.filter((c) => !semCalendario.has(c.tarefa.id));
      foraDaAgenda = diariasFaltando.length + devidasHoje.length + criticasSemCobertura.length - criticas.length;
      if (criticas.length > 0) {
        acoes.push({
          id: "criticas-sem-bloco",
          nivel: "atencao",
          titulo: "Há tarefas críticas de hoje fora da agenda",
          descricao: `${criticas.length} tarefa(s) crítica(s) previstas para hoje não estão com ninguém: ${criticas
            .slice(0, 3)
            .map((c) => `“${c.tarefa.nome_tarefa}”`)
            .join(", ")}${criticas.length > 3 ? "…" : ""}.`,
          quantidade: criticas.length,
          href: naSede("/rotinas"),
          acao: "Ver pendências",
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
        href: naSede("/acompanhamento"),
        acao: "Confirmar realizado",
      });
    }
  }

  if (acoes.length === 0) {
    acoes.push({
      id: "dia-em-ordem",
      nivel: "ok",
      titulo:
        rotinasValidas.length === 0
          ? "Nenhuma operação está pendente hoje"
          : foraDaAgenda === 0
            ? "O dia está em ordem"
            : "Sem exceções abertas",
      descricao:
        rotinasValidas.length === 0
          ? "Não existe equipe disponível nem agenda que exija intervenção neste escopo."
          : foraDaAgenda
            ? `${foraDaAgenda} tarefa(s) do cadastro previstas para hoje estão fora da agenda. Não travam o dia, mas vale conferir se ainda existem.`
            : "Não há exceções abertas neste momento.",
      href: naSede("/rotinas"),
      acao: foraDaAgenda ? "Ver na agenda" : "Abrir agenda",
    });
  }

  const [proxima, ...fila] = acoes;
  // Os nomes das tarefas só são lidos quando há aviso: no dia comum, nada a mais.
  const comRemanejo = rotinas.filter((r) => r.remanejo_auto && ocupaHorario(r));
  const nomesDasTarefas = comRemanejo.length && sedeId ? new Map((await getTarefas(sedeId)).map((t) => [t.id, t.nome_tarefa])) : new Map<string, string>();
  const remanejos_auto = avisosDeRemanejo(
    comRemanejo,
    (id) => funcionarios.find((f) => f.id === id)?.nome ?? "Pessoa indisponível",
    (id) => nomesDasTarefas.get(id) ?? "Tarefa",
  );
  return {
    remanejos_auto,
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
  /**
   * O início que a tela mostrou. Com a troca em qualquer horário, duas janelas
   * da MESMA pessoa podem cortar as MESMAS cedidas: entre a tela e o clique a
   * proposta mudava de horário e passava (auditoria, 26/10/2026). Sem ele, só
   * vale a proposta no horário original da tarefa — essa não muda sem ser vista.
   */
  inicioVisto?: string,
) {
  if (!podeEscrever(sessao)) throw new ErroPermissao();
  const central = await getCentralDia(sessao, sedeSolicitada);
  const proposta = central.proxima.resolucao;
  const mesmasCedidas =
    [...(proposta?.cedidas ?? []).map((c) => c.rotina_id)].sort().join(",") ===
    [...cedidasIds].sort().join(",");
  const mesmoHorario =
    inicioVisto !== undefined ? proposta?.inicio_planejado === inicioVisto : !proposta?.inicio_original;
  if (
    !proposta ||
    proposta.rotina_id !== rotinaId ||
    proposta.funcionario_id !== funcionarioId ||
    !mesmasCedidas ||
    !mesmoHorario
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

  return (await aplicarResolucao(proposta, central.data, sessao)).resultado;
}

/**
 * Aplica uma proposta da Central. Primeiro libera o horário (remanejado, com o
 * motivo), depois move: ao contrário, a validação do `updateRotina` veria o choque
 * e recusaria. Se algo falhar, tudo volta — ninguém perde a tarefa numa troca que
 * não aconteceu (revisão de segurança).
 *
 * Com `auto`, é o remanejo automático da crítica de quem faltou (10/11/2026): o
 * bloco guarda de quem era (`titular_id`, como no "Feita por") e o que é preciso
 * para avisar e desfazer (`remanejo_auto`).
 */
async function aplicarResolucao(
  proposta: ResolucaoCentralDia,
  data: string,
  quem: Pick<SessaoUsuario, "id" | "perfil">,
): Promise<{ resultado: ResultadoRotina; rotina: RotinaPlanejada; cedidas: RemanejoAuto["cedidas"] }>;
async function aplicarResolucao(
  proposta: ResolucaoCentralDia,
  data: string,
  quem: Pick<SessaoUsuario, "id" | "perfil">,
  auto: DadosDoAuto,
): Promise<{ resultado: ResultadoRotina; rotina: RotinaPlanejada; cedidas: RemanejoAuto["cedidas"] } | null>;
async function aplicarResolucao(
  proposta: ResolucaoCentralDia,
  data: string,
  quem: Pick<SessaoUsuario, "id" | "perfil">,
  auto?: DadosDoAuto,
): Promise<{ resultado: ResultadoRotina; rotina: RotinaPlanejada; cedidas: RemanejoAuto["cedidas"] } | null> {
  const ds = await getDataSource();
  const agora = () => new Date().toISOString();
  const estavel = (s: RotinaPlanejada["status"]) => s === "planejada" || s === "pendente";

  // Remanejo automático: reserva a crítica ANTES de tudo, e só se ela ainda está
  // como foi lida — dois lançamentos ao mesmo tempo faziam a mesma cedida ganhar
  // dois registros "remanejada" (revisão de segurança, 10/11/2026). Quem perde a
  // corrida desiste em silêncio: o outro já cuidou.
  if (auto) {
    const reservada = await ds.atualizarSe(
      "rotinas_planejadas",
      proposta.rotina_id,
      (r) => r.funcionario_id === auto.de && (r.remanejo_auto ?? "") === auto.anterior && estavel(r.status),
      { remanejo_auto: JSON.stringify({ reservado_em: agora() }) },
    );
    if (!reservada) return null;
  }

  const feitas: (RemanejoAuto["cedidas"][number] & { statusAntes: RotinaPlanejada["status"] })[] = [];
  let moveu = false;
  try {
    for (const cedida of proposta.cedidas ?? []) {
      const antes = await ds.obter("rotinas_planejadas", cedida.rotina_id);
      const statusAntes = antes?.status ?? "planejada";
      // A cedida também: só se ainda está planejada. Ela fica "remanejada" aqui e o
      // registro abaixo confirma; outra chamada no meio do caminho já não a pega.
      if (auto) {
        const tomada = await ds.atualizarSe("rotinas_planejadas", cedida.rotina_id, (r) => estavel(r.status), { status: "remanejada" });
        if (!tomada) throw new DesistiuDoRemanejo();
        feitas.push({ rotina_id: cedida.rotina_id, execucao_id: "", status: statusAntes, statusAntes, tarefa_nome: cedida.tarefa_nome });
      }
      const execucao = await registrarExecucao(
        {
          rotina_id: cedida.rotina_id,
          data_execucao: data,
          status_realizado: "remanejada",
          inicio_real: "",
          fim_real: "",
          tempo_real_min: 0,
          justificativa: `Cedida para cobrir “${proposta.tarefa_nome}” (${proposta.tarefa_prioridade}), que era de ${proposta.funcionario_origem_nome}.`,
          observacao: auto ? "Remanejo automático da tarefa crítica." : "Troca por prioridade na Central do dia.",
          supervisor_id: quem.id,
          epis_confirmados: "",
        },
        { perfil: quem.perfil },
      );
      if (auto) feitas[feitas.length - 1].execucao_id = execucao.id;
      else feitas.push({ rotina_id: cedida.rotina_id, execucao_id: execucao.id, status: statusAntes, statusAntes, tarefa_nome: cedida.tarefa_nome });
    }
    const resultado = await updateRotina(proposta.rotina_id, {
      funcionario_id: proposta.funcionario_id,
      // Troca em outro horário: a tarefa vai para onde as cedidas abriram espaço.
      ...(proposta.inicio_original ? { inicio_planejado: proposta.inicio_planejado } : {}),
      bloquearAlertas: true,
    });
    moveu = true;
    const cedidas = feitas.map(({ rotina_id, execucao_id, status, tarefa_nome }) => ({ rotina_id, execucao_id, status, tarefa_nome }));
    const rotina = resultado.rotina;
    if (!auto) return { resultado, rotina, cedidas };
    const marca: RemanejoAuto = {
      de: auto.de,
      ...(auto.titularAntes ? { titular_antes: auto.titularAntes } : {}),
      ...(auto.anterior ? { anterior: auto.anterior } : {}),
      inicio: auto.inicioAntes,
      fim: auto.fimAntes,
      observacao: auto.observacaoAntes,
      cedidas,
      em: agora(),
    };
    // O dono original segue o titular: na segunda cobertura ele já estava lá.
    const titular = auto.titularAntes || auto.de;
    const observacao = [
      auto.observacaoAntes,
      `Coberta por ${proposta.funcionario_nome} — ${proposta.funcionario_origem_nome} ausente (remanejo automático)`,
    ]
      .filter(Boolean)
      .join(" · ");
    await ds.atualizar("rotinas_planejadas", proposta.rotina_id, {
      titular_id: titular,
      observacao,
      remanejo_auto: JSON.stringify(marca),
      atualizado_em: agora(),
    });
    return { resultado, rotina: { ...rotina, titular_id: titular, observacao, remanejo_auto: JSON.stringify(marca) }, cedidas };
  } catch (erro) {
    // Cada volta numa tentativa própria: uma falha aqui não pode deixar as outras
    // pela metade (revisão de segurança).
    if (auto)
      await tentar(async () => {
        const atual = await ds.obter("rotinas_planejadas", proposta.rotina_id);
        // Só volta se ainda é o que ESTE pedido deixou: outro pedido pode ter
        // gravado depois, e voltar passaria por cima dele.
        if (!atual) return;
        if (moveu && atual.funcionario_id === proposta.funcionario_id && estavel(atual.status))
          await ds.atualizar("rotinas_planejadas", proposta.rotina_id, {
            funcionario_id: auto.de,
            inicio_planejado: auto.inicioAntes,
            fim_planejado: auto.fimAntes,
            remanejo_auto: auto.anterior,
            atualizado_em: agora(),
          });
        else if (!moveu && atual.funcionario_id === auto.de)
          await ds.atualizar("rotinas_planejadas", proposta.rotina_id, { remanejo_auto: auto.anterior, atualizado_em: agora() });
      });
    for (const f of feitas)
      await tentar(async () => {
        if (f.execucao_id) await ds.excluir("execucoes_realizadas", f.execucao_id);
        // O registro pode ter sido gravado sem o id chegar aqui (falha depois de
        // gravar): a cedida estava planejada, então todo "remanejada" dela no dia é
        // deste pedido (revisão de segurança, como no "Feita por").
        else
          for (const e of await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: f.rotina_id }]))
            if (e.data_execucao === data && e.status_realizado === "remanejada") await ds.excluir("execucoes_realizadas", e.id);
        await ds.atualizar("rotinas_planejadas", f.rotina_id, { status: f.statusAntes });
      });
    if (erro instanceof DesistiuDoRemanejo) return null;
    throw erro;
  }
}

/** O que o remanejo automático precisa saber do bloco como ele foi lido. */
interface DadosDoAuto {
  /** De quem a tarefa sai agora (quem faltou). */
  de: string;
  titularAntes: string;
  /** A marca que o bloco tinha ("" = nenhuma): a reserva só vale se ainda for ela. */
  anterior: string;
  inicioAntes: string;
  fimAntes: string;
  observacaoAntes: string;
}

/** Outra chamada já pegou a cedida: este remanejo desiste e devolve o que reservou. */
class DesistiuDoRemanejo extends Error {}

async function tentar(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error("Remanejo automático: falha ao desfazer uma etapa", e);
  }
}

/** O coordenador desfez o remanejo deste bloco: o automático não o refaz. */
function desfeitoPeloCoordenador(r: Pick<RotinaPlanejada, "remanejo_auto">): boolean {
  if (!r.remanejo_auto) return false;
  try {
    const o = JSON.parse(r.remanejo_auto) as { desfeito_em?: string; desfeito_depois?: unknown };
    return !!o.desfeito_em || !!o.desfeito_depois;
  } catch {
    return false;
  }
}

/** A reserva que `aplicarResolucao` põe na crítica enquanto trabalha (ver acima). */
function reservaRecente(r: Pick<RotinaPlanejada, "remanejo_auto">): boolean {
  if (!r.remanejo_auto || lerRemanejo(r)) return false;
  try {
    const em = Date.parse((JSON.parse(r.remanejo_auto) as { reservado_em?: string }).reservado_em ?? "");
    // Uma reserva esquecida (o processo caiu no meio) não trava a tarefa para sempre.
    return Date.now() - em < 2 * 60_000;
  } catch {
    return false;
  }
}

export type RemanejoFeito = AvisoRemanejo;

/**
 * Passa sozinha para outra pessoa a tarefa CRÍTICA de quem faltou (pedido da
 * coordenação, 10/11/2026: "o sistema remaneja e apenas avisa quem assumiu a
 * tarefa no lugar de qual tarefa"). Mesmas regras da Central, aplicadas sem
 * perguntar: livre no horário, depois livre em outro horário, depois a troca por
 * prioridade. Qualquer alerta (requisito, gênero, sobrecarga) e a tarefa fica onde
 * está, destacada como hoje — decisão do dono.
 *
 * Roda ao lançar a ausência e ao gerar o dia. Só o que ainda vem; dia passado não.
 */
export async function remanejarCriticasDeAusentes(
  sedeId: string,
  data: string,
  quem: Pick<SessaoUsuario, "id" | "perfil">,
): Promise<RemanejoFeito[]> {
  if (data < hojeISO()) return [];
  const feitos: RemanejoFeito[] = [];
  const tentadas = new Set<string>();
  const carregar = criarCarregador();
  const [funcionarios, tarefas] = await Promise.all([getFuncionarios(sedeId), getTarefas(sedeId)]);
  const ativos = funcionarios.filter((f) => f.ativo);
  const nome = (id: string) => funcionarios.find((f) => f.id === id)?.nome ?? "Pessoa indisponível";
  const tarefaPorId = new Map(tarefas.map((t) => [t.id, t]));
  // Uma por vez, relendo o dia: cada remanejo muda a agenda de quem assumiu, e a
  // próxima proposta tem que ver isso. O limite só protege contra laço infinito.
  for (let volta = 0; volta < 50; volta++) {
    const [rotinas, execucoes, ausencias] = await Promise.all([
      getRotinasByData(data, sedeId),
      getExecucoes(data, data, sedeId),
      getAusencias({ data, sedeId }),
    ]);
    const ausentesIds = new Set(ausencias.map((a) => a.funcionario_id));
    const disponiveisIds = new Set(
      ativos.filter((f) => jornadaDoDia(f, data).trabalha && !ausentesIds.has(f.id)).map((f) => f.id),
    );
    const validas = rotinas.filter(ocupaHorario);
    const execucoesPorRotina = new Set(execucoes.map((e) => e.rotina_id));
    const passou = minutosJaPassados(data);
    const proxima = validas
      .filter(
        (r) =>
          ausentesIds.has(r.funcionario_id) &&
          !tentadas.has(r.id) &&
          (r.status === "planejada" || r.status === "pendente") &&
          !execucoesPorRotina.has(r.id) &&
          hhmmParaMin(r.inicio_planejado) >= passou &&
          !reservaRecente(r) &&
          !desfeitoPeloCoordenador(r) &&
          criticaNoDia(tarefaPorId.get(r.tarefa_id), data),
      )
      .sort((a, b) => a.inicio_planejado.localeCompare(b.inicio_planejado) || a.id.localeCompare(b.id))[0];
    if (!proxima) break;
    tentadas.add(proxima.id);
    const tarefa = tarefaPorId.get(proxima.tarefa_id);
    const proposta = await proporRedistribuicao({
      rotina: proxima,
      funcionarios: ativos,
      disponiveisIds,
      rotinasDoDia: validas,
      execucoesPorRotina,
      carregar,
      // Sem janela e sem "Qualquer horário" escolhido, o sistema não sabe se a hora
      // importa: troca a pessoa, nunca a hora. Com janela, a validação já a respeita.
      soNoHorario: !(tarefa?.janela_inicio && tarefa?.janela_fim) && tarefa?.qualquer_horario !== true,
    });
    if (!proposta) continue;
    // Uma falha num remanejo não pode derrubar quem chamou (a ausência já está
    // salva, e um erro na tela levaria a lançá-la de novo) nem os próximos.
    let aplicado: Awaited<ReturnType<typeof aplicarResolucao>> = null;
    try {
      aplicado = await aplicarResolucao(proposta, data, quem, {
        de: proxima.funcionario_id,
        titularAntes: proxima.titular_id ?? "",
        anterior: proxima.remanejo_auto ?? "",
        inicioAntes: proxima.inicio_planejado,
        fimAntes: proxima.fim_planejado,
        observacaoAntes: proxima.observacao ?? "",
      });
    } catch (e) {
      console.error("Remanejo automático: não foi possível remanejar", proxima.id, e);
    }
    if (!aplicado) continue;
    const { rotina, cedidas } = aplicado;
    feitos.push({
      rotina_id: rotina.id,
      data,
      em: lerRemanejo(rotina)?.em ?? "",
      texto: textoDoRemanejo({
        tarefa: proposta.tarefa_nome,
        de: nome(proxima.funcionario_id),
        para: proposta.funcionario_nome,
        inicio: rotina.inicio_planejado,
        inicioAntes: proxima.inicio_planejado,
        cedidas: cedidas.map((c) => c.tarefa_nome),
      }),
    });
  }
  return feitos;
}

/**
 * Ao lançar (ou mudar) uma ausência: o remanejo automático em cada dia dela que
 * já tem agenda, de hoje em diante. Férias de um mês não leem 30 dias à toa: só
 * as datas em que a pessoa tem bloco.
 */
export async function remanejarCriticasDaAusencia(
  ausencia: { funcionario_id: string; data_inicio: string; data_fim: string },
  quem: Pick<SessaoUsuario, "id" | "perfil">,
): Promise<RemanejoFeito[]> {
  const ds = await getDataSource();
  const funcionario = await ds.obter("funcionarios", ausencia.funcionario_id);
  if (!funcionario) return [];
  const hoje = hojeISO();
  const de = ausencia.data_inicio > hoje ? ausencia.data_inicio : hoje;
  const feitos: RemanejoFeito[] = [];
  // Até 31 dias à frente (a agenda raramente é gerada além disso; o resto a geração
  // cuida). Contar custa uma leitura por dia; ler todos os blocos da pessoa custava
  // o histórico inteiro dela (revisão de segurança: leitura é custo no Blaze).
  for (let d = de, n = 0; d <= ausencia.data_fim && n < 31; d = somarDias(d, 1), n++) {
    try {
      const temAgenda = await ds.contar("rotinas_planejadas", [
        { campo: "sede_id", op: "==", valor: funcionario.sede_id },
        { campo: "data", op: "==", valor: d },
      ]);
      if (temAgenda > 0) feitos.push(...(await remanejarCriticasDeAusentes(funcionario.sede_id, d, quem)));
    } catch (e) {
      console.error("Remanejo automático: falhou no dia", d, e);
    }
  }
  return feitos;
}

/**
 * Desfaz um remanejo automático: a tarefa volta para quem faltou, no horário de
 * antes, e o que o colega tinha cedido volta a ser dele. Recusa se a tarefa já tem
 * realizado — aí o que aconteceu é fato, não plano.
 */
export async function desfazerRemanejoAutomatico(sessao: SessaoUsuario, rotinaId: string): Promise<RotinaPlanejada> {
  if (!podeEscrever(sessao)) throw new ErroPermissao();
  const ds = await getDataSource();
  const rotina = await ds.obter("rotinas_planejadas", rotinaId);
  if (!rotina) throw new ErroValidacao([{ nivel: "erro", codigo: "NAO_ENCONTRADA", mensagem: "Tarefa não encontrada." }]);
  if (!podeAlterarSede(sessao, rotina.sede_id))
    throw new ErroPermissao("Coordenadores só redistribuem tarefas das sedes que operam.");
  const marca = lerRemanejo(rotina);
  if (!marca)
    throw new ErroValidacao([{ nivel: "erro", codigo: "SEM_REMANEJO", mensagem: "Esta tarefa não foi remanejada automaticamente." }]);
  if (!(await podeVoltar(rotina)))
    throw new ErroValidacao([
      { nivel: "erro", codigo: "JA_REGISTRADA", mensagem: "Esta tarefa já tem realizado registrado — não dá para desfazer o remanejo." },
    ]);
  // O desfazer do coordenador FICA: sem esta nota, a próxima falta lançada ou a
  // próxima geração do dia refaziam o remanejo que ele acabou de desfazer (auditoria).
  return voltarUmPasso(rotina, marca, { desfeito_em: new Date().toISOString(), por: sessao.id });
}

/**
 * A ausência foi apagada ou encurtada: nos dias em que a pessoa não falta mais, o
 * remanejo automático das críticas dela é desfeito sozinho (decisão do dono,
 * 10/11/2026), para o aviso não dizer "(ausente)" de quem veio trabalhar. Este
 * desfazer não fixa nada: se a falta voltar, o automático remaneja de novo.
 */
export async function desfazerRemanejosSemFalta(funcionarioId: string, de: string, ate: string): Promise<number> {
  const ds = await getDataSource();
  const funcionario = await ds.obter("funcionarios", funcionarioId);
  if (!funcionario) return 0;
  const hoje = hojeISO();
  let desfeitos = 0;
  for (let d = de > hoje ? de : hoje, n = 0; d <= ate && n < 31; d = somarDias(d, 1), n++) {
    try {
      if (await ausenteEm(funcionarioId, d)) continue; // ainda falta neste dia
      const temAgenda = await ds.contar("rotinas_planejadas", [
        { campo: "sede_id", op: "==", valor: funcionario.sede_id },
        { campo: "data", op: "==", valor: d },
      ]);
      if (!temAgenda) continue;
      // Só o que ainda vem, a mesma régua do remanejo: a manhã já passou como
      // ficou, e devolver a cedida faria o colega ser cobrado por ela (auditoria).
      const passou = minutosJaPassados(d);
      for (const r of await getRotinasByData(d, funcionario.sede_id)) {
        const marca = lerRemanejo(r);
        // Nem para o horário de antes, se ele já passou: voltaria como tarefa perdida (segurança).
        if (
          marca?.de !== funcionarioId ||
          hhmmParaMin(r.inicio_planejado) < passou ||
          hhmmParaMin(marca.inicio) < passou ||
          !(await podeVoltar(r))
        )
          continue;
        await voltarUmPasso(r, marca, null);
        desfeitos++;
      }
    } catch (e) {
      console.error("Remanejo automático: não foi possível desfazer no dia", d, e);
    }
  }
  return desfeitos;
}

/** Só volta o que ainda é plano: sem realizado registrado e ainda planejado. */
async function podeVoltar(rotina: RotinaPlanejada): Promise<boolean> {
  const ds = await getDataSource();
  const registros = await ds.consultar("execucoes_realizadas", [{ campo: "rotina_id", op: "==", valor: rotina.id }]);
  return registros.length === 0 && (rotina.status === "planejada" || rotina.status === "pendente");
}

/**
 * Volta um passo do remanejo: a tarefa para quem ela saiu, no horário e com a
 * observação de antes, e as cedidas para o colega. `fixar` deixa a nota de
 * "desfeito" (o automático não refaz); `null` volta sem nota.
 */
async function voltarUmPasso(
  rotina: RotinaPlanejada,
  marca: RemanejoAuto,
  fixar: { desfeito_em: string; por: string } | null,
): Promise<RotinaPlanejada> {
  const ds = await getDataSource();
  const fim = marca.fim ?? minParaHHMM(hhmmParaMin(marca.inicio) + (rotina.tempo_previsto_min || 0));
  const marcaQueVolta = marca.anterior
    ? fixar
      ? JSON.stringify({ ...JSON.parse(marca.anterior), desfeito_depois: fixar })
      : marca.anterior
    : fixar
      ? JSON.stringify(fixar)
      : "";
  const agora = new Date().toISOString();
  await ds.atualizar("rotinas_planejadas", rotina.id, {
    funcionario_id: marca.de,
    inicio_planejado: marca.inicio,
    fim_planejado: fim,
    titular_id: marca.titular_antes ?? "",
    observacao: marca.observacao,
    remanejo_auto: marcaQueVolta,
    atualizado_em: agora,
  });
  // As cedidas voltam só se ainda estão como o remanejo deixou: quem mexeu nelas
  // depois decidiu outra coisa, e o desfazer não passa por cima.
  for (const c of marca.cedidas) {
    const cedida = await ds.obter("rotinas_planejadas", c.rotina_id);
    const registro = c.execucao_id ? await ds.obter("execucoes_realizadas", c.execucao_id) : null;
    // Só a cedida do MESMO dia e sede, com o registro que é dela: uma marca que
    // escapasse para outro dia não pode apagar o realizado de lá.
    if (
      !cedida ||
      cedida.data !== rotina.data ||
      cedida.sede_id !== rotina.sede_id ||
      cedida.status !== "remanejada" ||
      !registro ||
      registro.rotina_id !== c.rotina_id ||
      registro.status_realizado !== "remanejada"
    )
      continue;
    await ds.excluir("execucoes_realizadas", c.execucao_id);
    await ds.atualizar("rotinas_planejadas", c.rotina_id, { status: c.status as RotinaPlanejada["status"], atualizado_em: agora });
  }
  return {
    ...rotina,
    funcionario_id: marca.de,
    inicio_planejado: marca.inicio,
    fim_planejado: fim,
    titular_id: marca.titular_antes ?? "",
    observacao: marca.observacao,
    remanejo_auto: marcaQueVolta,
  };
}
