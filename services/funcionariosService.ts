import { agoraISO, getDataSource, LoteMudou, novoId, type OperacaoLote } from "@/lib/datasource";
import { hhmmParaMin, hojeISO, minParaHHMM, parseDiasSemana } from "@/lib/dateUtils";
import { mapaFatorDoTipo } from "./tiposLocalService";
import { tempoPrevistoMin } from "@/lib/calculations";
import { rotaNoHorario } from "@/lib/rotaNoHorario";
import {
  comAtivoDoDia,
  MOTIVO_SAIU_DO_POSTO,
  MOTIVO_TRANSFERENCIA,
  motivoAbreVaga,
  pedidoDeVaga,
  validarDataDeSaida,
  validarDesligamento,
} from "@/lib/desligamento";
import { ehAsg, idDoEvento, montarEvento, SEDE_SETOR } from "@/lib/eventosQuadro";
import { csvDoTrio, sincronizarTrio } from "@/lib/intervalos";
import { normalizarMatricula } from "@/lib/quadroInfra";
import { normalizarEmpresa } from "@/lib/empresas";
import { minhaChave } from "@/lib/chaves";
import { validarFuncionario, temErro } from "@/lib/validations";
import type { EventoQuadro, Funcionario, Local, ModeloRotinaItem, RotinaPlanejada, Sede, Tarefa } from "@/types";
import { exigirEmpresaDoCadastro } from "./empresasService";
import { ErroConflito, ErroValidacao } from "./erros";

type Ds = Awaited<ReturnType<typeof getDataSource>>;

/** A operação de lote que grava um evento do Quadro (`lib/eventosQuadro.ts`). */
const criarEvento = (evento: EventoQuadro): OperacaoLote => ({ tipo: "criar", tabela: "eventos_quadro", registro: evento });

/**
 * ⚠️ O bloco só sai se continua como foi lido (status + `atualizado_em`). Excluir pela leitura
 * apagava o bloco que o supervisor confirmara no meio do caminho e deixava a execução órfã
 * (auditoria, 19/11/2026). Registrar o realizado sempre muda os dois.
 */
const excluirBlocoComoLido = (b: RotinaPlanejada): OperacaoLote => ({
  tipo: "excluir",
  tabela: "rotinas_planejadas",
  id: b.id,
  seAinda: (a) => {
    const atual = a as RotinaPlanejada;
    return atual.status === b.status && (atual.atualizado_em ?? "") === (b.atualizado_em ?? "");
  },
});

/**
 * Lê, monta e grava de novo quando um bloco mudou entre a leitura e o lote (`LoteMudou`:
 * nada foi gravado). Na releitura o bloco confirmado já não é "só planejado" e fica.
 */
async function comReleitura<T>(fazer: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fazer();
    } catch (e) {
      if (!(e instanceof LoteMudou)) throw e;
      if (tentativa === 3)
        throw new ErroConflito("A agenda desta pessoa está mudando agora (alguém registrando o realizado?). Nada foi gravado; tente de novo em instantes.");
    }
  }
}

type DadosFuncionario = Omit<
  Funcionario,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

export async function getFuncionarios(sedeId?: string): Promise<Funcionario[]> {
  const ds = await getDataSource();
  const lista = sedeId
    ? await ds.consultar("funcionarios", [{ campo: "sede_id", op: "==", valor: sedeId }])
    : await ds.listar("funcionarios");
  // Desligado cuja data já chegou sai como inativo para TODAS as telas, sem
  // nenhuma delas precisar conhecer o desligamento (ver `comAtivoDoDia`).
  const hoje = hojeISO();
  return lista.map((f) => comAtivoDoDia(f, hoje));
}

/**
 * Uma matrícula, um cadastro. Era livre, e é por ela que o Quadro da Infra acha
 * a pessoa: duas fichas com a mesma matrícula apontariam para a mesma pessoa de
 * lá (revisão de segurança, 23/10/2026). Cada empresa numera a sua, então só
 * colide com empresa igual — ou quando um dos dois ainda não tem empresa — e só
 * entre cadastros não desligados. A mensagem não diz quem nem onde.
 */
export async function exigirMatriculaLivre(matricula: string, empresa: string | undefined, exceto?: string) {
  if (!matricula) return;
  const ds = await getDataSource();
  const mesmas = await ds.consultar("funcionarios", [{ campo: "matricula", op: "==", valor: matricula }]);
  // Desligado não segura a matrícula: transferir é desligar numa sede e
  // cadastrar de novo na outra, com a mesma matrícula (auditoria, 23/10/2026).
  // Empresa comparada pela forma padrão (a do Chromos): "APEL - MATRIZ", "Apel-Matriz"
  // e "Apél​ Matriz" são a mesma, e passavam a mesma matrícula seis vezes (revisão de
  // segurança, 13/11/2026).
  const alvo = normalizarEmpresa(empresa);
  if (mesmas.some((o) => o.id !== exceto && !o.desligado_em && (!normalizarEmpresa(o.empresa) || !alvo || normalizarEmpresa(o.empresa) === alvo)))
    throw new ErroValidacao([
      { nivel: "erro", codigo: "MATRICULA_REPETIDA", mensagem: "Esta matrícula já está em outro cadastro." },
    ]);
}

/**
 * Dados do RH limpos, com a empresa na forma padrão do Chromos ("APEL MATRIZ") — é
 * assim que ela é gravada e é assim que vai para lá. Só os que vieram: a edição
 * manda parte da ficha.
 */
function dadosDoRh(d: Partial<Funcionario>): Partial<Pick<Funcionario, "nome_completo" | "empresa" | "data_admissao">> {
  const limpo = (v: unknown) => String(v ?? "").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();
  return {
    ...(d.nome_completo !== undefined ? { nome_completo: limpo(d.nome_completo) } : {}),
    ...(d.empresa !== undefined ? { empresa: normalizarEmpresa(d.empresa) } : {}),
    ...(d.data_admissao !== undefined ? { data_admissao: limpo(d.data_admissao) } : {}),
  };
}

/**
 * Cadastro novo. Se é ASG, o evento `adm_` vai NO MESMO LOTE da ficha (contrato do
 * Quadro, 13/11/2026): ficha sem evento, ou evento sem ficha, não pode existir.
 */
export async function createFuncionario(
  dados: DadosFuncionario,
  autor: string,
): Promise<Funcionario> {
  const { ficha, sede } = await montarFichaNova(dados, autor);
  const ds = await getDataSource();
  await ds.gravarLote([
    { tipo: "criar", tabela: "funcionarios", registro: ficha },
    ...(ehAsg(ficha.cargo)
      ? [criarEvento(montarEvento({
          tipo: "admissao", funcionario: ficha, dataEfetiva: ficha.data_admissao ?? "",
          sedeDe: "", sedePara: sede.codigo ?? "", autor, registradoEm: ficha.criado_em,
        }))]
      : []),
  ]);
  return ficha;
}

/**
 * A ficha nova, conferida e pronta para gravar — sem gravar. O cadastro e a
 * transferência passam por aqui: a mesma régua nos dois (a transferência a confere
 * ANTES de encerrar a origem). `exceto`: a ficha de origem, que ainda segura a matrícula.
 */
