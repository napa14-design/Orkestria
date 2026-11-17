/**
 * Resumo diário das rotas (16/11/2026, pedido do dono): às 10h de Fortaleza, de segunda a
 * sábado, quem está no parâmetro `resumo_diario_para` recebe por e-mail a situação de cada
 * sede que opera — "DT · Gerado (347 tarefas)", "SUL 1 · Não gerado"… Funções puras; quem
 * lê o banco e envia é `services/resumoDiarioService.ts`.
 */
import { feriadoDoDia } from "./calculations";
import { FUSO_OPERACAO, formatarDataBR, parseDiasSemana } from "./dateUtils";
import type { Feriado, Sede } from "@/types";

/** Chave do parâmetro global com os e-mails (CSV). Só o administrador edita (`CHAVES_SO_ADMINISTRADOR`). */
export const PARAMETRO_DESTINATARIOS = "resumo_diario_para";
/** Teto de destinatários: o parâmetro é texto livre, e cada um custa um envio. */
export const MAX_DESTINATARIOS = 10;

const PARTES = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  weekday: "short",
});
const DIA_DA_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * O envio só acontece de segunda a sábado entre 10:00 e 10:59 de Fortaleza. A rota não tem
 * chave (decisão do dono: nenhum segredo novo), então a janela é a primeira trava: chamada
 * fora dela não lê nem envia nada.
 */
export function janelaDoResumo(agora: Date): { data: string; dentro: boolean } {
  const p = Object.fromEntries(PARTES.formatToParts(agora).map((x) => [x.type, x.value]));
  const data = `${p.year}-${p.month}-${p.day}`;
  const dow = DIA_DA_SEMANA[p.weekday] ?? 0;
  // "24" aparece em alguns motores à meia-noite com hour12:false.
  const hora = Number(p.hour) % 24;
  return { data, dentro: dow >= 1 && dow <= 6 && hora === 10 };
}

/** E-mails do parâmetro: minúsculos, sem repetição, só os que têm cara de e-mail, no máximo o teto. */
export function lerDestinatarios(valor: unknown): string[] {
  if (typeof valor !== "string") return [];
  const vistos = new Set<string>();
  for (const parte of valor.split(/[,;\s]+/)) {
    const e = parte.trim().toLowerCase();
    // Estrita: o endereço vai direto para o "Para" do SMTP (sem CR/LF, vírgula, <>, aspas).
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) vistos.add(e);
  }
  return [...vistos].slice(0, MAX_DESTINATARIOS);
}

export type SituacaoSede = "nao_gerado" | "gerado" | "feriado" | "sem_rota";

export interface LinhaResumo {
  codigo: string;
  nome: string;
  situacao: SituacaoSede;
  tarefas: number;
  /** Nome do feriado, quando é feriado. */
  feriado?: string;
}

/**
 * A situação de UMA sede no dia. Dia com tarefa é "Gerado" mesmo que montado à mão;
 * sem tarefa: feriado, ou sem rota padrão para o dia da semana, ou "Não gerado".
 */
export function situacaoDaSede(args: {
  sede: Pick<Sede, "id" | "codigo" | "nome_sede">;
  data: string;
  dow: number;
  blocos: number;
  /** Itens da rota padrão da sede (só `dias_semana` importa: vazio = todos os dias). */
  itensPadrao: { dias_semana?: string }[];
  feriados: Feriado[];
}): LinhaResumo {
  const base = { codigo: args.sede.codigo || args.sede.nome_sede, nome: args.sede.nome_sede, tarefas: args.blocos };
  if (args.blocos > 0) return { ...base, situacao: "gerado" };
  const feriado = feriadoDoDia(args.feriados, args.sede.id, args.data);
  if (feriado) return { ...base, situacao: "feriado", feriado: feriado.nome };
  const temRotaHoje = args.itensPadrao.some((i) => {
    const dias = parseDiasSemana(i.dias_semana);
    return dias.length === 0 || dias.includes(args.dow);
  });
  return { ...base, situacao: temRotaHoje ? "nao_gerado" : "sem_rota" };
}

