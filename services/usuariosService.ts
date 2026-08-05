import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import { lerSedesExtra } from "@/lib/permissions";
import {
  DIAS_VALIDADE_CODIGO,
  gerarCodigoAcesso,
  hashSenha,
  normalizarCodigo,
  problemaNaSenha,
  verificarSenha,
} from "@/lib/senha";
import type { Usuario, UsuarioListado } from "@/types";
import { ErroValidacao } from "./erros";

/** O código de primeiro acesso está gerado e ainda dentro da validade? */
export function conviteValido(u: Usuario, agora = new Date()): boolean {
  if (!u.convite_hash) return false;
  if (!u.convite_expira_em) return false;
  const limite = new Date(u.convite_expira_em);
  return !Number.isNaN(limite.getTime()) && limite.getTime() > agora.getTime();
}

/**
 * Troca os hashes por indicadores booleanos.
 *
 * Nem a senha nem o código saem do servidor; os booleanos saem porque o
 * administrador precisa ver quem ainda não entrou e quem precisa de código novo.
 */
function semSegredos(u: Usuario): UsuarioListado {
  const { senha_hash, convite_hash, ...resto } = u;
  return {
    ...resto,
    senha_definida: !!senha_hash,
    convite_valido: conviteValido(u),
    convite_expirado: !!convite_hash && !conviteValido(u),
  };
}

export async function getUsuarios(): Promise<UsuarioListado[]> {
  const ds = await getDataSource();
  return (await ds.listar("usuarios")).map(semSegredos);
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
): Promise<void> {
  const problema = problemaNaSenha(novaSenha, codigoUsado);
  if (problema) throw new Error(problema);
  const ds = await getDataSource();
  const usuario = await ds.obter("usuarios", id);
  if (!usuario) throw new Error("Usuário não encontrado.");
  await ds.atualizar("usuarios", id, {
    senha_hash: hashSenha(novaSenha),
    convite_hash: "",
    convite_expira_em: "",
    atualizado_em: agoraISO(),
  });
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
  // lê só o(s) usuário(s) com este e-mail (campo único) em vez de toda a tabela
  const alvo = email.trim().toLowerCase();
  const achados = await ds.consultar("usuarios", [{ campo: "email", op: "==", valor: alvo }]);
  // tolera cadastros antigos com e-mail em outra caixa
  const lista = achados.length
    ? achados
    : (await ds.listar("usuarios")).filter((u) => u.email.toLowerCase() === alvo);
  return lista.find((u) => u.ativo) ?? null;
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
  // Só supervisor tem escopo por sede; para os outros perfis a lista não
  // significa nada (administrador e gerência já alcançam tudo).
  if (perfil !== "supervisor" || sedePrincipal === "geral") return "";
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

export async function createUsuario(dados: DadosUsuario): Promise<Usuario> {
  const existente = await getUsuarioPorEmail(dados.email);
  if (existente) throw new Error(`Já existe um usuário ativo com o e-mail ${dados.email}.`);
  await validarSedeUsuario(dados.sede_id);
  const sedes_extra = await normalizarSedesExtra(
    dados.perfil,
    dados.sede_id,
    dados.sedes_extra,
  );
  const ds = await getDataSource();
  const agora = agoraISO();
  const usuario: Usuario = {
    id: novoId(),
    ...dados,
    sedes_extra,
    criado_em: agora,
    atualizado_em: agora,
  };
  return ds.criar("usuarios", usuario);
}

export async function updateUsuario(
  id: string,
  mudancas: Partial<DadosUsuario>,
): Promise<Usuario> {
  const ds = await getDataSource();
  const atual = await ds.obter("usuarios", id);
  if (!atual) throw new Error("Usuário não encontrado.");
  const perfil = mudancas.perfil ?? atual.perfil;
  const sedeId = mudancas.sede_id ?? atual.sede_id;
  await validarSedeUsuario(sedeId);
  // Renormaliza sempre, mesmo quando `sedes_extra` não veio no corpo: trocar só
  // o perfil (ou passar a sede para "geral") tem que limpar as extras, senão
  // sobra escopo pendurado num usuário que não deveria mais tê-lo.
  const sedes_extra = await normalizarSedesExtra(
    perfil,
    sedeId,
    mudancas.sedes_extra ?? atual.sedes_extra,
  );
  return ds.atualizar("usuarios", id, {
    ...mudancas,
    sedes_extra,
    atualizado_em: agoraISO(),
  });
}

export async function deleteUsuario(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("usuarios", id);
}
