import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { lerSedesExtra, podeGerirSupervisor, sessaoDoCadastro, type SessaoUsuario } from "@/lib/permissions";
import {
  DIAS_VALIDADE_CODIGO,
  gerarCodigoAcesso,
  hashSenha,
  normalizarCodigo,
  problemaNaSenha,
  verificarSenha,
} from "@/lib/senha";
import type { Usuario, UsuarioListado } from "@/types";
import { ErroPermissao, ErroValidacao } from "./erros";

/** O código de primeiro acesso está gerado e ainda dentro da validade? */
export function conviteValido(u: Usuario, agora = new Date()): boolean {
  if (!u.convite_hash) return false;
  if (!u.convite_expira_em) return false;
  const limite = new Date(u.convite_expira_em);
  return !Number.isNaN(limite.getTime()) && limite.getTime() > agora.getTime();
}

/**
 * O que a API devolve de um usuário, por lista positiva: remover campos deixaria
 * vazar o próximo que nascer (e o PUT devolvia `senha_hash`). Os booleanos saem
 * porque quem gerencia precisa ver quem ainda não entrou e quem precisa de código novo.
 */
export function usuarioPublico(u: Usuario): UsuarioListado {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    sede_id: u.sede_id,
    sedes_extra: u.sedes_extra,
    ativo: u.ativo,
    criado_em: u.criado_em,
    atualizado_em: u.atualizado_em,
    senha_definida: !!u.senha_hash,
    convite_valido: conviteValido(u),
    convite_expirado: !!u.convite_hash && !conviteValido(u),
  };
}

/** O administrador vê todos; o coordenador, só os supervisores que ele gerencia. */
export async function getUsuarios(sessao: SessaoUsuario): Promise<UsuarioListado[]> {
  const ator = await conferirAtor(sessao);
  const todos = await (await getDataSource()).listar("usuarios");
  return (ator.perfil === "administrador" ? todos : todos.filter((u) => podeGerirSupervisor(ator, u))).map(usuarioPublico);
}

/**
 * Grava a senha pessoal e **queima o código** de primeiro acesso.
 *
 * Apagar o código aqui é o que o torna de uso único: mesmo quem o tenha
 * anotado não consegue reutilizá-lo depois.
 */
export async function definirSenhaUsuario(
  id: string,
  novaSenha: string,
  codigoUsado?: string,
): Promise<number> {
  const problema = problemaNaSenha(novaSenha, codigoUsado);
  if (problema) throw new Error(problema);
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", id);
  if (!usuario) throw new Error("Usuário não encontrado.");
  // Senha nova derruba as sessões abertas em outros aparelhos (na próxima
  // reconferência). Quem chamou recebe a versão para emitir o próprio cookie
  // já com ela — senão a sessão recém-criada nasceria velha.
  const versao_sessao = (usuario.versao_sessao ?? 0) + 1;
  await ds.atualizar("usuarios", id, {
    senha_hash: hashSenha(novaSenha),
    convite_hash: "",
    convite_expira_em: "",
    versao_sessao,
    atualizado_em: agoraISO(),
  });
  return versao_sessao;
}

/**
 * O próprio usuário troca a senha em "Minha conta". Quem já tem senha precisa
 * dizer a atual: sem isso, alguns minutos com o cookie de outra pessoa bastavam
 * para trocar a senha dela e ficar com a conta (auditoria, 14/10/2026). Quem
 * ainda não tem senha (entrou só pelo Google) cria a primeira sem ela.
 */
/**
 * Devolve a versão de sessão nova, para a rota regravar o cookie de quem trocou.
 * `versaoDaSessao` é a do cookie: se o cadastro já está em outra (o admin gerou
 * código novo no meio do pedido), recusa — a rota confere antes, isto fecha o
 * intervalo entre a conferência dela e esta leitura.
 */
export async function trocarPropriaSenha(
  id: string,
  senhaAtual: string,
  novaSenha: string,
  versaoDaSessao?: number,
): Promise<number> {
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", id);
  if (!usuario) throw new Error("Usuário não encontrado.");
  // Cadastro desativado não troca senha (e com isso não regrava a sessão).
  if (usuario.ativo !== true) throw new ErroPermissao("Seu acesso está desativado.");
  if (versaoDaSessao !== undefined && (usuario.versao_sessao ?? 0) !== versaoDaSessao)
    throw new ErroPermissao("Sua sessão terminou. Entre de novo.");
  if (usuario.senha_hash && !verificarSenha(senhaAtual, usuario.senha_hash))
    throw new Error("A senha atual não confere.");
  return definirSenhaUsuario(id, novaSenha);
}