async function montarFichaNova(
  dados: DadosFuncionario,
  autor: string,
  exceto?: string,
): Promise<{ ficha: Funcionario; sede: Sede }> {
  // Cadastro novo nasce no quadro: nenhum campo do desligamento/transferência vem do
  // corpo. `desligado_em` no POST dispensava os dados do RH e gerava ficha "ativa"
  // que nunca saía do quadro (revisão de segurança, 13/11/2026). `ativo: true` passa
  // (é o padrão, e a transferência o manda).
  const doDesligamento = Object.keys(dados).filter(
    (k) => CAMPOS_DO_DESLIGAMENTO.has(k) && !(k === "ativo" && (dados as Record<string, unknown>)[k] === true),
  );
  if (doDesligamento.length)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "CAMPO_NAO_EDITAVEL",
        mensagem: `Cadastro novo não leva: ${doDesligamento.join(", ")}. Desligamento e transferência têm botão próprio.`,
      },
    ]);
  // Empresa se edita aqui desde 13/11/2026: o dono do dado passou a ser o Orkestria.
  const matricula = normalizarMatricula(dados.matricula);
  const rh = dadosDoRh(dados);
  const comIntervalos = { ...dados, ...rh, matricula, intervalos: csvDoTrio(dados) };
  const alertas0 = validarFuncionario(comIntervalos);
  if (temErro(alertas0)) throw new ErroValidacao(alertas0);
  // Lista fechada (decisão do dono, 13/11/2026): só empresa ativa do cadastro.
  await exigirEmpresaDoCadastro(rh.empresa);
  await exigirMatriculaLivre(matricula, rh.empresa, exceto);
  const ds = await getDataSource();
  const sede = await ds.obter("sedes", dados.sede_id);
  if (!sede)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNCIONARIO_SEM_SEDE", mensagem: "Sede informada não existe." },
    ]);
  const agora = agoraISO();
  const ficha: Funcionario = {
    // `intervalos` é a fonte; o trio antigo sai derivado dela, para os dois
    // nunca mais discordarem (ver `lib/intervalos.ts`).
    ...sincronizarTrio(comIntervalos),
    // DEPOIS do spread: um `id` no corpo do POST ganhava do novoId(), e o `criar`
    // sobrescrevia o cadastro de alguém de outra sede (revisão, 14/10/2026).
    id: novoId(),
    // Quem é cadastrado entra ativo. Era o checkbox do formulário que mandava
    // isto; sem ele, o cadastro chegaria sem `ativo` e as telas o esconderiam.
    ativo: comIntervalos.ativo ?? true,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  };
  return { ficha, sede };
}

/**
 * Só mudam pelo "Desligar" e pelo "Assume o posto de", que validam data e motivo,
 * decidem a vaga e cuidam da rota e dos blocos. Pelo PUT do cadastro dava para
 * gravar motivo em texto livre (que vai para o SGCP), zerar `vaga_sgcp` e abrir
 * vaga duplicada, ou "desdesligar" sem regra nenhuma (revisão de segurança,
 * 14/10/2026). O formulário de cadastro não manda nenhum destes campos.
 */
const CAMPOS_DO_DESLIGAMENTO: ReadonlySet<string> = new Set([
  "ativo",
  "desligado_em",
  "motivo_desligamento",
  "vaga_sgcp",
  "substituido_por",
  "posto_extinto",
  // Só o "Transferir" grava (27/10/2026).
  "transferido_para",
  "transferido_de",
  "transferido_setor",
  // Só o servidor carimba (troca de matrícula, empresa ou nome completo); vai no evento do Quadro.
  "identidade_alterada_em",
]);

/** Limpeza do nome completo — a mesma de `dadosDoRh`, para comparar antes × depois. */
const nomeLimpo = (v: unknown) => String(v ?? "").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();

export async function updateFuncionario(
  id: string,
  mudancas: Partial<DadosFuncionario>,
  autor: string,
): Promise<Funcionario> {
  const proibidos = Object.keys(mudancas).filter((k) => CAMPOS_DO_DESLIGAMENTO.has(k));
  if (proibidos.length)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "CAMPO_NAO_EDITAVEL",
        mensagem: `Campo(s) que só mudam pelo "Desligar" ou pelo "Assume o posto de": ${proibidos.join(", ")}.`,
      },
    ]);
  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  if (mudancas.matricula !== undefined)
    mudancas = { ...mudancas, matricula: normalizarMatricula(String(mudancas.matricula)) };
  mudancas = { ...mudancas, ...dadosDoRh(mudancas) };
  const destino = { ...atual, ...mudancas };
  // Troca de sede só pelo "Transferir", que gera o evento `transf_` (decisão do dono,
  // 13/11/2026, para todo cargo). Antes, sem vínculos, o PUT mudava a sede em silêncio.
  if (destino.sede_id !== atual.sede_id)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SEDE_SO_PELO_TRANSFERIR",
        mensagem: "A sede não muda pela edição: use o botão \"Transferir\".",
      },
    ]);
  // Entrar ou sair da função ASG muda o que vai para o Chromos (só ASG gera evento): é do
  // RH, não da edição (decisão do dono, 16/11/2026). Entre outros cargos, segue livre.
  if (mudancas.cargo !== undefined && ehAsg(destino.cargo) !== ehAsg(atual.cargo))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "CARGO_SO_PELO_RH",
        mensagem: "Entrar ou sair da função ASG não se faz pela edição: fale com o RH.",
      },
    ]);
  const empresaMudou = normalizarEmpresa(destino.empresa) !== normalizarEmpresa(atual.empresa);
  // Empresa trocada: só para uma ativa do cadastro (lista fechada, 13/11/2026).
  if (empresaMudou && normalizarEmpresa(destino.empresa)) await exigirEmpresaDoCadastro(destino.empresa);
  const matriculaMudou = normalizarMatricula(destino.matricula) !== normalizarMatricula(atual.matricula);
  // Matrícula ou empresa trocada: a dupla tem de estar livre (cada empresa numera a sua).
  if (matriculaMudou || (destino.empresa ?? "") !== (atual.empresa ?? ""))
    await exigirMatriculaLivre(normalizarMatricula(destino.matricula), destino.empresa || undefined, id);
  // Identidade trocada (inclusive de vazio para preenchida): carimbo para o evento do
  // Quadro — troca recente manda o evento para a conferência no Chromos (emenda 5).
  const identidadeMudou = matriculaMudou || empresaMudou || nomeLimpo(destino.nome_completo) !== nomeLimpo(atual.nome_completo);
  // Duas situações diferentes que é fácil confundir:
  //  - o formulário **mandou** `intervalos` (mesmo vazio) → vale o que ele mandou;
  //    apagar todos os intervalos precisa apagar de verdade.
  //  - o campo **não veio** (cadastro antigo, chamada de API sem ele) → monta o
  //    CSV a partir do trio, senão salvar pelo formulário novo apagaria o
  //    intervalo da pessoa em silêncio.
  destino.intervalos =
    mudancas.intervalos !== undefined ? String(mudancas.intervalos).trim() : csvDoTrio(destino);
  const alertas = validarFuncionario(destino);
  if (temErro(alertas)) throw new ErroValidacao(alertas);

  // Sem intervalo nenhum o trio também tem de zerar — senão sobra o par velho
  // no registro e `csvDoTrio` o traria de volta no próximo salvamento.
  const trio = destino.intervalos
    ? sincronizarTrio({ ...mudancas, intervalos: destino.intervalos })
    : { ...mudancas, intervalos: "", intervalo_inicio: "", intervalo_fim: "", intervalo_min: 0 };
  const agora = agoraISO();
  return ds.atualizar("funcionarios", id, {
    ...trio,
    ...(identidadeMudou ? { identidade_alterada_em: agora } : {}),
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

/** Bloqueado quando há histórico — inativar preserva relatórios antigos. */
export async function deleteFuncionario(id: string): Promise<void> {
  const ds = await getDataSource();
  // A ficha que já foi ao Quadro (admissão, ou a ficha nova de uma transferência) não
  // se apaga: o Chromos ficaria com uma pessoa que aqui sumiu, sem evento de saída
  // (emenda 2 do contrato do Quadro, 13/11/2026). O caminho é o "Desligar".
  const atual = await ds.obter("funcionarios", id);
  const [adm, transf] = await Promise.all([
    ds.obter("eventos_quadro", idDoEvento("admissao", id)),
    atual?.transferido_de ? ds.obter("eventos_quadro", idDoEvento("transferencia", atual.transferido_de)) : null,
  ]);
  // ASG no quadro também não se apaga, com ou sem evento guardado: o evento expira em 90
  // dias (retenção), e a trava não pode expirar junto — a pessoa sairia do Orkestria sem
  // `desl_` e o Chromos ficaria com ela ativa (seguranca e auditor, 16/11/2026).
  const asgNoQuadro = !!atual && ehAsg(atual.cargo) && !atual.desligado_em;
  if (adm || transf || asgNoQuadro)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "FICHA_JA_NO_QUADRO",
        mensagem: "Esta ficha já foi enviada ao Quadro da Infra: não pode ser excluída. Use \"Desligar\".",
      },
    ]);
  // Consulta pela FK (índice de campo único) → lê só os vínculos DESTE
  // funcionário, não as coleções inteiras (que crescem sem limite no tempo).
  const [rotinas, modelos, ausencias, qualificacoes, tempos, eventuais] = await Promise.all([
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("ausencias", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("qualificacoes_funcionario", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("tempos_personalizados", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("servicos_eventuais", [{ campo: "funcionario_id", op: "==", valor: id }]),
  ]);
  const vinculos =
    rotinas.length + modelos.length + ausencias.length + qualificacoes.length + tempos.length + eventuais.length;
  if (vinculos > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSSUI_HISTORICO",
        mensagem: `Este funcionário tem ${vinculos} vínculo(s) operacional(is). Excluir deixaria registros órfãos — use "Editar" e marque como Inativo.`,
      },
    ]);
  }
  await ds.excluir("funcionarios", id);
}

