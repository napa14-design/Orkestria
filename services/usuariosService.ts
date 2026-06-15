import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Usuario } from "@/types";

export async function getUsuarios(): Promise<Usuario[]> {
  const ds = await getDataSource();
  return ds.listar("usuarios");
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

type DadosUsuario = Pick<Usuario, "nome" | "email" | "perfil" | "sede_id" | "ativo">;

export async function createUsuario(dados: DadosUsuario): Promise<Usuario> {
  const existente = await getUsuarioPorEmail(dados.email);
  if (existente) throw new Error(`Já existe um usuário ativo com o e-mail ${dados.email}.`);
  const ds = await getDataSource();
  const agora = agoraISO();
  const usuario: Usuario = {
    id: novoId(),
    ...dados,
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
  return ds.atualizar("usuarios", id, { ...mudancas, atualizado_em: agoraISO() });
}

export async function deleteUsuario(id: string): Promise<void> {
  const ds = await getDataSource();
  await ds.excluir("usuarios", id);
}