/**
 * Gera um código de primeiro acesso e devolve o texto puro **uma única vez**.
 *
 * Também apaga a senha atual: é assim que se resolve "esqueci a senha" sem
 * serviço de e-mail e sem o administrador conhecer a senha de ninguém. Chamar de
 * novo invalida o código anterior.
 */
export async function gerarConviteUsuario(id: string): Promise<{ codigo: string; expira_em: string }> {
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", id);
  if (!usuario) throw new Error("Usuário não encontrado.");
  const codigo = gerarCodigoAcesso();
  const expira = new Date(Date.now() + DIAS_VALIDADE_CODIGO * 24 * 60 * 60 * 1000);
  await ds.atualizar("usuarios", id, {
    senha_hash: "",
    convite_hash: hashSenha(normalizarCodigo(codigo)),
    convite_expira_em: expira.toISOString(),
    // "Esqueci a senha" também derruba a sessão que estiver aberta (inclusive
    // uma copiada): sem isto, com a renovação ela viveria até o teto.
    versao_sessao: (usuario.versao_sessao ?? 0) + 1,
    atualizado_em: agoraISO(),
  });
  return { codigo, expira_em: expira.toISOString() };
}

/**
 * Confere o código digitado no primeiro acesso.
 *
 * Só vale para quem **ainda não tem senha**: depois de criada, o caminho de
 * recuperação é o administrador gerar um código novo.
 */
export function codigoConfere(usuario: Usuario, codigo: string): boolean {
  if (usuario.senha_hash) return false;
  if (!conviteValido(usuario)) return false;
  return verificarSenha(normalizarCodigo(codigo), usuario.convite_hash);
}

export async function getUsuarioPorEmail(email: string): Promise<Usuario | null> {
  const ds = await getDataSource();
  const alvo = email.trim().toLowerCase();
  // A tabela inteira, de propósito: é pequena e o login é raro. Consultar pelo e-mail
  // exato não enxergava cadastro antigo em outra caixa, e duas contas assim entravam.
  const ativos = (await ds.listar("usuarios")).filter(
    (u) => u.ativo === true && String(u.email ?? "").trim().toLowerCase() === alvo,
  );
  // Duas contas ativas com o mesmo e-mail: não dá para saber quem é, então ninguém entra.
  return ativos.length === 1 ? ativos[0] : null;
}

type DadosUsuario = Pick<
  Usuario,
  "nome" | "email" | "perfil" | "sede_id" | "ativo" | "sedes_extra"
>;

async function validarSedeUsuario(sedeId: string): Promise<void> {
  if (sedeId === "geral") return;
  const ds = await getDataSource();
  const sede = await ds.obter("sedes", sedeId);
  if (!sede) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "USUARIO_SEDE_INEXISTENTE",
        mensagem: "A sede selecionada não existe mais. Escolha uma sede válida.",
      },
    ]);
  }
}

/**
 * Normaliza as sedes adicionais e confere se cada uma existe.
 *
 * Repetir a sede principal ou marcar extras junto com "geral" é ruído de
 * formulário, não erro do operador: o excesso é descartado em silêncio. Sede
 * inexistente, sim, é erro — deixaria o supervisor com um escopo morto.
 */
async function normalizarSedesExtra(
  perfil: Usuario["perfil"],
  sedePrincipal: string,
  sedesExtra: string | undefined,
): Promise<string> {
  // Só coordenador e supervisor têm escopo por sede; para os outros perfis a
  // lista não significa nada (administrador e gerência já alcançam tudo).
  if ((perfil !== "coordenador" && perfil !== "supervisor") || sedePrincipal === "geral") return "";
  const ids = [...new Set(lerSedesExtra(sedesExtra))].filter(
    (id) => id !== sedePrincipal && id !== "geral",
  );
  if (ids.length === 0) return "";
  const ds = await getDataSource();
  const inexistentes: string[] = [];
  for (const id of ids) {
    if (!(await ds.obter("sedes", id))) inexistentes.push(id);
  }
  if (inexistentes.length > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "USUARIO_SEDE_EXTRA_INEXISTENTE",
        mensagem: `Estas sedes adicionais não existem mais: ${inexistentes.join(", ")}. Revise a seleção.`,
      },
    ]);
  }
  return ids.join(",");
}

const PERFIS: ReadonlySet<unknown> = new Set<Usuario["perfil"]>([
  "administrador",
  "coordenador",
  "supervisor",
  "visualizador",
]);

/**
 * O perfil precisa existir (o corpo chega cru do formulário), e o supervisor —
 * perfil de chão, 19/10/2026 — precisa de uma sede de verdade: com "geral" ele
 * ficaria sem sede nenhuma (o escopo dele nunca vira "todas").
 */
