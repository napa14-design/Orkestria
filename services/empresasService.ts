/**
 * Cadastro de EMPRESAS (decisão do dono, 13/11/2026): lista fechada, mantida pelo
 * administrador. O funcionário no quadro só aceita empresa ATIVA daqui
 * (`exigirEmpresaDoCadastro`). O nome é sempre o de `normalizarEmpresa` e nunca muda:
 * renomear mudaria, em silêncio, a empresa de todas as fichas que a usam — e o que já
 * foi para o Chromos. Excluir também não existe; desativar tira da lista sem apagar.
 */
import { agoraISO, getDataSource } from "@/lib/datasource";
import { empresaAmbigua, idDaEmpresa, normalizarEmpresa } from "@/lib/empresas";
import type { Empresa } from "@/types";
import { ErroValidacao } from "./erros";

const recusa = (codigo: string, mensagem: string) => new ErroValidacao([{ nivel: "erro", codigo, mensagem }]);

/** Nome de empresa é curto; o normalizado já não tem invisível nem traço. */
const MAX_NOME = 60;

async function porNome(nome: string): Promise<Empresa[]> {
  const ds = await getDataSource();
  return ds.consultar("empresas", [{ campo: "nome", op: "==", valor: nome }]);
}

/** Todas (ativas e inativas), por nome. Para a tela do administrador. */
export async function getEmpresas(): Promise<Empresa[]> {
  const ds = await getDataSource();
  return (await ds.listar("empresas")).sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Os nomes das ativas, em ordem: o que o cadastro de funcionário oferece. */
export async function getNomesAtivos(): Promise<string[]> {
  return (await getEmpresas()).filter((e) => e.ativo).map((e) => e.nome);
}

export async function createEmpresa(dados: { nome?: unknown }, autor: string): Promise<Empresa> {
  const bruto = typeof dados.nome === "string" ? dados.nome : "";
  if (/\p{Cc}/u.test(bruto) || /^[=+\-@]/u.test(bruto.trim()))
    throw recusa("EMPRESA_INVALIDA", "O nome da empresa não pode ter caractere de controle nem começar com = + - @.");
  const nome = normalizarEmpresa(bruto);
  const ambigua = empresaAmbigua(nome);
  if (ambigua) throw recusa("EMPRESA_INVALIDA", ambigua === "campo vazio" ? "Informe o nome da empresa." : `Empresa "${nome}": ${ambigua}.`);
  if (nome.length > MAX_NOME) throw recusa("EMPRESA_INVALIDA", `O nome da empresa pode ter até ${MAX_NOME} caracteres.`);
  const existentes = await porNome(nome);
  if (existentes.length)
    throw recusa(
      "EMPRESA_JA_CADASTRADA",
      existentes.some((e) => e.ativo) ? `${nome} já está no cadastro.` : `${nome} já está no cadastro, desativada: reative-a.`,
    );
  const agora = agoraISO();
  const ds = await getDataSource();
  return ds.criar("empresas", {
    id: idDaEmpresa(nome),
    nome,
    ativo: true,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

/**
 * Só `ativo` muda. Um `nome` diferente do gravado é recusado (não se renomeia); igual,
 * passa — a tela pode mandar o registro de volta.
 */
export async function updateEmpresa(dados: { id?: unknown; nome?: unknown; ativo?: unknown }, autor: string): Promise<Empresa> {
  const ds = await getDataSource();
  const atual = typeof dados.id === "string" ? await ds.obter("empresas", dados.id) : null;
  if (!atual) throw recusa("EMPRESA_INEXISTENTE", "Empresa não encontrada.");
  if (dados.nome !== undefined && dados.nome !== atual.nome)
    throw recusa("EMPRESA_NAO_RENOMEIA", "O nome de uma empresa não muda. Cadastre a nova e desative a antiga.");
  if (typeof dados.ativo !== "boolean") throw recusa("EMPRESA_SEM_MUDANCA", "Informe ativo: true ou false.");
  return ds.atualizar("empresas", atual.id, { ativo: dados.ativo, atualizado_por: autor, atualizado_em: agoraISO() });
}

/**
 * Empresa de funcionário no quadro: tem de estar ATIVA no cadastro, comparada na grafia
 * padrão. Devolve a grafia do cadastro (a que é gravada).
 */
export async function exigirEmpresaDoCadastro(empresa: unknown): Promise<string> {
  const nome = normalizarEmpresa(empresa);
  if (nome && (await porNome(nome)).some((e) => e.ativo)) return nome;
  throw recusa(
    "EMPRESA_FORA_DO_CADASTRO",
    nome
      ? `A empresa "${nome}" não está no cadastro de empresas. Escolha uma da lista ou peça ao administrador para cadastrá-la.`
      : "Escolha a empresa da lista.",
  );
}