export interface ResultadoSubstituicao {
  itensDeRota: number;
  blocosTransferidos: number;
  blocosPreservados: number;
  inativou: boolean;
  /** Presente quando a rota mudou de horário para caber no de quem assumiu. */
  ajusteHorario?: { minutos: number; minutosSabado: number; passamDaSaida: number; naoCabemNoSabado: number };
}

/**
 * Jorge assume o posto do Assis a partir de 15/09: **a rota é do posto, não da
 * pessoa**.
 *
 * Por que dois cadastros e não renomear um: o bloco guarda o *id* do
 * funcionário e a tela lê o nome desse id na hora de desenhar. Renomear o
 * registro reescreveria o passado — o dia 12/09, já realizado e confirmado,
 * passaria a dizer que quem fez foi o Jorge. Dois registros e uma data de corte
 * é o único jeito de "antes do dia 15 é o Assis" continuar verdade.
 *
 * Três movimentos, nesta ordem:
 *  1. copia os itens da rota padrão do antigo para o novo (o posto continua);
 *  2. passa para o novo os blocos **a partir da data** que ainda estão só
 *     planejados;
 *  3. inativa o antigo.
 *
 * O que nunca se move: bloco com realizado registrado. Ele é histórico do
 * antigo, mesmo caindo depois da data de corte — alguém pode ter trabalhado no
 * próprio dia da troca.
 */
export async function substituirNoPosto(
  novoId: string,
  antigoId: string,
  aPartirDe: string,
  autor: string,
): Promise<ResultadoSubstituicao> {
  const { novo, antigo } = await conferirSubstituicao(novoId, antigoId, aPartirDe);
  const ds = await getDataSource();
  return passarPosto(ds, novo, antigo, aPartirDe, autor);
}

/**
 * As travas da substituição, sem gravar nada — a edição as confere ANTES de
 * apagar a rota atual da pessoa (senão uma recusa a deixaria sem rota nenhuma).
 */
async function conferirSubstituicao(novoId: string, antigoId: string, aPartirDe: string) {
  // Data de corte vem do formulário: "2026-1-5" compararia errado com as datas
  // dos blocos (texto) e levaria blocos do passado junto; "2026-13-45" não é dia.
  const dia = new Date(`${aPartirDe}T12:00:00Z`);
  const real =
    /^\d{4}-\d{2}-\d{2}$/u.test(aPartirDe) && !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === aPartirDe;
  if (!real)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "DATA_INVALIDA", mensagem: "Informe a data em que a pessoa assume o posto." },
    ]);
  if (novoId === antigoId)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SUBSTITUI_A_SI",
        mensagem: "Um funcionário não substitui a si mesmo.",
      },
    ]);
  const ds = await getDataSource();
  const [novo, antigo] = await Promise.all([
    ds.obter("funcionarios", novoId),
    ds.obter("funcionarios", antigoId),
  ]);
  if (!novo || !antigo)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "FUNCIONARIO_INEXISTENTE",
        mensagem: "Funcionário substituído não encontrado.",
      },
    ]);
  // Quem assume tem de estar no quadro. No cadastro novo é sempre verdade; na
  // edição, abrir o cadastro de uma desligada e escolher uma colega ativa
  // inativava a colega e dava a rota a quem nenhuma tela mostra — sem volta pela
  // tela (revisão de segurança, 27/10/2026).
  if (comAtivoDoDia(novo, hojeISO()).ativo === false || novo.desligado_em || novo.substituido_por || novo.posto_extinto)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "QUEM_ASSUME_FORA_DO_QUADRO",
        mensagem: `${novo.nome} está desligado(a) ou já passou o posto adiante: só quem está no quadro assume um posto.`,
      },
    ]);
  if (novo.sede_id !== antigo.sede_id)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SEDE_DIVERGENTE",
        mensagem: "A substituição vale dentro da mesma sede — a rota é do posto daquela unidade.",
      },
    ]);
  // Posto já assumido: a segunda substituição apontava o antigo para o novo
  // cadastro, mas a rota já tinha ido para o primeiro — e o segundo nascia sem
  // rota, com mensagem de sucesso (auditoria, 21/10/2026).
  if (antigo.substituido_por) {
    const quem = await ds.obter("funcionarios", antigo.substituido_por);
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSTO_JA_ASSUMIDO",
        mensagem: `O posto de ${antigo.nome} já foi assumido${quem ? ` por ${quem.nome}` : ""}. O cadastro foi salvo, sem mexer na rota — monte a agenda à mão ou escolha outro posto.`,
      },
    ]);
  }
  // Só POSTO VAGO se assume (decisão do dono, 16/11/2026): desligado (inclusive a ficha-posto
  // do "saiu do posto"), sem posto extinto. Assumir o posto de quem está ativo o inativava
  // sem desligamento — uma ASG fora do quadro sem evento para o Chromos (revisão de segurança).
  if (!antigo.desligado_em || antigo.posto_extinto)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSTO_NAO_VAGO",
        mensagem: `${antigo.nome}: desligue ou tire do posto antes; só um posto vago pode ser assumido.`,
      },
    ]);
  return { novo, antigo };
}

