/**
 * EVENTOS DO QUADRO — o lado do Orkestria do contrato "Orkestria → Cromos: contrato de
 * eventos do Quadro (v1)" (vault, com as emendas do `seguranca`, 13/11/2026).
 *
 * Para a função ASG, quem entra, sai e muda de sede nasce aqui; o Chromos lê o feed
 * (`GET /api/chromos/eventos-quadro`) e aplica no Quadro da Infra. Regras desta ponta:
 *  - o evento é gravado NO MESMO `gravarLote` da mudança (mudança sem evento, ou evento
 *    sem mudança, não pode existir);
 *  - é montado DO QUE FICOU GRAVADO na ficha, nunca do corpo do pedido;
 *  - só ASG (`ehAsg`);
 *  - a coleção é só de inclusão (`TABELAS_SO_DE_INCLUSAO`).
 *
 * Puro: sem banco. Os serviços montam; a rota do feed filtra e recorta.
 */
import { dataReal, hojeISO, somarDias } from "./dateUtils";
import { motivoParaOCromos } from "./desligamento";
import type { EventoQuadro, Funcionario, TipoEventoQuadro } from "@/types";

/**
 * ASG é o cargo "ASG" ou "Auxiliar de Serviços Gerais", em qualquer caixa, acento,
 * pontuação ou espaço ("A.S.G.", "auxiliar de serviços  gerais"). Cargo vazio NÃO é
 * ASG: sem cargo gravado não há como afirmar a função, e o evento que não sai deixa o
 * Chromos como está (o RH continua lançando lá) — o lado seguro.
 */
export function ehAsg(cargo: string | undefined): boolean {
  const forma = String(cargo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\p{Cf}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  return forma === "ASG" || forma === "A S G" || forma === "AUXILIAR DE SERVICOS GERAIS";
}

/**
 * Escrito de outro jeito, mas ainda ASG ("ASG 1", "Aux. de Serviços Gerais", "Serviços Gerais"). Só para RECUSAR como
 * função nova em "Outra função": aceitar emitiria a saída do Quadro de quem não saiu, sem volta.
 */
export function pareceAsg(cargo: string): boolean {
  const forma = cargo.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return /^A ?S ?GS?\b/.test(forma) || /^((AUX\w*|AGENTE) )?(DE )?S(ERV\w*)? GER/.test(forma);
}

const PREFIXO: Record<TipoEventoQuadro, string> = { admissao: "adm", desligamento: "desl", transferencia: "transf" };

/** `adm_<id>`, `desl_<id>`, `transf_<idDaOrigem>` — o Chromos recalcula e confere. */
export function idDoEvento(tipo: TipoEventoQuadro, funcionarioId: string): string {
  return `${PREFIXO[tipo]}_${funcionarioId}`;
}

/** Na transferência para fora das sedes, o destino vai só como "setor", sem o texto livre. */
export const SEDE_SETOR = "setor";

/**
 * O evento, a partir da ficha COMO ELA FICA GRAVADA no mesmo lote. `funcionario` é o
 * registro final (o atual com as mudanças aplicadas), não o corpo do pedido.
 */
export function montarEvento(a: {
  tipo: TipoEventoQuadro;
  funcionario: Pick<
    Funcionario,
    "id" | "matricula" | "empresa" | "nome_completo" | "data_admissao" | "cargo" | "identidade_alterada_em" | "desligado_em" | "motivo_desligamento"
  >;
  dataEfetiva: string;
  sedeDe: string;
  sedePara: string;
  autor: string;
  registradoEm: string;
}): EventoQuadro {
  const f = a.funcionario;
  return {
    id: idDoEvento(a.tipo, f.id),
    tipo: a.tipo,
    dataEfetiva: a.dataEfetiva,
    registradoEm: a.registradoEm,
    matricula: f.matricula ?? "",
    empresa: f.empresa ?? "",
    nome: f.nome_completo ?? "",
    ...(a.tipo === "admissao" ? { admissao: f.data_admissao ?? "" } : {}),
    // Normalizado: "A.S.G." ou "Auxiliar de Serviços Gerais" vão como "ASG" (revisão de segurança, 16/11/2026).
    funcao: ehAsg(f.cargo) ? "ASG" : (f.cargo ?? ""),
    identidadeAlteradaEm: f.identidade_alterada_em ?? "",
    sedeDe: a.sedeDe,
    sedePara: a.sedePara,
    ...(a.tipo === "desligamento" ? { motivo: motivoParaOCromos(f.motivo_desligamento) } : {}),
    autor: a.autor,
    funcionarioId: f.id,
  };
}

/**
 * LISTA POSITIVA do feed: só estes campos saem, e `admissao`/`motivo` só no tipo deles.
 * Um campo novo na coleção (ou um lixo gravado à mão) não vaza sozinho.
 */
const CAMPOS_COMUNS = [
  "id", "tipo", "dataEfetiva", "registradoEm", "matricula", "empresa", "nome", "funcao",
  "identidadeAlteradaEm", "sedeDe", "sedePara", "autor", "funcionarioId",
] as const;

export function paraOFeed(e: EventoQuadro): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const campo of CAMPOS_COMUNS) saida[campo] = String(e[campo] ?? "");
  if (e.tipo === "admissao") saida.admissao = String(e.admissao ?? "");
  if (e.tipo === "desligamento") saida.motivo = motivoParaOCromos(e.motivo);
  return saida;
}

