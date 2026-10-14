import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { hojeISO } from "@/lib/dateUtils";
import { comAtivoDoDia, motivoAbreVaga, pedidoDeVaga, validarDesligamento } from "@/lib/desligamento";
import { csvDoTrio, sincronizarTrio } from "@/lib/intervalos";
import { validarFuncionario, temErro } from "@/lib/validations";
import type { Funcionario } from "@/types";
import { ErroValidacao } from "./erros";

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

export async function createFuncionario(
  dados: DadosFuncionario,
  autor: string,
): Promise<Funcionario> {
  const comIntervalos = { ...dados, intervalos: csvDoTrio(dados) };
  const alertas = validarFuncionario(comIntervalos);
  if (temErro(alertas)) throw new ErroValidacao(alertas);
  const ds = await getDataSource();
  const sede = await ds.obter("sedes", dados.sede_id);
  if (!sede)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "FUNCIONARIO_SEM_SEDE", mensagem: "Sede informada não existe." },
    ]);
  const agora = agoraISO();
  return ds.criar("funcionarios", {
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
  });
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
]);

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
  const destino = { ...atual, ...mudancas };
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

  if (destino.sede_id !== atual.sede_id) {
    const [sede, rotinas, modelos, ausencias, qualificacoes, tempos, eventuais] = await Promise.all([
      ds.obter("sedes", destino.sede_id),
      ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("ausencias", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("qualificacoes_funcionario", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("tempos_personalizados", [{ campo: "funcionario_id", op: "==", valor: id }]),
      ds.consultar("servicos_eventuais", [{ campo: "funcionario_id", op: "==", valor: id }]),
    ]);
    if (!sede)
      throw new ErroValidacao([
        { nivel: "erro", codigo: "FUNCIONARIO_SEM_SEDE", mensagem: "Sede informada não existe." },
      ]);
    const vinculos =
      rotinas.length + modelos.length + ausencias.length + qualificacoes.length + tempos.length + eventuais.length;
    if (vinculos > 0)
      throw new ErroValidacao([
        {
          nivel: "erro",
          codigo: "FUNCIONARIO_SEDE_COM_VINCULOS",
          mensagem: `Este funcionário tem ${vinculos} vínculo(s) operacional(is) e não pode mudar de sede sem uma migração assistida.`,
        },
      ]);
  }
  // Sem intervalo nenhum o trio também tem de zerar — senão sobra o par velho
  // no registro e `csvDoTrio` o traria de volta no próximo salvamento.
  const trio = destino.intervalos
    ? sincronizarTrio({ ...mudancas, intervalos: destino.intervalos })
    : { ...mudancas, intervalos: "", intervalo_inicio: "", intervalo_fim: "", intervalo_min: 0 };
  return ds.atualizar("funcionarios", id, {
    ...trio,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando há histórico — inativar preserva relatórios antigos. */
export async function deleteFuncionario(id: string): Promise<void> {
  const ds = await getDataSource();
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
  if (novo.sede_id !== antigo.sede_id)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SEDE_DIVERGENTE",
        mensagem: "A substituição vale dentro da mesma sede — a rota é do posto daquela unidade.",
      },
    ]);

  const agora = agoraISO();
  const [itens, blocos] = await Promise.all([
    ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: antigoId }]),
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: antigoId }]),
  ]);

  // 1. a rota do posto passa a ser do novo. O id do item carrega a pessoa, por
  // isso é recalculado — senão o novo item colidiria com o do antigo.
  const copiados = itens.map((item) => ({
    ...item,
    id: item.id.replace(antigoId, novoId),
    funcionario_id: novoId,
    criado_por: autor,
    criado_em: agora,
  }));
  await emLotesFunc(copiados, (item) => ds.criar("modelos_rotina", item));
  await emLotesFunc(itens, (item) => ds.excluir("modelos_rotina", item.id));

  // 2. só o que ainda é plano, e só daqui para a frente.
  const aTransferir = blocos.filter((b) => b.data >= aPartirDe && b.status === "planejada");
  const preservados = blocos.filter((b) => b.data >= aPartirDe && b.status !== "planejada").length;
  await emLotesFunc(aTransferir, (b) =>
    ds.atualizar("rotinas_planejadas", b.id, { funcionario_id: novoId, atualizado_em: agora }),
  );

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
    itensDeRota: copiados.length,
    blocosTransferidos: aTransferir.length,
    blocosPreservados: preservados,
    inativou: true,
  };
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
export async function desligarFuncionario(
  id: string,
  /**
   * `abrirVaga: false` desliga sem ir ao SGCP (quem desliga escolhe). Ausente = abre.
   * `extinguirPosto: true` (só sem vaga): o quadro diminui — a rota é apagada em vez
   * de virar posto vago. Caso real: o Pré Sul, de 4 para 3 (13/10/2026).
   */
  dados: { data?: unknown; motivo?: unknown; abrirVaga?: unknown; extinguirPosto?: unknown },
  autor: string,
  solicitante: { nome: string; email?: string },
): Promise<ResultadoDesligamento> {
  const erro = validarDesligamento(dados);
  if (erro) throw new ErroValidacao([{ nivel: "erro", codigo: "DESLIGAMENTO_INVALIDO", mensagem: erro }]);
  const data = dados.data as string;
  const motivo = dados.motivo as string;

  const ds = await getDataSource();
  const atual = await ds.obter("funcionarios", id);
  if (!atual) throw new Error("Funcionário não encontrado.");
  if (atual.desligado_em)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "JA_DESLIGADO",
        mensagem: `${atual.nome} já está desligado(a) desde ${atual.desligado_em.split("-").reverse().join("/")}.`,
      },
    ]);

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

  const [blocos, rota] = await Promise.all([
    ds.consultar("rotinas_planejadas", [{ campo: "funcionario_id", op: "==", valor: id }]),
    extinguir
      ? ds.consultar("modelos_rotina", [{ campo: "funcionario_id", op: "==", valor: id }])
      : Promise.resolve([]),
  ]);
  const daData = blocos.filter((b) => b.data >= data);
  const remover = daData.filter((b) => b.status === "planejada");
  const agora = agoraISO();
  await ds.gravarLote([
    {
      tipo: "atualizar",
      tabela: "funcionarios",
      id,
      mudancas: {
        desligado_em: data,
        motivo_desligamento: motivo,
        // Data futura (aviso prévio): segue ativo até lá — a listagem e a geração
        // tiram a pessoa sozinhas quando a data chega.
        ...(data <= hojeISO() ? { ativo: false } : {}),
        ...(extinguir ? { posto_extinto: true } : {}),
        observacoes: [
          atual.observacoes,
          `Desligado(a) em ${data.split("-").reverse().join("/")} — ${motivo}${extinguir ? " · posto extinto" : ""}.`,
        ]
          .filter(Boolean)
          .join(" · "),
        atualizado_por: autor,
        atualizado_em: agora,
      },
    },
    ...remover.map((b) => ({ tipo: "excluir" as const, tabela: "rotinas_planejadas" as const, id: b.id })),
    ...rota.map((i) => ({ tipo: "excluir" as const, tabela: "modelos_rotina" as const, id: i.id })),
  ]);

  const vaga: ResultadoVaga = !motivoAbreVaga(motivo)
    ? { aberta: false, motivo: "Abandono de emprego: o Chromos já abre a vaga sozinho depois de 15 dias de falta." }
    : extinguir
      ? { aberta: false, motivo: "o posto deixou de existir." }
      : dados.abrirVaga === false
        ? { aberta: false, motivo: "não foi pedida no desligamento. Dá para abrir depois pelo botão \"Abrir vaga\"." }
        : await abrirVagaNoSgcp(id, solicitante);
  return {
    blocosRemovidos: remover.length,
    blocosPreservados: daData.length - remover.length,
    itensDeRotaApagados: rota.length,
    vaga,
  };
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
  // Revalida o que está gravado: o motivo vai para o SGCP, e só um da lista vai.
  if (validarDesligamento({ data: f.desligado_em, motivo: f.motivo_desligamento }))
    return { aberta: false, motivo: "O desligamento gravado está incompleto (data ou motivo fora da lista)." };
  if (!motivoAbreVaga(f.motivo_desligamento ?? ""))
    return { aberta: false, motivo: "Abandono de emprego: a vaga é aberta pelo Chromos." };

  const url = process.env.SGCP_VAGAS_URL;
  const token = process.env.SGCP_VAGAS_TOKEN;
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