async function passarPosto(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  novo: Funcionario,
  antigo: Funcionario,
  aPartirDe: string,
  autor: string,
): Promise<ResultadoSubstituicao> {
  const novoId = novo.id;
  const antigoId = antigo.id;
  const agora = agoraISO();
  const [itens, blocos] = await Promise.all([
    ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: antigoId }]),
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: antigoId }]),
  ]);

  // 0. a rota anda junto com a entrada de quem assume (13/11/2026) — ver `rotaNoHorario`.
  // Item antigo sem duração gravada: o tempo da tarefa com local e fator do tipo,
  // exatamente como na geração (`carregarRotaEContexto`). Sem o local, tarefa por m²
  // saía com 0 min e o bloco caía dentro do almoço (auditoria, 13/11/2026).
  const semDuracao = itens.filter((i) => i.duracao_min == null);
  const mapaTarefas = new Map<string, Tarefa>();
  const mapaLocais = new Map<string, Local>();
  let fatorDoTipo: Awaited<ReturnType<typeof mapaFatorDoTipo>> | undefined;
  if (semDuracao.length) {
    const [ts, ls, fator] = await Promise.all([
      Promise.all([...new Set(semDuracao.map((i) => i.tarefa_id))].map((id) => ds.obter("tarefas", id))),
      Promise.all([...new Set(semDuracao.map((i) => i.local_id))].map((id) => ds.obter("locais", id))),
      mapaFatorDoTipo(),
    ]);
    for (const t of ts) if (t) mapaTarefas.set(t.id, t);
    for (const l of ls) if (l) mapaLocais.set(l.id, l);
    fatorDoTipo = fator;
  }
  const ajuste = rotaNoHorario(itens, antigo, novo, (i) => {
    const t = mapaTarefas.get(i.tarefa_id);
    return i.duracao_min ?? (t ? tempoPrevistoMin(t, mapaLocais.get(i.local_id), fatorDoTipo) : 0);
  });
  const noHorario = new Map(ajuste.itens.map((a) => [a.item.id, a]));
  const mudouHorario = ajuste.itens.some((a) => a.inicio !== a.item.inicio_planejado || a.dias_semana !== undefined || a.inicioSabado);
  const comHorarioNovo = (item: ModeloRotinaItem) => {
    const a = noHorario.get(item.id)!;
    return { inicio_planejado: a.inicio, ...(a.dias_semana !== undefined ? { dias_semana: a.dias_semana } : {}) };
  };

  // 1. a rota do posto passa a ser do novo. O id do item costuma carregar a pessoa, por
  // isso é recalculado — senão o novo item colidiria com o do antigo. Item que veio de
  // uma troca de tarefas mantém o id do primeiro dono: recalcular dava o mesmo id, e o
  // "criar" seguido do "excluir" apagava o item (revisão de segurança, 09/11/2026).
  const comPessoaNoId = itens.filter((item) => item.id.includes(antigoId));
  const semPessoaNoId = itens.filter((item) => !item.id.includes(antigoId));
  const idNovo = (item: ModeloRotinaItem) => (item.id.includes(antigoId) ? item.id.replace(antigoId, novoId) : item.id);
  const copiados = comPessoaNoId.map((item) => ({
    ...item,
    id: idNovo(item),
    funcionario_id: novoId,
    ...comHorarioNovo(item),
    criado_por: autor,
    criado_em: agora,
  }));
  // O item de todo dia que quem saiu fazia no sábado vira, também, um item só de sábado.
  const copiasSabado = itens
    .filter((item) => noHorario.get(item.id)?.inicioSabado)
    .map((item) => ({
      ...item,
      id: `${idNovo(item)}-sab`,
      funcionario_id: novoId,
      inicio_planejado: noHorario.get(item.id)!.inicioSabado!,
      dias_semana: "6",
      criado_por: autor,
      criado_em: agora,
    }));
  await emLotesFunc([...copiados, ...copiasSabado], (item) => ds.criar("modelos_rotina", item));
  await emLotesFunc(comPessoaNoId, (item) => ds.excluir("modelos_rotina", item.id));
  await emLotesFunc(semPessoaNoId, (item) =>
    ds.atualizar("modelos_rotina", item.id, { funcionario_id: novoId, ...comHorarioNovo(item) }),
  );

  // 2. só o que ainda é plano, e só daqui para a frente. O bloco aponta para o item
  // NOVO (senão a geração não o reconhece e cria outro ao lado) e, se ainda está onde
  // a rota o pôs, vai para o horário novo junto com ele. Movido à mão fica onde está.
  const aTransferir = blocos.filter((b) => b.data >= aPartirDe && b.status === "planejada");
  const preservados = blocos.filter((b) => b.data >= aPartirDe && b.status !== "planejada").length;
  const porId = new Map(itens.map((i) => [i.id, i]));
  await emLotesFunc(aTransferir, (b) => {
    const dow = new Date(`${b.data}T12:00:00`).getDay();
    // Bloco sem vínculo (dia montado por "aplicar modelo", à mão ou importado): é da
    // rota se casa com um item dela na tarefa, no horário e no dia — a mesma chave com
    // que a geração o reconhece. Senão ficava no horário velho e a geração criava
    // outro no novo, ao lado (auditoria, 13/11/2026).
    // Vale também para vínculo com item que já não existe (rota salva de novo com
    // outra chave) e só olha a rota padrão: casar com modelo de EVENTO, que não anda,
    // deixava o bloco no horário velho (reauditoria, 13/11/2026).
    const item =
      (b.origem_item_id ? porId.get(b.origem_item_id) : undefined) ??
      itens.find(
        (i) =>
          i.padrao &&
          !i.evento &&
          i.tarefa_id === b.tarefa_id &&
          i.inicio_planejado === b.inicio_planejado &&
          (parseDiasSemana(i.dias_semana).length === 0 || parseDiasSemana(i.dias_semana).includes(dow)),
      );
    const a = item ? noHorario.get(item.id) : undefined;
    if (!item || !a) return ds.atualizar("rotinas_planejadas", b.id, { funcionario_id: novoId, atualizado_em: agora });
    const sabado = dow === 6;
    const viraCopia = sabado && !!a.inicioSabado;
    const inicio = viraCopia ? a.inicioSabado! : a.inicio;
    const noLugar = (!b.origem_inicio || b.origem_inicio === b.inicio_planejado) && b.inicio_planejado === item.inicio_planejado;
    const dur = hhmmParaMin(b.fim_planejado) - hhmmParaMin(b.inicio_planejado);
    return ds.atualizar("rotinas_planejadas", b.id, {
      funcionario_id: novoId,
      origem_item_id: viraCopia ? `${idNovo(item)}-sab` : idNovo(item),
      ...(noLugar && inicio !== b.inicio_planejado
        ? { inicio_planejado: inicio, fim_planejado: minParaHHMM(hhmmParaMin(inicio) + dur), origem_inicio: inicio }
        : {}),
      atualizado_em: agora,
    });
  });

  // 3. quem saiu, saiu: some da agenda e das listas, o histórico fica inteiro.
  await ds.atualizar("funcionarios", antigoId, {
    ativo: false,
    // Marca o posto como preenchido: sem isto, um desligado continuaria na lista
    // de postos vagos depois de alguém assumir a rota dele.
    substituido_por: novoId,
    atualizado_por: autor,
    atualizado_em: agora,
    observacoes: [antigo.observacoes, `Substituído por ${novo.nome} em ${aPartirDe}.`]
      .filter(Boolean)
      .join(" · "),
  });

  return {
    // Os recriados e os que só mudaram de dono (vindos de uma troca): os dois passaram.
    itensDeRota: copiados.length + semPessoaNoId.length,
    blocosTransferidos: aTransferir.length,
    blocosPreservados: preservados,
    inativou: true,
    ...(mudouHorario
      ? {
          ajusteHorario: {
            minutos: ajuste.minutos,
            minutosSabado: ajuste.minutosSabado,
            passamDaSaida: ajuste.passamDaSaida,
            naoCabemNoSabado: ajuste.naoCabemNoSabado,
          },
        }
      : {}),
  };
}

