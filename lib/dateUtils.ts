/** Utilitários de data/hora. Horários circulam como "HH:mm" e minutos. */

/** "07:30" → 450. Retorna NaN para valores inválidos. */
export function hhmmParaMin(hhmm: string): number {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 450 → "07:30" */
export function minParaHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 95 → "1h35" / 60 → "1h" / 45 → "45min" */
export function formatarDuracao(min: number): string {
  if (!Number.isFinite(min)) return "—";
  const neg = min < 0;
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  let texto: string;
  if (h === 0) texto = `${m}min`;
  else if (m === 0) texto = `${h}h`;
  else texto = `${h}h${String(m).padStart(2, "0")}`;
  return neg ? `-${texto}` : texto;
}

/**
 * Fuso da operação. **Não é preferência de exibição: é a definição de "hoje".**
 * A jornada acontece em Fortaleza, e é o dia de lá que decide qual rotina é a de
 * hoje.
 */
export const FUSO_OPERACAO = "America/Fortaleza";

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Data de hoje (YYYY-MM-DD) **no fuso da operação**, não no do ambiente.
 *
 * Era `new Date().getFullYear()/getMonth()/getDate()`, ou seja, o fuso de quem
 * executa. No navegador dava certo por coincidência (a coordenadora está em
 * Fortaleza); no servidor da Vercel, que roda em **UTC**, das 21h às 23h59 o
 * "hoje" já era o dia seguinte. Quem sofria era a **Central do dia**, que calcula
 * a data no servidor: às 21h15 ela mostrava o dia de amanhã, vazio — justamente
 * no horário em que o turno da noite (a rota do Pré Sul tem blocos às 20:30 e
 * 21:00) fecharia o dia.
 *
 * Fixar o fuso também faz cliente e servidor concordarem sempre, em vez de
 * concordarem só enquanto o navegador estiver no Brasil.
 */
export function hojeISO(): string {
  // `formatToParts` em vez de `format`: não depende de o locale montar a string
  // na ordem ano-mês-dia.
  const partes = FORMATO_DIA.formatToParts(new Date());
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${pegar("year")}-${pegar("month")}-${pegar("day")}`;
}

/** Soma (ou subtrai) dias de uma data YYYY-MM-DD. */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-06-12" → "12/06/2026" */
export function formatarDataBR(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Nomes dos dias da semana indexados por getDay() (0=domingo … 6=sábado). */
export const DIAS_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/** Abreviações de 1 letra para seletores compactos (D S T Q Q S S). */
export const DIAS_SEMANA_CURTO = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

/** Dia da semana de uma data YYYY-MM-DD (0=domingo … 6=sábado). */
export function diaDaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}

/** "2,4" → [2, 4]. Vazio/ausente → []. Ignora valores fora de 0–6. */
export function parseDiasSemana(csv: string | undefined | null): number[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** [4, 2] → "2,4" (ordenado, sem duplicatas). */
export function serializarDiasSemana(dias: number[]): string {
  return [...new Set(dias)].filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b).join(",");
}

/** "2,4" → "ter, qui" (rótulo curto legível). */
export function rotularDiasSemana(csv: string | undefined | null): string {
  return parseDiasSemana(csv)
    .map((d) => DIAS_SEMANA[d].slice(0, 3))
    .join(", ");
}

/** Dois intervalos [aIni, aFim) e [bIni, bFim) em minutos se sobrepõem? */
export function intervalosSobrepoem(
  aIni: number,
  aFim: number,
  bIni: number,
  bFim: number,
): boolean {
  return aIni < bFim && bIni < aFim;
}
