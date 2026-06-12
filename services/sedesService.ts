import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Sede } from "@/types";
import { ErroValidacao } from "./erros";

type DadosSede = Pick<Sede, "nome_sede" | "cidade" | "endereco" | "ativo">;

export async function getSedes(): Promise<Sede[]> {
  const ds = await getDataSource();
  return ds.listar("sedes");
}

export async function createSede(dados: DadosSede, autor: string): Promise<Sede> {
  const ds = await getDataSource();
  const agora = agoraISO();
  return ds.criar("sedes", {
    id: novoId(),
    ...dados,
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateSede(
  id: string,
  mudancas: Partial<DadosSede>,
  autor: string,
): Promise<Sede> {
  const ds = await getDataSource();
  return ds.atualizar("sedes", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

/** Bloqueado quando a sede tem qualquer cadastro vinculado. */
export async function deleteSede(id: string): Promise<void> {
  const ds = await getDataSource();
  const [funcionarios, locais] = await Promise.all([
    ds.listar("funcionarios"),
    ds.listar("locais"),
  ]);
  const vinculos =
    funcionarios.filter((f) => f.sede_id === id).length +
    locais.filter((l) => l.sede_id === id).length;
  if (vinculos > 0) {
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "POSSUI_HISTORICO",
        mensagem: `Esta sede tem ${vinculos} funcionário(s)/local(is) vinculado(s). Use "Editar" e marque como Inativa.`,
      },
    ]);
  }
  await ds.excluir("sedes", id);
}