/**
 * "Assume o posto de" pela EDIÇÃO (27/10/2026): a coordenação cadastrou uma
 * pessoa num dia e só no outro soube que ela fica com a rota de quem saiu.
 *
 * Se a pessoa já tem rota, ela é TROCADA pela do posto — o coordenador escolheu
 * o posto de propósito (decisão do dono: "não faz sentido recusar"). Sai a rota
 * padrão dela e o que estava só planejado para ela a partir da data; o
 * realizado e o passado ficam. As travas (mesma sede, posto ainda não assumido,
 * ninguém assume o próprio posto, data válida) são conferidas ANTES de apagar:
 * uma recusa não pode deixá-la sem rota nenhuma.
 */
export async function assumirPostoNaEdicao(
  id: string,
  antigoId: string,
  aPartirDe: string,
  autor: string,
): Promise<ResultadoSubstituicao & { itensTrocados: number; blocosTrocados: number }> {
  // Na edição a troca APAGA o planejado da pessoa a partir da data: data no
  // passado apagaria o previsto de dias que já foram (e traria os de quem saiu).
  // O "o passado fica" não pode depender de quem chama lembrar.
  if (aPartirDe < hojeISO())
    throw new ErroValidacao([
      { nivel: "erro", codigo: "DATA_NO_PASSADO", mensagem: "Na edição, a passagem do posto vale de hoje em diante." },
    ]);
  const { novo, antigo } = await conferirSubstituicao(id, antigoId, aPartirDe);
  const ds = await getDataSource();
  const { itensSaem, blocosSaem } = await comReleitura(async () => {
    const [rota, blocos] = await Promise.all([
      ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ]);
    const itensSaem = rota.filter((item) => item.padrao);
    // Vale de hoje em diante: os blocos de hoje podem estar sendo confirmados agora.
    const blocosSaem = blocos.filter((b) => b.data >= aPartirDe && b.status === "planejada");
    if (itensSaem.length || blocosSaem.length)
      await ds.gravarLote([
        ...itensSaem.map((i) => ({ tipo: "excluir" as const, tabela: "modelos_rotina" as const, id: i.id })),
        ...blocosSaem.map(excluirBlocoComoLido),
      ]);
    return { itensSaem, blocosSaem };
  });
  const r = await passarPosto(ds, novo, antigo, aPartirDe, autor);
  return { ...r, itensTrocados: itensSaem.length, blocosTrocados: blocosSaem.length };
}

/** O que aconteceu com a vaga no SGCP — a tela mostra a frase. */
export type ResultadoVaga =
  | { aberta: true; codigo: string }
  | { aberta: false; motivo: string };

export interface ResultadoDesligamento {
  blocosRemovidos: number;
  blocosPreservados: number;
  /** Só com posto extinto: itens da rota padrão apagados. */
  itensDeRotaApagados: number;
  vaga: ResultadoVaga;
}

/**
 * Desliga a pessoa: grava data e motivo, tira da agenda os blocos ainda só
 * planejados a partir da data e abre a vaga de substituição no SGCP.
 *
 * O que fica: a ROTA PADRÃO (vira posto vago — "Assume o posto de" a entrega a
 * quem for contratado) e todo bloco com realizado, que é histórico dela. A
 * pessoa não é apagada: os dias que ela trabalhou continuam com o nome dela.
 *
 * A vaga é a parte que pode falhar (o SGCP fora do ar, a sede que não existe
 * lá). O desligamento não espera por ela: fica gravado, e a tela oferece abrir
 * a vaga de novo.
 */
export interface ResultadoSaidaDoPosto {
  /** A ficha-posto criada para a rota (posto vago), ou `null` se a pessoa não tinha rota. */
  postoVagoId: string | null;
  itensDeRotaMovidos: number;
  blocosRemovidos: number;
  blocosPreservados: number;
}

const semTipo = () =>
  new ErroValidacao([
    { nivel: "erro", codigo: "DESLIGAMENTO_SEM_TIPO", mensagem: "Diga se a pessoa saiu da empresa ou só saiu do posto." },
  ]);

/**
 * POST /desligar. `tipo` é obrigatório (decisão do dono, 13/11/2026), e a rota despacha:
 *  - "saiu_da_empresa" (aqui): o desligamento de sempre + o evento `desl_` do Quadro no
 *    mesmo lote (se ASG). O motivo é da lista do Desligar — "Transferência" é recusada.
 *  - "saiu_do_posto" (`sairDoPosto`): a pessoa CONTINUA na sede, sem rota; a rota vira
 *    posto vago. Não gera evento: o Chromos não muda nada.
 */
export async function desligarFuncionario(
  id: string,
  /**
   * `abrirVaga: false` desliga sem ir ao SGCP (quem desliga escolhe). Ausente = abre.
   * `extinguirPosto: true` (só sem vaga): o quadro diminui — a rota é apagada em vez
   * de virar posto vago. Caso real: o Pré Sul, de 4 para 3 (13/10/2026).
   */
  dados: { tipo?: unknown; data?: unknown; motivo?: unknown; abrirVaga?: unknown; extinguirPosto?: unknown },
  autor: string,
  solicitante: { nome: string; email?: string },
): Promise<ResultadoDesligamento> {
  if (dados.tipo !== "saiu_da_empresa") throw semTipo();
  if (dados.motivo === MOTIVO_TRANSFERENCIA)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "DESLIGAMENTO_INVALIDO", mensagem: "Transferência é pelo botão \"Transferir\", não pelo Desligar." },
    ]);
  const erro = validarDesligamento(dados);
  if (erro) throw new ErroValidacao([{ nivel: "erro", codigo: "DESLIGAMENTO_INVALIDO", mensagem: erro }]);
  const data = dados.data as string;
  const motivo = dados.motivo as string;

  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  exigirNaoDesligado(atual);

  // Posto extinto e vaga aberta se contradizem: a vaga é para repor o posto.
  const extinguir = dados.extinguirPosto === true;
  if (extinguir && dados.abrirVaga !== false && motivoAbreVaga(motivo))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSTO_EXTINTO_COM_VAGA",
        mensagem: "Se o posto deixa de existir, não se abre vaga para ele. Desmarque a vaga ou mantenha o posto.",
      },
    ]);

  const agora = agoraISO();
  const sede = ehAsg(atual.cargo) ? await ds.obter("sedes", atual.sede_id) : null;
  const enc = await comReleitura(async () => {
    const enc = await encerramento(ds, atual, { data, motivo, extinguir, destino: {}, autor, agora });
    await ds.gravarLote([
      enc.ficha,
      // O evento sai da ficha como ela fica gravada neste lote — nunca do corpo do pedido.
      ...(ehAsg(atual.cargo)
        ? [criarEvento(montarEvento({
            tipo: "desligamento", funcionario: { ...atual, ...enc.mudancas }, dataEfetiva: data,
            sedeDe: sede?.codigo ?? "", sedePara: "", autor, registradoEm: agora,
          }))]
        : []),
      ...enc.resto,
    ]);
    return enc;
  });

  const vaga = await decidirVaga(id, motivo, extinguir, dados.abrirVaga !== false, solicitante);
  return { ...enc.resultado, vaga };
}

function exigirNaoDesligado(atual: Funcionario) {
  if (atual.desligado_em)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "JA_DESLIGADO",
        mensagem: `${atual.nome} já está desligado(a) desde ${atual.desligado_em.split("-").reverse().join("/")}.`,
      },
    ]);
}

