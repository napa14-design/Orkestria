import { agoraISO, getDataSource, novoId } from "@/lib/datasource";
import type { Feriado } from "@/types";
import { ErroValidacao } from "./erros";

type DadosFeriado = Omit<
  Feriado,
  "id" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em"
>;

/**
 * Feriados/recessos. **Sempre devolve os globais** (`sede_id` vazio) junto com os
 * da sede pedida — o global é o caso comum, e filtrar só pela sede esconderia o
 * feriado nacional.
 */
export async function getFeriados(filtro?: { sedeId?: string }): Promise<Feriado[]> {
  const ds = await getDataSource();
  // Coleção pequena (uma dúzia por ano): ler tudo e filtrar em memória custa menos
  // que duas consultas, e não existe `OR` em consulta de campo único.
  const todos = await ds.listar("feriados");
  const filtrados = filtro?.sedeId
    ? todos.filter((f) => !f.sede_id || f.sede_id === filtro.sedeId)
    : todos;
  return filtrados.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
}

/**
 * Um registro fecha no máximo isto. O recesso de julho cabe; um "2027" no lugar
 * de "2026" — que fecharia todas as sedes por um ano — não. Com o coordenador
 * escrevendo também (27/10/2026), o erro de digitação ficou mais provável
 * (revisão de segurança). Recesso maior: dois registros.
 */
export const MAX_DIAS_FERIADO = 62;
const NOME_MAX = 120;

/** "AAAA-MM-DD" que é uma data de verdade (2026-13-45 não é). */
function dataReal(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function validar(dados: Partial<DadosFeriado>) {
  const erros = [];
  if (typeof dados.nome !== "string" || !dados.nome.trim() || dados.nome.length > NOME_MAX)
    erros.push({
      nivel: "erro" as const,
      codigo: "SEM_NOME",
      mensagem: `Diga o que é (ex.: Independência, Recesso de julho), em até ${NOME_MAX} caracteres.`,
    });
  if (!dataReal(dados.data_inicio) || !dataReal(dados.data_fim) || dados.data_inicio > dados.data_fim)
    erros.push({
      nivel: "erro" as const,
      codigo: "INTERVALO_INVALIDO",
      mensagem: "Intervalo inválido: use datas reais, e a final igual ou posterior à inicial.",
    });
  else {
    const dias = (Date.parse(`${dados.data_fim}T12:00:00Z`) - Date.parse(`${dados.data_inicio}T12:00:00Z`)) / 86_400_000 + 1;
    if (dias > MAX_DIAS_FERIADO)
      erros.push({
        nivel: "erro" as const,
        codigo: "INTERVALO_LONGO",
        mensagem: `Um registro fecha no máximo ${MAX_DIAS_FERIADO} dias (este tem ${dias}). Confira o ano; recesso maior, cadastre em duas partes.`,
      });
  }
  if (erros.length > 0) throw new ErroValidacao(erros);
}

/**
 * Só os campos do feriado saem do corpo. Era o objeto inteiro — inofensivo
 * enquanto só o administrador escrevia; com o coordenador (27/10/2026), um
 * `criado_por` no corpo falsificava a autoria e campo estranho ia para o banco.
 */
function soCamposDoFeriado(d: Partial<DadosFeriado>): Partial<DadosFeriado> {
  const saida: Partial<DadosFeriado> = {};
  // Nome que não é texto segue cru e cai no `validar` (antes `null` virava "null").
  if (d.nome !== undefined) saida.nome = typeof d.nome === "string" ? d.nome.trim() : (d.nome as never);
  if (d.sede_id !== undefined) saida.sede_id = String(d.sede_id);
  if (d.data_inicio !== undefined) saida.data_inicio = String(d.data_inicio);
  if (d.data_fim !== undefined) saida.data_fim = String(d.data_fim);
  if (d.ativo !== undefined) saida.ativo = d.ativo === true;
  return saida;
}

async function exigirSede(sedeId: string | undefined) {
  // Sede vazia é intencional (vale para todas); preenchida, tem de existir.
  if (sedeId && !(await (await getDataSource()).obter("sedes", sedeId))) throw new Error("Sede não encontrada.");
}

export async function createFeriado(corpo: DadosFeriado, autor: string): Promise<Feriado> {
  const dados = { ativo: true, sede_id: "", ...soCamposDoFeriado(corpo) } as DadosFeriado;
  validar(dados);
  await exigirSede(dados.sede_id);
  const ds = await getDataSource();

  const agora = agoraISO();
  return ds.criar("feriados", {
    ...dados,
    id: novoId(), // depois do spread: id do corpo não sobrescreve registro alheio
    criado_por: autor,
    criado_em: agora,
    atualizado_por: autor,
    atualizado_em: agora,
  });
}

export async function updateFeriado(
  id: string,
  corpo: Partial<DadosFeriado>,
  autor: string,
): Promise<Feriado> {
  const mudancas = soCamposDoFeriado(corpo);
  const ds = await getDataSource();
  const atual = await ds.obter("feriados", id);
  if (!atual) throw new Error("Feriado não encontrado.");
  validar({ ...atual, ...mudancas });
  await exigirSede(mudancas.sede_id);
  return ds.atualizar("feriados", id, {
    ...mudancas,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}

export async function deleteFeriado(id: string): Promise<void> {
  const ds = await getDataSource();
  // Sem isto, apagar um id que não existe respondia "ok" e deixava um
  // "excluir" fantasma no histórico.
  if (!(await ds.obter("feriados", id))) throw new Error("Feriado não encontrado.");
  await ds.excluir("feriados", id);
}
