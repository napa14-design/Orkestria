/**
 * Leitura do Quadro da Infra no Chromos e o cruzamento por sede (23/10/2026).
 * Regras do cruzamento em `lib/quadroInfra.ts`.
 *
 * ⚠️ FALHA DO CHROMOS TEM MENSAGEM FIXA. O `comSessao` devolve `e.message` de
 * erro genérico ao navegador; o corpo, a URL ou o IP do outro lado chegariam ao
 * coordenador. Tudo que dá errado na leitura vira `QuadroIndisponivel`, e o log
 * leva só o status (revisão de segurança, 23/10/2026).
 */
import { agoraISO, getDataSource } from "@/lib/datasource";
import { hojeISO } from "@/lib/dateUtils";
import { comAtivoDoDia } from "@/lib/desligamento";
import { minhaChave } from "@/lib/chaves";
import {
  cruzar,
  lerPessoas,
  mapaDeSedes,
  nomeConfereNaSede,
  normalizarMatricula,
  QUADRO_FORA_DO_AR,
  QUADRO_NAO_CONFIGURADO,
  type Divergencias,
  type PessoaQuadro,
} from "@/lib/quadroInfra";
import type { Funcionario } from "@/types";
import { ErroPermissao, ErroValidacao } from "./erros";
import { exigirMatriculaLivre } from "./funcionariosService";

export class QuadroIndisponivel extends Error {
  constructor(readonly configurado: boolean) {
    super(configurado ? QUADRO_FORA_DO_AR : QUADRO_NAO_CONFIGURADO);
    this.name = "QuadroIndisponivel";
  }
}

/**
 * 10 min em memória. Cada leitura custa ~400 documentos no banco do Chromos; o
 * cache guarda o Quadro JÁ projetado (`lerPessoas`), nunca as divergências — elas
 * saem a cada pedido com a sessão de quem pede, então um escopo não serve outro.
 */
const VALIDADE_MS = 10 * 60 * 1000;
const TETO_BYTES = 2_000_000;
let guardado: { pessoas: PessoaQuadro[]; expira: number } | null = null;

/** Só para os testes. */
export function esquecerQuadro() {
  guardado = null;
}

export async function lerQuadro(agora = Date.now()): Promise<PessoaQuadro[]> {
  if (guardado && guardado.expira > agora) return guardado.pessoas;
  const url = process.env.CHROMOS_QUADRO_URL;
  const token = minhaChave();
  // https antes de mandar o token: em http ele viajaria aberto.
  if (!url || !token || !url.startsWith("https://")) throw new QuadroIndisponivel(false);

  let pessoas: PessoaQuadro[];
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      // Redirecionamento levaria o token para outro endereço.
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`[quadro-infra] o Chromos respondeu ${r.status}`);
      throw new QuadroIndisponivel(true);
    }
    const texto = await r.text();
    if (texto.length > TETO_BYTES) throw new Error("grande demais");
    pessoas = lerPessoas(JSON.parse(texto));
  } catch (e) {
    if (e instanceof QuadroIndisponivel) throw e;
    console.error("[quadro-infra] leitura do Chromos falhou:", e instanceof Error ? e.name : "erro");
    throw new QuadroIndisponivel(true);
  }
  // Lista vazia não fica guardada: se foi defeito de lá, não vira "sem
  // divergências" por dez minutos.
  if (pessoas.length) guardado = { pessoas, expira: agora + VALIDADE_MS };
  return pessoas;
}

export interface DivergenciasDaSede extends Divergencias {
  /** Código da sede no Chromos; `null` = esta sede não tem correspondente lá. */
  sedeNoChromos: string | null;
}

const VAZIO: Divergencias = { semVinculo: [], desligados: [], outraSede: [], naoConfere: [], foraDoOrkestria: null };

const paraCruzar = (f: Funcionario) => ({
  id: f.id,
  nome: f.nome,
  sede_id: f.sede_id,
  matricula: f.matricula,
  empresa: f.empresa,
  ativo: f.ativo !== false,
  desligado_em: f.desligado_em,
});

/** As divergências de uma sede. Quem chama já conferiu que a sessão alcança `sedeId`. */
export async function divergenciasDaSede(sedeId: string): Promise<DivergenciasDaSede> {
  const ds = await getDataSource();
  const [sedes, funcionarios] = await Promise.all([ds.listar("sedes"), ds.listar("funcionarios")]);
  const mapa = mapaDeSedes(sedes);
  const sedeNoChromos = mapa.get(sedeId) ?? null;
  // Sede sem correspondente não vai buscar nada lá.
  if (!sedeNoChromos) return { sedeNoChromos, ...VAZIO };
  const quadro = await lerQuadro();
  const hoje = hojeISO();
  const todos = funcionarios.map((f) => paraCruzar(comAtivoDoDia(f, hoje)));
  return {
    sedeNoChromos,
    ...cruzar({ sedeNoChromos, daSede: todos.filter((f) => f.sede_id === sedeId), todos, quadro, mapa }),
  };
}

const naoAchou = () =>
  new ErroValidacao([
    { nivel: "erro", codigo: "QUADRO_NAO_CONFERE", mensagem: "Essa pessoa não está no Quadro desta sede com este nome." },
  ]);

/**
 * "Vincular": grava a matrícula e a empresa DO QUADRO no funcionário. O cliente
 * manda só os dois ids — matrícula nenhuma vem dele. Vale só para pessoa do
 * Quadro da mesma sede e com o nome conferindo.
 */
export async function vincularAoQuadro(
  funcionarioId: string,
  quadroId: string,
  podeAlterarSede: (sedeId: string) => boolean,
  autor: string,
): Promise<Funcionario> {
  const ds = await getDataSource();
  const f = await ds.obter("funcionarios", funcionarioId);
  if (!f) throw new Error("Funcionário não encontrado.");
  if (!podeAlterarSede(f.sede_id))
    throw new ErroPermissao("Coordenadores só alteram funcionários das sedes que operam.");
  if (comAtivoDoDia(f, hojeISO()).ativo === false || f.desligado_em)
    throw new ErroValidacao([
      { nivel: "erro", codigo: "QUADRO_DESLIGADO", mensagem: "Funcionário desligado não se vincula ao Quadro." },
    ]);
  if (normalizarMatricula(f.matricula))
    throw new ErroValidacao([
      {
        nivel: "erro",
        codigo: "QUADRO_JA_VINCULADO",
        mensagem: "Este funcionário já tem matrícula. Para trocar, apague a matrícula no cadastro primeiro.",
      },
    ]);
  const sedeNoChromos = mapaDeSedes(await ds.listar("sedes")).get(f.sede_id);
  if (!sedeNoChromos) throw naoAchou();
  const p = (await lerQuadro()).find((q) => q.id === quadroId);
  if (!p || p.sede !== sedeNoChromos || !p.matricula || !nomeConfereNaSede(f.nome, p.nome)) throw naoAchou();
  await exigirMatriculaLivre(p.matricula, p.empresa, f.id);
  return ds.atualizar("funcionarios", f.id, {
    matricula: p.matricula,
    empresa: p.empresa,
    atualizado_por: autor,
    atualizado_em: agoraISO(),
  });
}
