/**
 * RESUMO EXECUTIVO — os números da operação por sede, para o Chromos (hub da
 * Infraestrutura). `GET /api/chromos/resumo?de=AAAA-MM&ate=AAAA-MM`.
 *
 * Quem consome é outro sistema, com token próprio (`ORKESTRIA_TOKEN`) — não é
 * usuário do Orkestria, então não passa pelo login. Mesmo estilo do resumo
 * executivo do Serv3 (`OS Christus/api/_lib/resumoExecutivo.js`).
 *
 * ⚠️ NENHUMA CONTA NOVA. A ocupação é `ocupacaoPorPessoa` + `resumoDeOcupacao`
 * (lib/calculations.ts), as mesmas funções do Dashboard e do Panorama. Se o
 * Chromos e a tela divergirem, alguém duplicou uma regra.
 *
 * Definições (06/10/2026):
 *  - ocupação, ociosidade, sobrecarga: por PESSOA ativa, agrupada pela sede DELA,
 *    nos dias em que teve bloco. Ocupação média = média das ocupações individuais.
 *    Sobrecarga = acima de `ocupacao_alta` (100%, só administrador muda).
 *  - execuções: por BLOCO não cancelado, agrupado pela sede DO BLOCO (o remanejo
 *    entre sedes conta onde o trabalho foi feito). As seis contas somam sempre
 *    `execucoesPrevistas` — é a invariante que os bugs do fechamento violaram.
 *  - diasConferidos: dia de uma sede com bloco em que TODO bloco tem realizado.
 *    Não se chama "dia fechado" porque, aqui, dia fechado é sede que não abre.
 *
 * ⚠️ MÉDIA NÃO SE SOMA: `porGrupo` e `geral` são calculados sobre o conjunto
 * inteiro, nunca a partir das linhas de `porSede`.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { ocupacaoPorPessoa, resumoDeOcupacao } from "./calculations";
import type {
  ExecucaoRealizada,
  Funcionario,
  ParametrosResolvidos,
  RotinaPlanejada,
  Sede,
} from "@/types";

export const VERSAO = 1;

const MES_VALIDO = /^(\d{4})-(0[1-9]|1[0-2])$/u;
// Fortaleza é UTC-3 o ano inteiro (sem horário de verão desde 2019).
const FUSO_MS = 3 * 60 * 60 * 1000;

export type Grupo = "Colégio" | "Universidade";

/** O `grupo` da sede é código de região; o Chromos fala em Colégio × Universidade. */
const GRUPO_DO_CODIGO: Record<string, Grupo> = {
  UNI: "Universidade",
  RAL: "Colégio",
  RDT: "Colégio",
  RPQ: "Colégio",
  RSU: "Colégio",
};

/** Código desconhecido ou vazio → `null`: a sede entra no geral, não num grupo chutado. */
export function grupoDaSede(sede: Pick<Sede, "grupo">): Grupo | null {
  return GRUPO_DO_CODIGO[(sede.grupo ?? "").trim().toUpperCase()] ?? null;
}