// Mesma paleta do e-mail de convite (`lib/emails/conviteAcesso.ts`), que é a Partitura em
// HTML de e-mail: tabela, estilo inline, nenhuma fonte externa.
const TINTA = "#223127";
const PAPEL = "#f5f1e6";
const CARTAO = "#fcfaf3";
const ACENTO = "#9c0d38";
const SUAVE = "#4a584e";
const APAGADO = "#8a958c";
const LINHA = "#d9d2bc";
const MONO = "Consolas,'Courier New',monospace";
const SANS = "Arial,Helvetica,sans-serif";

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const porCodigo = (a: LinhaResumo, b: LinhaResumo) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "terça-feira, 17 de novembro" — a data é dia civil, então meio-dia UTC não troca de dia. */
function diaPorExtenso(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? formatarDataBR(data)
    : d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Rótulo da seção: mono, caixa alta, espaçado — o rótulo da Partitura. */
const rotuloSecao = (texto: string, cor: string) =>
  `<div style="font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${cor};font-weight:bold;padding:0 0 8px;">${texto}</div>`;

/**
 * O e-mail: o que falta gerar em destaque, as geradas numa tabela com o número de tarefas, e
 * o resto (feriado, sem rota no dia) discreto. `url` é o endereço do sistema para o botão;
 * sem ele, o botão não aparece (melhor que link quebrado).
 */
export function montarEmailDoResumo(
  data: string,
  linhas: LinhaResumo[],
  url = "",
): { assunto: string; texto: string; html: string } {
  const faltam = linhas.filter((l) => l.situacao === "nao_gerado").sort(porCodigo);
  const geradas = linhas.filter((l) => l.situacao === "gerado").sort(porCodigo);
  const fechadas = linhas.filter((l) => l.situacao === "feriado" || l.situacao === "sem_rota").sort(porCodigo);
  const operam = faltam.length + geradas.length;
  const dia = formatarDataBR(data);
  const extenso = diaPorExtenso(data);

  const assunto = faltam.length
    ? `Orkestria · ${dia}: ${plural(faltam.length, "sede sem rota gerada", "sedes sem rota gerada")}`
    : `Orkestria · ${dia}: rotas de todas as sedes geradas`;
  const titulo = faltam.length
    ? `${plural(faltam.length, "sede ainda sem rota", "sedes ainda sem rota")}`
    : "Todas as rotas do dia estão geradas";
  const subtitulo = `${geradas.length} de ${operam} ${operam === 1 ? "sede que opera hoje já tem" : "sedes que operam hoje já têm"} o dia gerado.`;
  const motivo = (l: LinhaResumo) => (l.situacao === "feriado" ? `Feriado${l.feriado ? ` — ${l.feriado}` : ""}` : "Sem rota padrão para hoje");

  const texto = [
    `ORKESTRIA · Resumo das rotas — ${extenso}, às 10h`,
    "",
    `${titulo}. ${subtitulo}`,
    ...(faltam.length ? ["", `FALTA GERAR (${faltam.length})`, ...faltam.map((l) => `  ${l.codigo} — ${l.nome}`)] : []),
    ...(geradas.length ? ["", `GERADAS (${geradas.length})`, ...geradas.map((l) => `  ${l.codigo} — ${l.nome}: ${plural(l.tarefas, "tarefa", "tarefas")}`)] : []),
    ...(fechadas.length ? ["", "NÃO OPERAM HOJE", ...fechadas.map((l) => `  ${l.codigo} — ${motivo(l)}`)] : []),
    ...(url ? ["", `Abrir a agenda: ${url}`] : []),
  ].join("\n");

  const linhaFalta = (l: LinhaResumo) => `
          <tr><td style="padding:0 0 6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid ${ACENTO};background:#f6e9ec;">
              <tr>
                <td width="76" style="padding:10px 0 10px 12px;font-family:${MONO};font-size:14px;font-weight:bold;color:${ACENTO};white-space:nowrap;">${escapar(l.codigo)}</td>
                <td style="padding:10px 12px;font-family:${SANS};font-size:14px;color:${TINTA};">${escapar(l.nome)}</td>
              </tr>
            </table>
          </td></tr>`;
  const linhaGerada = (l: LinhaResumo, i: number) => `
            <tr>
              <td width="76" style="padding:9px 0 9px 12px;font-family:${MONO};font-size:13px;font-weight:bold;color:${TINTA};white-space:nowrap;${i ? `border-top:1px solid ${LINHA};` : ""}">${escapar(l.codigo)}</td>
              <td style="padding:9px 8px;font-family:${SANS};font-size:14px;color:${SUAVE};${i ? `border-top:1px solid ${LINHA};` : ""}">${escapar(l.nome)}</td>
              <td align="right" style="padding:9px 12px 9px 0;font-family:${MONO};font-size:13px;color:${TINTA};white-space:nowrap;${i ? `border-top:1px solid ${LINHA};` : ""}">${l.tarefas}<span style="color:${APAGADO};"> tarefa${l.tarefas === 1 ? "" : "s"}</span></td>
            </tr>`;

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPEL};padding:28px 12px;font-family:Georgia,'Times New Roman',serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARTAO};border:2px solid ${TINTA};">
      <tr><td style="background:${TINTA};padding:18px 24px;">
        <div style="color:${PAPEL};font-size:24px;font-weight:bold;letter-spacing:-0.5px;">Orkestr<span style="color:#e8a0b4;">ia</span></div>
        <div style="color:#b9c4bb;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:${MONO};padding-top:4px;">Resumo das rotas · ${escapar(extenso)} · 10h</div>
      </td></tr>

      <tr><td style="padding:24px 24px 6px;">
        <div style="font-size:24px;line-height:1.25;color:${faltam.length ? ACENTO : TINTA};font-weight:bold;">${escapar(titulo)}</div>
        <div style="font-family:${SANS};font-size:14px;line-height:1.6;color:${SUAVE};padding-top:6px;">${escapar(subtitulo)}</div>
      </td></tr>