function validarPerfil(perfil: unknown, sedeId: string): void {
  if (!PERFIS.has(perfil))
    throw new ErroValidacao([{ nivel: "erro", codigo: "PERFIL_INVALIDO", mensagem: "Perfil inválido." }]);
  if (perfil === "supervisor" && sedeId === "geral")
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "SUPERVISOR_SEM_SEDE",
        mensagem: "Supervisor precisa de uma sede principal (não \"todas as sedes\").",
      },
    ]);
}

/** Os únicos campos que o cadastro aceita do corpo; o resto é recusado, nunca copiado. */
const CAMPOS_DO_CADASTRO: ReadonlySet<string> = new Set(["nome", "email", "perfil", "sede_id", "sedes_extra", "ativo"]);
// `__x__` é nome reservado no Firestore: passaria aqui e voltaria como erro 500.
const ID_SEDE = /^(?!__.*__$)[\w-]{1,64}$/u;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/u;
const NEGADO = "Você só gerencia contas de supervisor das sedes que opera.";

const invalido = (mensagem: string) =>
  new ErroValidacao([{ nivel: "erro", codigo: "CADASTRO_INVALIDO", mensagem }]);

function normalizarEmail(valor: unknown): string {
  const texto = typeof valor === "string" ? valor.trim() : "";
  // Confere antes de baixar a caixa: o K de Kelvin (U+212A) viraria "k" e passaria.
  const ascii = texto.length <= 254 && /^[\x21-\x7e]+$/u.test(texto);
  if (!ascii || !EMAIL.test(texto.toLowerCase())) throw invalido("Informe um e-mail válido.");
  return texto.toLowerCase();
}

/**
 * Lê o corpo pela lista positiva. Espalhar o corpo no cadastro deixava gravar
 * `id`, `senha_hash` e `versao_sessao` de outra conta, e a sessão do supervisor
 * virava a de um administrador na reconferência (revisão de segurança, 04/11/2026).
 */
function lerCorpo(corpo: unknown): Partial<DadosUsuario> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw invalido("Cadastro inválido.");
  const c = corpo as Record<string, unknown>;
  if (Object.keys(c).some((k) => !CAMPOS_DO_CADASTRO.has(k))) throw invalido("Cadastro com campo não permitido.");
  const lido: Partial<DadosUsuario> = {};
  if ("nome" in c) {
    const nome = typeof c.nome === "string" ? c.nome.trim() : "";
    if (!nome || nome.length > 120 || /\p{C}/u.test(nome)) throw invalido("Informe um nome válido.");
    lido.nome = nome;
  }
  if ("email" in c) lido.email = normalizarEmail(c.email);
  if ("perfil" in c) {
    if (!PERFIS.has(c.perfil)) throw new ErroValidacao([{ nivel: "erro", codigo: "PERFIL_INVALIDO", mensagem: "Perfil inválido." }]);
    lido.perfil = c.perfil as Usuario["perfil"];
  }
  if ("sede_id" in c) {
    if (typeof c.sede_id !== "string" || !ID_SEDE.test(c.sede_id)) throw invalido("Sede inválida.");
    lido.sede_id = c.sede_id;
  }
  if ("sedes_extra" in c) {
    if (typeof c.sedes_extra !== "string") throw invalido("Sedes adicionais inválidas.");
    const extras = lerSedesExtra(c.sedes_extra);
    if (extras.some((id) => id === "geral" || !ID_SEDE.test(id))) throw invalido("Sedes adicionais inválidas.");
    lido.sedes_extra = extras.join(",");
  }
  if ("ativo" in c) {
    if (typeof c.ativo !== "boolean") throw invalido("Status inválido.");
    lido.ativo = c.ativo;
  }
  return lido;
}

/**
 * Único entre TODAS as contas, ativas ou não, em qualquer caixa: o login resolve a
 * pessoa pelo e-mail, e o histórico registra a autoria por ele. Lê a tabela, que é
 * pequena, e isto só roda ao salvar um cadastro.
 */
async function exigirEmailLivre(email: string, exceto?: string): Promise<void> {
  const ds = await getDataSource();
  const todos = await ds.listar("usuarios");
  if (todos.some((u) => u.id !== exceto && String(u.email ?? "").trim().toLowerCase() === email))
    throw invalido("Este e-mail já está em uso.");
}

/**
 * Quem está pedindo, conferido no banco: um rebaixado ainda teria até 1 h de cookie,
 * e um administrador nessa janela criaria outro administrador, que sobrevive ao
 * rebaixamento. Ações de cadastro são raras, então a leitura é barata.
 */
export async function conferirAtor(sessao: SessaoUsuario): Promise<SessaoUsuario> {
  if (sessao.perfil !== "administrador" && sessao.perfil !== "coordenador") throw new ErroPermissao(NEGADO);
  const cadastro = await (await getDataSource()).obter("usuarios", sessao.id);
  const atual = cadastro && sessaoDoCadastro(cadastro);
  if (!atual || (atual.perfil !== "administrador" && atual.perfil !== "coordenador")) throw new ErroPermissao(NEGADO);
  return atual;
}

