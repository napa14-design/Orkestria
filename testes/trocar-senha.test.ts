/**
 * Troca da própria senha pede a atual (auditoria, 14/10/2026): sem isso, alguns
 * minutos com o cookie de outra pessoa bastavam para ficar com a conta dela.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/datasource";
import { reiniciarBanco } from "@/lib/memoryStore";
import { hashSenha, verificarSenha } from "@/lib/senha";
import { trocarPropriaSenha } from "@/services/usuariosService";
import { ErroPermissao } from "@/services/erros";
import type { Usuario } from "@/types";

const ATUAL = "Atual-segura-123";
const NOVA = "Nova-senha-forte-456";

async function usuario(comSenha: boolean) {
  const ds = await getDataSource();
  const u = {
    id: "u-teste", nome: "Teste", email: "teste@x.com", perfil: "supervisor", sede_id: "christus_dt",
    ativo: true, ...(comSenha ? { senha_hash: hashSenha(ATUAL) } : {}),
    criado_em: "", atualizado_em: "",
  } as unknown as Usuario;
  await ds.criar("usuarios", u);
  return u.id;
}
const hashDe = async (id: string) => (await (await getDataSource()).obter("usuarios", id))?.senha_hash;

describe("trocarPropriaSenha", () => {
  beforeEach(() => reiniciarBanco());

  it("recusa com a senha atual errada ou vazia, e a senha não muda", async () => {
    const id = await usuario(true);
    await expect(trocarPropriaSenha(id, "errada", NOVA)).rejects.toThrow(/atual não confere/);
    await expect(trocarPropriaSenha(id, "", NOVA)).rejects.toThrow(/atual não confere/);
    expect(verificarSenha(ATUAL, await hashDe(id))).toBe(true);
  });

  it("troca com a senha atual certa", async () => {
    const id = await usuario(true);
    await trocarPropriaSenha(id, ATUAL, NOVA);
    expect(verificarSenha(NOVA, await hashDe(id))).toBe(true);
  });

  it("quem ainda não tem senha (entrou só pelo Google) cria a primeira sem a atual", async () => {
    const id = await usuario(false);
    await trocarPropriaSenha(id, "", NOVA);
    expect(verificarSenha(NOVA, await hashDe(id))).toBe(true);
  });

  // A rota já barra antes; estas travas do serviço valem para qualquer outro
  // chamador (revisão de segurança, 22/10/2026).
  it("cadastro desativado não troca a senha", async () => {
    const id = await usuario(true);
    await (await getDataSource()).atualizar("usuarios", id, { ativo: false });
    await expect(trocarPropriaSenha(id, ATUAL, NOVA)).rejects.toBeInstanceOf(ErroPermissao);
    expect(verificarSenha(ATUAL, await hashDe(id))).toBe(true);
  });

  it("versão de sessão diferente da do cadastro (código novo no meio) recusa", async () => {
    const id = await usuario(true);
    await (await getDataSource()).atualizar("usuarios", id, { versao_sessao: 2 });
    await expect(trocarPropriaSenha(id, ATUAL, NOVA, 1)).rejects.toBeInstanceOf(ErroPermissao);
    expect(verificarSenha(ATUAL, await hashDe(id))).toBe(true);
    expect(await trocarPropriaSenha(id, ATUAL, NOVA, 2)).toBe(3);
  });
});