${
  faltam.length
    ? `
      <tr><td style="padding:18px 24px 4px;">
        ${rotuloSecao(`Falta gerar · ${faltam.length}`, ACENTO)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${faltam.map(linhaFalta).join("")}
        </table>
      </td></tr>`
    : ""
}${
  geradas.length
    ? `
      <tr><td style="padding:18px 24px 4px;">
        ${rotuloSecao(`Geradas · ${geradas.length}`, TINTA)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINHA};background:#ffffff;">${geradas.map(linhaGerada).join("")}
        </table>
      </td></tr>`
    : ""
}${
  fechadas.length
    ? `
      <tr><td style="padding:18px 24px 4px;">
        ${rotuloSecao("Não operam hoje", APAGADO)}
        <div style="font-family:${SANS};font-size:13px;line-height:1.7;color:${APAGADO};">${fechadas
          .map((l) => `<span style="font-family:${MONO};font-weight:bold;">${escapar(l.codigo)}</span> — ${escapar(motivo(l))}`)
          .join("<br>")}</div>
      </td></tr>`
    : ""
}${
  url
    ? `
      <tr><td align="center" style="padding:22px 24px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td bgcolor="${ACENTO}" style="border:2px solid ${TINTA};">
            <a href="${escapar(url)}" style="display:inline-block;padding:13px 28px;color:${PAPEL};font-family:${SANS};font-size:15px;font-weight:bold;text-decoration:none;">Abrir a agenda &rarr;</a>
          </td></tr>
        </table>
      </td></tr>`
    : ""
}
      <tr><td style="padding:18px 24px 22px;">
        <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${APAGADO};border-top:1px solid ${LINHA};padding-top:14px;">
          Enviado de segunda a sábado às 10h, com as sedes que você coordena. Para sair da lista,
          fale com quem administra o Orkestria.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
  return { assunto, texto, html };
}