/**
 * Retenção (decisão do dono, 16/11/2026): evento com mais de 90 dias é apagado de carona
 * no próprio feed, uma vez por dia, depois de uma leitura bem-sucedida do Chromos (sem cron
 * e sem segredo novo — decisão do dono). O feed só olha 60 dias para trás, então o Chromos
 * já leu tudo o que sai. Se o Chromos parar de ler, nada expira.
 */
export const RETENCAO_DIAS = 90;

/**
 * O instante antes do qual o evento sai: 00:00 de Fortaleza (UTC−3, sem horário de verão)
 * do dia `hoje − RETENCAO_DIAS`. Sai o que tem `registradoEm` ESTRITAMENTE anterior.
 */
export function limiteDoExpurgo(hoje: string): string {
  return `${somarDias(hoje, -RETENCAO_DIAS)}T03:00:00.000Z`;
}

/** Janela máxima do feed, em dias para trás a partir de hoje (Fortaleza). */
export const JANELA_DIAS = 60;
/**
 * Teto do feed: acima disso a resposta é 413, nunca lista cortada (emenda 3). 500 cobre
 * com folga a carga do RH de 13/11 (~125 fichas) e uma rede de ~20 sedes numa janela de
 * 60 dias; se estourar, o Chromos pede uma janela menor (`desde` mais recente).
 */
export const TETO_EVENTOS = 500;
/** O outro teto do Chromos (16/11/2026): a resposta inteira até 512 KB. */
export const TETO_BYTES = 512 * 1024;

/**
 * `?desde=AAAA-MM-DD` estrito: um só, dia real, não futuro e no máximo `JANELA_DIAS`
 * atrás, contados em America/Fortaleza. Fora disso, erro — a janela nunca é ajustada
 * por conta própria. Os outros parâmetros são ignorados.
 */
export function lerDesde(params: URLSearchParams): { desde: string } | { erro: string } {
  const valores = params.getAll("desde");
  if (valores.length !== 1) return { erro: "Informe um único ?desde=AAAA-MM-DD." };
  const desde = valores[0];
  if (!dataReal(desde)) return { erro: "desde precisa ser uma data real no formato AAAA-MM-DD." };
  const hoje = hojeISO();
  if (desde > hoje) return { erro: "desde não pode ser no futuro." };
  if (desde < somarDias(hoje, -JANELA_DIAS)) return { erro: `desde pode ser de no máximo ${JANELA_DIAS} dias atrás.` };
  return { desde };
}