/** Compara pelo hash: `timingSafeEqual` exige o mesmo tamanho, e o tamanho não pode vazar. */
export function tokenConfere(recebido: string, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export function mesCorrenteEmFortaleza(agora: Date): string {
  return new Date(agora.getTime() - FUSO_MS).toISOString().slice(0, 7);
}

function carimboDeFortaleza(agora: Date): string {
  return `${new Date(agora.getTime() - FUSO_MS).toISOString().slice(0, 19)}-03:00`;
}

/**
 * `de` e `ate` chegam juntos ou não chegam. Um só é pedido malformado, não
 * "período aberto". Sem os dois, é o mês corrente em Fortaleza.
 */
export function lerPeriodo(
  q: URLSearchParams,
  agora: Date,
): { de: string; ate: string } | { erro: string } {
  const de = (q.get("de") ?? "").trim();
  const ate = (q.get("ate") ?? "").trim();
  if (!de && !ate) {
    const mes = mesCorrenteEmFortaleza(agora);
    return { de: mes, ate: mes };
  }
  if (!MES_VALIDO.test(de) || !MES_VALIDO.test(ate))
    return { erro: "de e ate devem vir juntos, como AAAA-MM." };
  // AAAA-MM ordena como texto na mesma ordem que no calendário.
  if (de > ate) return { erro: "de não pode ser depois de ate." };
  return { de, ate };
}

/** Primeiro e último dia (AAAA-MM-DD) do período — os dois meses entram. */
export function limitesDeDatas(de: string, ate: string): { inicio: string; fim: string } {
  const [ano, mes] = ate.split("-").map(Number);
  // Dia 0 do mês seguinte = último dia deste (cuida de fevereiro sozinho).
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { inicio: `${de}-01`, fim: `${ate}-${String(ultimo).padStart(2, "0")}` };
}

export interface Numeros {
  pessoasPlanejadas: number;
  /** `null` sem ninguém planejado — média de nada não é 0%. */
  ocupacaoMediaPct: number | null;
  horasOciosas: number;
  pessoasEmSobrecarga: number;
  execucoesPrevistas: number;
  execucoesConformes: number;
  execucoesComAtraso: number;
  execucoesParciais: number;
  execucoesNaoRealizadas: number;
  /** Remanejada ou cancelada no registro do realizado. */
  execucoesOutras: number;
  execucoesSemRegistro: number;
  diasConferidos: number;
}

const umaCasa = (n: number) => Math.round(n * 10) / 10;

export function montarResumo(args: {
  sedes: Sede[];
  funcionarios: Funcionario[];
  /** Blocos do período (qualquer status — os cancelados saem aqui). */
  rotinas: RotinaPlanejada[];
  execucoes: ExecucaoRealizada[];
  params: ParametrosResolvidos;
  de: string;
  ate: string;
  agora: Date;
}) {
  const { sedes, params, de, ate, agora } = args;
  const ativos = args.funcionarios.filter((f) => f.ativo);
  const blocos = args.rotinas.filter((r) => r.status !== "cancelada");

  // Um realizado por bloco; se houver mais de um, vale o último gravado.
  const realizado = new Map<string, ExecucaoRealizada>();
  for (const e of args.execucoes) {
    const atual = realizado.get(e.rotina_id);
    if (!atual || (e.atualizado_em ?? "") > (atual.atualizado_em ?? "")) realizado.set(e.rotina_id, e);
  }

  const numeros = (sedeIds: Set<string>): Numeros => {
    const ocup = resumoDeOcupacao(
      ocupacaoPorPessoa(ativos.filter((f) => sedeIds.has(f.sede_id)), blocos),
      params,
    );
    const daqui = blocos.filter((r) => sedeIds.has(r.sede_id));
    const status = (s: string) => daqui.filter((r) => realizado.get(r.id)?.status_realizado === s).length;
    const conformes = status("conforme_planejado");
    const comAtraso = status("com_atraso");
    const parciais = status("parcial");
    const naoRealizadas = status("nao_realizada");
    const semRegistro = daqui.filter((r) => !realizado.has(r.id)).length;

    const dias = new Map<string, boolean>();
    for (const r of daqui) {
      const k = `${r.sede_id}|${r.data}`;
      dias.set(k, (dias.get(k) ?? true) && realizado.has(r.id));
    }

    return {
      pessoasPlanejadas: ocup.pessoasPlanejadas,
      ocupacaoMediaPct: ocup.ocupacaoMedia === null ? null : umaCasa(ocup.ocupacaoMedia),
      horasOciosas: umaCasa(ocup.ociosidadeMin / 60),
      pessoasEmSobrecarga: ocup.emSobrecarga,
      execucoesPrevistas: daqui.length,
      execucoesConformes: conformes,
      execucoesComAtraso: comAtraso,
      execucoesParciais: parciais,
      execucoesNaoRealizadas: naoRealizadas,
      // Contado, não deduzido: como resto, a soma fecharia por construção e a
      // invariante do teste não vigiaria nada (um status novo sumiria calado).
      execucoesOutras: status("remanejada") + status("cancelada"),
      execucoesSemRegistro: semRegistro,
      diasConferidos: [...dias.values()].filter(Boolean).length,
    };
  };
  const teveAlgo = (n: Numeros) => n.pessoasPlanejadas > 0 || n.execucoesPrevistas > 0;

  const porSede = [...sedes]
    .sort((a, b) => a.nome_sede.localeCompare(b.nome_sede, "pt-BR"))
    .map((s) => ({ sede: s.nome_sede, codigo: s.codigo, grupo: grupoDaSede(s), ...numeros(new Set([s.id])) }))
    .filter(teveAlgo);

  const porGrupo: Partial<Record<Grupo, Numeros>> = {};
  for (const g of ["Colégio", "Universidade"] as const) {
    const n = numeros(new Set(sedes.filter((s) => grupoDaSede(s) === g).map((s) => s.id)));
    if (teveAlgo(n)) porGrupo[g] = n;
  }

  return {
    versao: VERSAO,
    de,
    ate,
    geradoEm: carimboDeFortaleza(agora),
    porSede,
    porGrupo,
    geral: numeros(new Set(sedes.map((s) => s.id))),
  };
}