/**
 * O encerramento da ficha como operações de lote, sem gravar: data e motivo, os blocos
 * só planejados da data em diante saem, e a rota sai se o posto acaba. Desligar e
 * transferir o põem no MESMO lote do resto (ficha nova, evento do Quadro).
 */
async function encerramento(
  ds: Ds,
  atual: Funcionario,
  a: {
    data: string;
    motivo: string;
    extinguir: boolean;
    /**
     * O destino da transferência, gravado JUNTO com o encerramento e antes do SGCP:
     * em duas escritas, uma falha na segunda deixava a ficha encerrada sem destino e
     * sem conserto (revisão, 04/11/2026). Nunca vem do corpo cru do /desligar.
     */
    destino: Pick<Funcionario, "transferido_para" | "transferido_setor">;
    autor: string;
    agora: string;
  },
) {
  const { data, motivo, extinguir } = a;
  const [blocos, rota] = await Promise.all([
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: atual.id }]),
    extinguir
      ? ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: atual.id }])
      : Promise.resolve([]),
  ]);
  const daData = blocos.filter((b) => b.data >= data);
  const remover = daData.filter((b) => b.status === "planejada");
  const mudancas: Partial<Funcionario> = {
    desligado_em: data,
    motivo_desligamento: motivo,
    // Data futura (aviso prévio): segue ativo até lá — a listagem e a geração
    // tiram a pessoa sozinhas quando a data chega.
    ...(data <= hojeISO() ? { ativo: false } : {}),
    ...(extinguir ? { posto_extinto: true } : {}),
    ...a.destino,
    observacoes: [
      atual.observacoes,
      `Desligado(a) em ${data.split("-").reverse().join("/")} — ${motivo}${extinguir ? " · posto extinto" : ""}.`,
    ]
      .filter(Boolean)
      .join(" · "),
    atualizado_por: a.autor,
    atualizado_em: a.agora,
  };
  return {
    /**
     * A ficha separada do resto: quem monta o lote põe a ficha e o evento NA FRENTE. O
     * Firestore parte lote acima de 500 escritas em pedaços atômicos entre si, e o 1º
     * pedaço tem de levar ficha + evento juntos (revisão de segurança, 16/11/2026).
     */
    ficha: { tipo: "atualizar", tabela: "funcionarios", id: atual.id, mudancas } as OperacaoLote,
    resto: [
      // Data de hoje ou passada pega blocos que o supervisor pode estar confirmando agora.
      ...remover.map(excluirBlocoComoLido),
      ...rota.map((i) => ({ tipo: "excluir" as const, tabela: "modelos_rotina" as const, id: i.id })),
    ] as OperacaoLote[],
    mudancas,
    resultado: {
      blocosRemovidos: remover.length,
      blocosPreservados: daData.length - remover.length,
      itensDeRotaApagados: rota.length,
    },
  };
}

/** A vaga no SGCP, DEPOIS do lote: a parte que pode falhar não desfaz o desligamento. */
async function decidirVaga(
  id: string,
  motivo: string,
  extinguir: boolean,
  pedida: boolean,
  solicitante: { nome: string; email?: string },
): Promise<ResultadoVaga> {
  if (!motivoAbreVaga(motivo))
    return { aberta: false, motivo: "Abandono de emprego: a vaga é pedida pela Coordenação no Chromos, que avisa depois de 15 dias de falta." };
  if (extinguir) return { aberta: false, motivo: "o posto deixou de existir." };
  if (!pedida) return { aberta: false, motivo: "não foi pedida no desligamento. Dá para abrir depois pelo botão \"Abrir vaga\"." };
  return abrirVagaNoSgcp(id, solicitante);
}

/**
 * "Saiu do posto" (decisão do dono, 13/11/2026): a pessoa CONTINUA ativa na sede, sem
 * rota. A rota padrão dela vai SEMPRE para um posto vago — uma ficha-posto ("Posto de
 * <apelido>", desligada na data, sem dados do RH) que o "Assume o posto de" já lista
 * como posto vago. Os blocos só planejados dela da data em diante saem da agenda. Tudo
 * num lote só; sem evento do Quadro (o Chromos não muda nada) e sem vaga no SGCP.
 */
export async function sairDoPosto(
  id: string,
  dados: { tipo?: unknown; data?: unknown; abrirVaga?: unknown; extinguirPosto?: unknown },
  autor: string,
): Promise<ResultadoSaidaDoPosto> {
  if (dados.tipo !== "saiu_do_posto") throw semTipo();
  const recusa = (codigo: string, mensagem: string) => new ErroValidacao([{ nivel: "erro", codigo, mensagem }]);
  const erroData = validarDataDeSaida(dados.data);
  if (erroData) throw recusa("DESLIGAMENTO_INVALIDO", erroData);
  // Só hoje ou passado (revisão de segurança, 16/11/2026): a rota sai na hora, e com data
  // futura a pessoa ficaria sem rota até lá — e os blocos até a data, sem dono no posto.
  if ((dados.data as string) > hojeISO())
    throw recusa("SAIU_DO_POSTO_DATA_FUTURA", "A saída do posto vale de hoje para trás; para data futura, registre no dia.");
  // A rota vira SEMPRE posto vago, e a pessoa não saiu da empresa: os dois pedidos contradizem o tipo.
  if (dados.extinguirPosto === true)
    throw recusa("SAIU_DO_POSTO_SEM_EXTINGUIR", "Quem só saiu do posto deixa a rota como posto vago: o posto não é extinto aqui.");
  if (dados.abrirVaga === true)
    throw recusa("SAIU_DO_POSTO_SEM_VAGA", "Quem só saiu do posto continua na empresa: não há vaga a abrir no SGCP.");
  const data = dados.data as string;

  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  exigirNaoDesligado(atual);
  if (comAtivoDoDia(atual, hojeISO()).ativo === false || atual.substituido_por)
    throw recusa("FORA_DO_QUADRO", `${atual.nome} não está no quadro: não há posto a deixar.`);
  return comReleitura(() => gravarSaidaDoPosto(ds, atual, data, autor));
}