export async function createUsuario(corpo: unknown, sessao: SessaoUsuario): Promise<Usuario> {
  const ator = await conferirAtor(sessao);
  const dados = lerCorpo(corpo);
  const { nome, email, perfil, sede_id } = dados;
  if (!nome || !email || !perfil || !sede_id) throw invalido("Preencha nome, e-mail, perfil e sede.");
  validarPerfil(perfil, sede_id);
  if (
    ator.perfil !== "administrador" &&
    !podeGerirSupervisor(ator, { id: "", perfil, sede_id, sedes_extra: dados.sedes_extra })
  )
    throw new ErroPermissao(NEGADO);
  await exigirEmailLivre(email);
  await validarSedeUsuario(sede_id);
  const sedes_extra = await normalizarSedesExtra(perfil, sede_id, dados.sedes_extra);
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("usuarios", {
    nome,
    email,
    perfil,
    sede_id,
    sedes_extra,
    ativo: dados.ativo ?? true,
    id: novoId(),
    criado_em: agora,
    atualizado_em: agora,
  });
}

export async function updateUsuario(id: string, corpo: unknown, sessao: SessaoUsuario): Promise<Usuario> {
  const ator = await conferirAtor(sessao);
  const coordenador = ator.perfil !== "administrador";
  const mudancas = lerCorpo(corpo);
  const ds = await getDataSource();
  const atual = await ds.obter("usuarios", id);
  // Mesma resposta para fora do escopo e para inexistente: não revela quem existe.
  if (coordenador && (!atual || !podeGerirSupervisor(ator, atual))) throw new ErroPermissao(NEGADO);
  if (!atual) throw new Error("Usuário não encontrado.");
  // Reativar é do administrador: um ex-funcionário não volta sem ele saber.
  if (coordenador && atual.ativo !== true && mudancas.ativo === true)
    throw new ErroPermissao("Só um administrador reativa uma conta.");
  const perfil = mudancas.perfil ?? atual.perfil;
  const sedeId = mudancas.sede_id ?? atual.sede_id;
  validarPerfil(perfil, sedeId);
  if (
    coordenador &&
    !podeGerirSupervisor(ator, { id, perfil, sede_id: sedeId, sedes_extra: mudancas.sedes_extra ?? atual.sedes_extra })
  )
    throw new ErroPermissao(NEGADO);
  await validarSedeUsuario(sedeId);
  const emailAtual = String(atual.email ?? "").trim().toLowerCase();
  // Reenviar o mesmo e-mail do formulário não é troca, nem de caixa.
  if (mudancas.email === emailAtual) delete mudancas.email;
  if (mudancas.email) await exigirEmailLivre(mudancas.email, id);
  // Renormaliza sempre, mesmo quando `sedes_extra` não veio no corpo: trocar só
  // o perfil (ou passar a sede para "geral") tem que limpar as extras, senão
  // sobra escopo pendurado num usuário que não deveria mais tê-lo.
  const sedes_extra = await normalizarSedesExtra(perfil, sedeId, mudancas.sedes_extra ?? atual.sedes_extra);
  // Mudou quem a pessoa é ou onde opera: a sessão aberta cai na próxima reconferência
  // e o código pendente morre. Sem isto, um código guardado antes de uma promoção
  // entrava como o perfil novo (revisão de segurança, 04/11/2026).
  const sensivel =
    perfil !== atual.perfil ||
    !!mudancas.email ||
    sedeId !== atual.sede_id ||
    sedes_extra !== (atual.sedes_extra ?? "") ||
    (mudancas.ativo === false && atual.ativo !== false);
  return ds.atualizar("usuarios", id, {
    ...mudancas,
    sedes_extra,
    ...(sensivel ? { versao_sessao: (atual.versao_sessao ?? 0) + 1, convite_hash: "", convite_expira_em: "" } : {}),
    atualizado_em: agoraISO(),
  });
}

/** Confere ANTES de gerar: gerar apaga a senha da pessoa. */
export async function conferirConvite(id: string, sessao: SessaoUsuario): Promise<void> {
  const ator = await conferirAtor(sessao);
  const alvo = await (await getDataSource()).obter("usuarios", id);
  if (ator.perfil !== "administrador" && (!alvo || !podeGerirSupervisor(ator, alvo))) throw new ErroPermissao(NEGADO);
  if (!alvo) throw new Error("Usuário não encontrado.");
  if (alvo.ativo !== true) throw invalido("Esta conta está inativa: reative antes de gerar um código.");
}

export async function deleteUsuario(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("usuarios", id);
}
