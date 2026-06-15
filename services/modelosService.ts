/**
 * Modelos de rotina (templates): salvar o dia montado com um nome e
 * reaplicá-lo em qualquer data ou período. A aplicação reaproveita
 * createRotina, então todas as validações de alocação continuam valendo —
 * itens que conflitam são pulados e contabilizados.
 */
import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { ModeloRotinaItem } from "@/types";
import { ErroValidacao } from "./erros";
import { createRotina, getRotinasByData } from "./rotinasService";

export interface ResumoModelo {
  nome_modelo: string;
  sede_id: string;
  itens: number;
  criado_por: string;
  criado_em: string;
}

export async function getModelos(sedeId?: string): Promise<ResumoModelo[]> {
  const ds = await getDataSource();
  const itens = sedeId
    ? await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
    : await ds.listar("modelos_rotina");
  const grupos = new Map<string, ResumoModelo>();
  for (const item of itens) {
    const chave = `${item.sede_id}::${item.nome_modelo}`;
    const atual = grupos.get(chave);
    if (atual) atual.itens++;
    else
      grupos.set(chave, {
        nome_modelo: item.nome_modelo,
        sede_id: item.sede_id,
        itens: 1,
        criado_por: item.criado_por,
        criado_em: item.criado_em,
      });
  }
  return [...grupos.values()].sort((a, b) => a.nome_modelo.localeCompare(b.nome_modelo));
}

/** Salva o dia como modelo; se o nome já existir na sede, sobrescreve. */
export async function salvarModelo(
  nome: string,
  dataOrigem: string,
  sedeId: string,
  autor: string,
): Promise<{ itens: number }> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "MODELO_SEM_NOME", mensagem: "Informe um nome para o modelo." },
    ]);
  const rotinas = (await getRotinasByData(dataOrigem, sedeId)).filter(
    (r) => r.status !== "cancelada",
  );
  if (rotinas.length === 0)
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "MODELO_VAZIO",
        mensagem: `Não há rotinas em ${dataOrigem} para salvar como modelo.`,
      },
    ]);

  await excluirModelo(nomeLimpo, sedeId); // sobrescreve
  const ds = await getDataSource();
  const agora = agoraISO();
  for (const r of rotinas) {
    const item: ModeloRotinaItem = {
      id: novoId(),
      nome_modelo: nomeLimpo,
      sede_id: sedeId,
      funcionario_id: r.funcionario_id,
      tarefa_id: r.tarefa_id,
      local_id: r.local_id,
      inicio_planejado: r.inicio_planejado,
      criado_por: autor,
      criado_em: agora,
    };
    await ds.criar("modelos_rotina", item);
  }
  return { itens: rotinas.length };
}

export interface ResultadoAplicacao {
  criadas: number;
  puladas: number;
  detalhes: string[];
}

/** Aplica o modelo em uma ou mais datas; conflitos são pulados, não erram. */
export async function aplicarModelo(
  nome: string,
  sedeId: string,
  datas: string[],
  supervisorId: string,
): Promise<ResultadoAplicacao> {
  const ds = await getDataSource();
  const itens = (
    await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
  ).filter((m) => m.nome_modelo === nome);
  if (itens.length === 0)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "MODELO_INEXISTENTE", mensagem: `Modelo "${nome}" não encontrado.` },
    ]);

  const resultado: ResultadoAplicacao = { criadas: 0, puladas: 0, detalhes: [] };
  for (const data of datas) {
    for (const item of itens) {
      try {
        await createRotina(
          {
            data,
            funcionario_id: item.funcionario_id,
            tarefa_id: item.tarefa_id,
            inicio_planejado: item.inicio_planejado,
            observacao: `Modelo: ${nome}`,
          },
          supervisorId,
        );
        resultado.criadas++;
      } catch (e) {
        resultado.puladas++;
        if (e instanceof ErroValidacao && resultado.detalhes.length < 8) {
          resultado.detalhes.push(`${data} ${item.inicio_planejado}: ${e.message}`);
        }
      }
    }
  }
  return resultado;
}

export async function excluirModelo(nome: string, sedeId: string): Promise<number> {
  const ds = await getDataSource();
  const itens = (
    await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: sedeId }])
  ).filter((m) => m.nome_modelo === nome);
  for (const item of itens) await ds.excluir("modelos_rotina", item.id);
  return itens.length;
}