/** Lê a rota e os blocos e grava o lote da saída do posto; `comReleitura` repete se um bloco mudou. */
async function gravarSaidaDoPosto(ds: Ds, atual: Funcionario, data: string, autor: string): Promise<ResultadoSaidaDoPosto> {
  const id = atual.id;
  const [itens, blocos] = await Promise.all([
    ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: id }]),
  ]);
  const daData = blocos.filter((b) => b.data >= data);
  const remover = daData.filter((b) => b.status === "planejada");
  const agora = agoraISO();
  const dataBR = data.split("-").reverse().join("/");
  const ops: OperacaoLote[] = [];

  // Sem rota, não há posto a guardar: uma ficha-posto vazia só sujaria a lista de postos vagos.
  const posto: Funcionario | null = itens.length
    ? {
        // Determinístico por pessoa + data, gravado com `create`: dois pedidos simultâneos
        // dão um posto só — o segundo lote falha inteiro (revisão de segurança, 16/11/2026).
        id: `posto_${id}_${data}`,
        nome: `Posto de ${atual.nome}`,
        genero: atual.genero,
        sede_id: atual.sede_id,
        turno: atual.turno,
        entrada: atual.entrada,
        saida: atual.saida,
        intervalo_min: atual.intervalo_min,
        intervalo_inicio: atual.intervalo_inicio,
        intervalo_fim: atual.intervalo_fim,
        intervalos: csvDoTrio(atual),
        escala: atual.escala ?? "seg_sex",
        entrada_sabado: atual.entrada_sabado ?? "",
        saida_sabado: atual.saida_sabado ?? "",
        intervalos_sabado: atual.intervalos_sabado ?? "",
        cargo: atual.cargo,
        // Desligada na data: é assim que o "Assume o posto de" reconhece o posto vago.
        // Sem dados do RH — não é uma pessoa (desligado é dispensado em `validarFuncionario`).
        ativo: false,
        desligado_em: data,
        motivo_desligamento: MOTIVO_SAIU_DO_POSTO,
        observacoes: `Rota de ${atual.nome}, que saiu do posto em ${dataBR} e continua na sede.`,
        criado_por: autor,
        criado_em: agora,
        atualizado_por: autor,
        atualizado_em: agora,
      }
    : null;
  if (posto) {
    ops.push({ tipo: "criar", tabela: "funcionarios", registro: posto, exigirNovo: true });
    // O id do item costuma carregar a pessoa (`idItemDeRota`): recalculado para o posto,
    // senão a próxima rota dela geraria o mesmo id e regravaria o item do posto.
    for (const item of itens) {
      if (item.id.includes(id)) {
        ops.push({ tipo: "criar", tabela: "modelos_rotina", registro: { ...item, id: item.id.replace(id, posto.id), funcionario_id: posto.id } });
        ops.push({ tipo: "excluir", tabela: "modelos_rotina", id: item.id });
      } else ops.push({ tipo: "atualizar", tabela: "modelos_rotina", id: item.id, mudancas: { funcionario_id: posto.id } });
    }
  }
  // A saída vale de hoje para trás: são justamente os blocos que podem estar sendo confirmados.
  ops.push(...remover.map(excluirBlocoComoLido));
  ops.push({
    tipo: "atualizar",
    tabela: "funcionarios",
    id,
    mudancas: {
      observacoes: [atual.observacoes, `Saiu do posto em ${dataBR}${posto ? " (a rota ficou como posto vago)" : ""}.`]
        .filter(Boolean)
        .join(" · "),
      atualizado_por: autor,
      atualizado_em: agora,
    },
  });
  try {
    await ds.gravarLote(ops);
  } catch (e) {
    // O outro pedido chegou antes: nada deste foi gravado.
    if (posto && (await ds.obter("funcionarios", posto.id)))
      throw new ErroConflito("Esta saída do posto já foi registrada (outro pedido chegou antes).");
    throw e;
  }
  return {
    postoVagoId: posto?.id ?? null,
    itensDeRotaMovidos: itens.length,
    blocosRemovidos: remover.length,
    blocosPreservados: daData.length - remover.length,
  };
}

export interface ResultadoTransferencia extends ResultadoDesligamento {
  /** A ficha nova, na sede de destino. */
  novo: Funcionario;
}

/**
 * Transferência de sede (27/10/2026: "fica muito ruim no desligar"). Um passo
 * só para o que antes eram dois — desligar na origem com motivo
 * "Transferência" e cadastrar de novo no destino:
 *
 *  1. encerra a ficha de origem (`encerramento`, motivo "Transferência"; a rota
 *     fica como posto vago na origem; vaga no SGCP só se pedida — decisão do
 *     dono: desmarcada por padrão);
 *  2. marca nela `transferido_para` (a tela mostra "Transferida para X");
 *  3. cria a ficha no destino copiando nome, matrícula, empresa, horário e
 *     escala, com `transferido_de`. Lá a coordenação escolhe o posto pelo
 *     "Assume o posto de" (edição) ou monta a rota.
 *
 * Por que duas fichas e não trocar a sede: o bloco guarda o id da pessoa e a
 * rota é do posto — ver `substituirNoPosto`. A matrícula fica livre para a
 * ficha nova porque a de origem já está desligada (`exigirMatriculaLivre`).
 *
 * Tudo que pode recusar é conferido antes de gravar: uma transferência pela
 * metade deixaria a pessoa desligada sem ficha no destino.
 */
export async function transferirFuncionario(
  id: string,
  dados: { sede_id?: unknown; data?: unknown; abrirVaga?: unknown },
  autor: string,
  solicitante: { nome: string; email?: string },
): Promise<ResultadoTransferencia> {
  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  const destino = typeof dados.sede_id === "string" ? await ds.obter("sedes", dados.sede_id) : null;
  const recusa = (codigo: string, mensagem: string) => new ErroValidacao([{ nivel: "erro", codigo, mensagem }]);
  if (!destino) throw recusa("TRANSFERENCIA_SEM_DESTINO", "Escolha a sede para onde a pessoa vai.");
  if (destino.id === atual.sede_id) throw recusa("TRANSFERENCIA_MESMA_SEDE", "A pessoa já é desta sede.");
  if (atual.desligado_em || atual.ativo === false)
    throw recusa("TRANSFERENCIA_FORA_DO_QUADRO", `${atual.nome} já está desligado(a): não há o que transferir.`);
  if (validarDataDeSaida(dados.data)) throw recusa("TRANSFERENCIA_DATA", "Informe uma data real, de até 1 ano à frente.");
  const data = dados.data as string;
  const sedeOrigem = await ds.obter("sedes", atual.sede_id);
  const copia = {
      nome: atual.nome,
      genero: atual.genero,
      sede_id: destino.id,
      turno: atual.turno,
      entrada: atual.entrada,
      saida: atual.saida,
      intervalo_min: atual.intervalo_min,
      intervalo_inicio: atual.intervalo_inicio,
      intervalo_fim: atual.intervalo_fim,
      intervalos: csvDoTrio(atual),
      escala: atual.escala ?? "seg_sex",
      entrada_sabado: atual.entrada_sabado ?? "",
      saida_sabado: atual.saida_sabado ?? "",
      intervalos_sabado: atual.intervalos_sabado ?? "",
      cargo: atual.cargo,
      matricula: atual.matricula ?? "",
      // Os dados do RH vão junto: a ficha nova é a mesma pessoa.
      nome_completo: atual.nome_completo ?? "",
      empresa: atual.empresa ?? "",
      data_admissao: atual.data_admissao ?? "",
      ativo: true,
      observacoes: `Transferida de ${sedeOrigem?.nome_sede ?? "outra sede"} em ${data.split("-").reverse().join("/")}.`,
  } as DadosFuncionario;
  // A MESMA régua do cadastro (`montarFichaNova`: dados do RH, empresa do cadastro,
  // matrícula livre), conferida ANTES de qualquer escrita — régua diferente aqui deixava
  // passar o que o cadastro recusa (revisão de segurança, 27/10 e 13/11/2026).
  const { ficha } = await montarFichaNova(copia, autor, id);
  const novo: Funcionario = {
    ...ficha,
    // O elo com a origem não entra pelo cadastro comum (ver as travas de `montarFichaNova`): só por aqui.
    transferido_de: id,
    // A mesma pessoa: a última troca de identidade dela continua valendo.
    ...(atual.identidade_alterada_em ? { identidade_alterada_em: atual.identidade_alterada_em } : {}),
  };

  // A transferência INTEIRA num lote só (emenda 2 do contrato do Quadro, 13/11/2026):
  // encerrar a origem, criar o destino e o evento `transf_`. Falha no meio: nada gravado.
  const agora = agoraISO();
  const enc = await comReleitura(async () => {
    const enc = await encerramento(ds, atual, {
      data, motivo: MOTIVO_TRANSFERENCIA, extinguir: false, destino: { transferido_para: destino.id }, autor, agora,
    });
    await ds.gravarLote([
      enc.ficha,
      { tipo: "criar", tabela: "funcionarios", registro: novo },
      ...(ehAsg(atual.cargo)
        ? [criarEvento(montarEvento({
            tipo: "transferencia", funcionario: { ...atual, ...enc.mudancas }, dataEfetiva: data,
            sedeDe: sedeOrigem?.codigo ?? "", sedePara: destino.codigo ?? "", autor, registradoEm: agora,
          }))]
        : []),
      ...enc.resto,
    ]);
    return enc;
  });
  const vaga = await decidirVaga(id, MOTIVO_TRANSFERENCIA, false, dados.abrirVaga === true, solicitante);
  return { ...enc.resultado, vaga, novo };
}

/** O nome do setor aparece no selo da lista; não é campo de observação. */
const MAX_NOME_SETOR = 60;

/**
 * Transferência para outro setor, fora das sedes (04/11/2026: "foi para a
 * cantina"). Encerra a ficha como o `transferirFuncionario`, com o mesmo motivo
 * — que o SGCP já conhece —, mas não há ficha nova: a pessoa sai do Orkestria.
 * A rota fica como posto vago e a tela mostra "Transferida para <setor>".
 */
export async function transferirParaSetor(
  id: string,
  dados: { sede_id?: unknown; setor?: unknown; data?: unknown; abrirVaga?: unknown },
  autor: string,
  solicitante: { nome: string; email?: string },
): Promise<ResultadoDesligamento> {
  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  const recusa = (codigo: string, mensagem: string) => new ErroValidacao([{ nivel: "erro", codigo, mensagem }]);
  if (dados.sede_id !== undefined) throw recusa("TRANSFERENCIA_DESTINO_DUPLO", "Escolha uma sede ou um setor, não os dois.");
  const setor = typeof dados.setor === "string" ? dados.setor.trim() : "";
  if (!setor) throw recusa("TRANSFERENCIA_SEM_DESTINO", "Informe o setor para onde a pessoa vai.");
  if (setor.length > MAX_NOME_SETOR)
    throw recusa("TRANSFERENCIA_SETOR_LONGO", `O nome do setor pode ter até ${MAX_NOME_SETOR} caracteres.`);
  // Caractere invisível passa pelo trim e deixaria o selo sem nome.
  if (/[\p{C}\p{Zl}\p{Zp}\p{DI}]/u.test(setor) || !/[\p{L}\p{N}]/u.test(setor))
    throw recusa("TRANSFERENCIA_SEM_DESTINO", "Informe o setor para onde a pessoa vai.");
  if (atual.desligado_em || atual.ativo === false)
    throw recusa("TRANSFERENCIA_FORA_DO_QUADRO", `${atual.nome} já está desligado(a): não há o que transferir.`);
  if (validarDataDeSaida(dados.data)) throw recusa("TRANSFERENCIA_DATA", "Informe uma data real, de até 1 ano à frente.");
  const data = dados.data as string;

  const agora = agoraISO();
  const sede = ehAsg(atual.cargo) ? await ds.obter("sedes", atual.sede_id) : null;
  const enc = await comReleitura(async () => {
    const enc = await encerramento(ds, atual, {
      data, motivo: MOTIVO_TRANSFERENCIA, extinguir: false, destino: { transferido_setor: setor }, autor, agora,
    });
    await ds.gravarLote([
      enc.ficha,
      // O setor vai só como "setor": o texto livre não sai daqui (emenda 5).
      ...(ehAsg(atual.cargo)
        ? [criarEvento(montarEvento({
            tipo: "transferencia", funcionario: { ...atual, ...enc.mudancas }, dataEfetiva: data,
            sedeDe: sede?.codigo ?? "", sedePara: SEDE_SETOR, autor, registradoEm: agora,
          }))]
        : []),
      ...enc.resto,
    ]);
    return enc;
  });
  const vaga = await decidirVaga(id, MOTIVO_TRANSFERENCIA, false, dados.abrirVaga === true, solicitante);
  return { ...enc.resultado, vaga };
}

/**
 * Abre (ou reabre a tentativa de abrir) a vaga de substituição no SGCP. É
 * idempotente nas duas pontas: aqui, quem já tem `vaga_sgcp` não chama de novo;
 * lá, o id da vaga sai do id do funcionário e o segundo envio devolve a mesma.
 */
export async function abrirVagaNoSgcp(
  id: string,
  solicitante: { nome: string; email?: string },
): Promise<ResultadoVaga> {
  const ds = await getDataSource();
  const f = await ds.obter("funcionarios", id);
  if (!f) throw new Error("Funcionário não encontrado.");
  if (f.vaga_sgcp) return { aberta: true, codigo: f.vaga_sgcp };
  if (!f.desligado_em) return { aberta: false, motivo: "Só se abre vaga de quem foi desligado." };
  if (f.posto_extinto) return { aberta: false, motivo: "O posto deixou de existir no desligamento — não há o que repor." };
  if (f.motivo_desligamento === MOTIVO_SAIU_DO_POSTO)
    return { aberta: false, motivo: "Posto vago de quem continua na sede: não há vaga a abrir no SGCP." };
  // Revalida o que está gravado: o motivo vai para o SGCP, e só um da lista vai. Os
  // motivos antigos e a transferência continuam valendo para fichas já gravadas.
  if (validarDesligamento({ data: f.desligado_em, motivo: f.motivo_desligamento }, { gravado: true }))
    return { aberta: false, motivo: "O desligamento gravado está incompleto (data ou motivo fora da lista)." };
  if (!motivoAbreVaga(f.motivo_desligamento ?? ""))
    return { aberta: false, motivo: "Abandono de emprego: a vaga é pedida pela Coordenação no Chromos." };

  const url = process.env.SGCP_VAGAS_URL;
  const token = minhaChave();
  if (!url || !token) return { aberta: false, motivo: "A integração com o SGCP não está configurada." };
  // O token vai no cabeçalho: nunca em texto aberto.
  if (!url.startsWith("https://")) return { aberta: false, motivo: "A URL do SGCP precisa ser https." };

  const [sede, itens, tarefas] = await Promise.all([
    ds.obter("sedes", f.sede_id),
    ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ds.consultar("tarefas", [{ campo: "sede_id", op: "==", valor: f.sede_id }]),
  ]);
  const nomeTarefa = new Map(tarefas.map((t) => [t.id, t.nome_tarefa]));
  const corpo = pedidoDeVaga({
    funcionario: f,
    sede: sede ?? { codigo: "", nome_sede: f.sede_id },
    rota: itens.map((i) => ({
      inicio: i.inicio_planejado,
      duracao: i.duracao_min ?? 0,
      tarefa: nomeTarefa.get(i.tarefa_id) ?? "",
    })),
    solicitante,
  });

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      // Redirecionamento levaria o token para outro endereço; e o supervisor não
      // fica preso até o limite da função se o SGCP não responder.
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { aberta: false, motivo: "O SGCP não respondeu. Tente abrir a vaga de novo mais tarde." };
  }
  const json = (await resposta.json().catch(() => ({}))) as { codigo?: string; erro?: string };
  if (!resposta.ok || !json.codigo)
    return { aberta: false, motivo: `O SGCP recusou a vaga: ${json.erro ?? `HTTP ${resposta.status}`}` };

  await ds.atualizar("funcionarios", id, { vaga_sgcp: String(json.codigo), atualizado_em: agoraISO() });
  return { aberta: true, codigo: String(json.codigo) };
}

/** Mesmo laço em lotes usado nos outros serviços — evita rajada no Firestore. */
async function emLotesFunc<T>(itens: T[], fn: (x: T) => Promise<unknown>, lote = 25): Promise<void> {
  for (let i = 0; i < itens.length; i += lote) {
    await Promise.all(itens.slice(i, i + lote).map(fn));
  }
}
