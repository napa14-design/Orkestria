/**
 * Os intervalos do dia do funcionário — uma fonte só.
 *
 * O sistema guardava a mesma informação em **dois lugares**: `intervalos` (CSV
 * de pares `HH:mm-HH:mm`, que suporta lanche + almoço + lanche) e o trio
 * `intervalo_inicio` / `intervalo_fim` / `intervalo_min`. O cálculo lê o CSV
 * **quando ele existe** e só cai no trio quando está vazio — mas o formulário
 * de Funcionários editava **apenas o trio**.
 *
 * Consequência medida em 24/08/2026: **31 dos 38 funcionários ativos** tinham
 * os dois em desacordo. O caso que apareceu na tela: um coordenador abriu o
 * cadastro do Gleydison, trocou o intervalo de 1h30 para 2h, salvou — e a
 * carga semanal não se mexeu, porque o cálculo continuou lendo `12:00-13:30` do
 * CSV. A edição não deu erro nem efeito. Na DT era pior e ao contrário: o
 * formulário mostrava só o almoço (`11:30–13:00`) ao lado de um "120 min" que
 * vinha da soma dos três intervalos — dois controles da mesma tela
 * discordando entre si.
 *
 * Agora `intervalos` é a **única** coisa que se edita, e o trio passa a ser
 * **derivado** dele (`sincronizarTrio`), para quem lê os campos antigos
 * continuar vendo a verdade em vez de um resto.
 */
import { hhmmParaMin, minParaHHMM } from "./dateUtils";

export interface Intervalo {
  inicio: string;
  fim: string;
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/**
 * Pares **crus**: o que está escrito, na ordem em que está, sem validar e sem
 * ordenar. É o que o editor da tela precisa.
 *
 * `listarIntervalos` ordena e descarta o inválido — correto para calcular,
 * desastroso para digitar: o editor derivava as linhas dele a cada tecla, então
 * trocar um horário **reordenava as linhas** debaixo do dedo e limpar um campo
 * para redigitar fazia a **linha sumir** (vira `09:00-`, que não passa). Quem
 * reportou: *"eu errei 1 e mudou todos? não posso fazer em qualquer ordem?"*.
 *
 * Ordem importa no cálculo, nunca na digitação — quem ordena é quem soma.
 */
export function paresCrus(csv: string | undefined | null): Intervalo[] {
  if (!csv || !csv.trim()) return [];
  return csv
    .split(";")
    .map((par) => {
      const [inicio, fim] = par.split("-");
      return { inicio: (inicio ?? "").trim(), fim: (fim ?? "").trim() };
    })
    .filter((iv) => iv.inicio || iv.fim);
}

/** Serializa como está, sem ordenar: preserva o que a pessoa digitou. */
export function serializarPares(pares: Intervalo[]): string {
  return pares
    .filter((p) => p.inicio || p.fim)
    .map((p) => `${p.inicio}-${p.fim}`)
    .join(";");
}

/** Pares válidos do CSV, em ordem de início. Ignora o que não parseia. */
export function listarIntervalos(csv: string | undefined | null): Intervalo[] {
  if (!csv || !csv.trim()) return [];
  return csv
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((par) => {
      const [inicio, fim] = par.split("-");
      return { inicio: (inicio ?? "").trim(), fim: (fim ?? "").trim() };
    })
    .filter((iv) => HORA.test(iv.inicio) && HORA.test(iv.fim))
    .sort((a, b) => hhmmParaMin(a.inicio) - hhmmParaMin(b.inicio));
}

/** Minutos somados de todos os intervalos. */
export function totalIntervaloMin(csv: string | undefined | null): number {
  return listarIntervalos(csv).reduce(
    (s, iv) => s + Math.max(0, hhmmParaMin(iv.fim) - hhmmParaMin(iv.inicio)),
    0,
  );
}

export function formatarDuracaoCurta(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Frase que aparece embaixo do campo enquanto a pessoa digita. Mostrar a conta
 * vale mais que explicar a regra — foi o que resolveu a confusão do "quantas
 * unidades" na tela de Tarefas.
 */
export function resumoIntervalos(csv: string | undefined | null, jornadaBrutaMin?: number): string {
  const lista = listarIntervalos(csv);
  if (lista.length === 0) return "Sem intervalo: a jornada líquida é o expediente inteiro.";
  const total = totalIntervaloMin(csv);
  const quantos = lista.length === 1 ? "1 intervalo" : `${lista.length} intervalos`;
  const base = `${quantos} · ${formatarDuracaoCurta(total)} descontadas da jornada`;
  if (!jornadaBrutaMin || jornadaBrutaMin <= 0) return base;
  return `${base} · jornada líquida ${formatarDuracaoCurta(Math.max(0, jornadaBrutaMin - total))}`;
}

/**
 * Diz o que está errado, em português, ou `null` se está tudo certo.
 *
 * Devolve **uma** mensagem: quem preenche conserta um problema por vez, e uma
 * lista de quatro erros na mesma linha não é lida.
 */
export function problemaNosIntervalos(
  csv: string | undefined | null,
  expediente?: { entrada?: string; saida?: string },
): string | null {
  if (!csv || !csv.trim()) return null; // sem intervalo é válido

  const pedacos = csv.split(";").map((p) => p.trim()).filter(Boolean);
  for (const par of pedacos) {
    const partes = par.split("-");
    if (partes.length !== 2)
      return `"${par}" não está no formato HH:mm-HH:mm (ex.: 12:00-13:00).`;
    const [inicio, fim] = partes.map((x) => x.trim());
    if (!HORA.test(inicio) || !HORA.test(fim))
      return `"${par}" tem horário inválido — use HH:mm de 00:00 a 23:59.`;
    if (hhmmParaMin(fim) <= hhmmParaMin(inicio))
      return `Em "${par}", o fim precisa ser depois do início.`;
  }

  const lista = listarIntervalos(csv);
  for (let i = 1; i < lista.length; i++) {
    if (hhmmParaMin(lista[i].inicio) < hhmmParaMin(lista[i - 1].fim))
      return `Os intervalos ${lista[i - 1].inicio}-${lista[i - 1].fim} e ${lista[i].inicio}-${lista[i].fim} se sobrepõem.`;
  }

  const entrada = expediente?.entrada ? hhmmParaMin(expediente.entrada) : NaN;
  const saida = expediente?.saida ? hhmmParaMin(expediente.saida) : NaN;
  if (!Number.isNaN(entrada) && !Number.isNaN(saida) && saida > entrada) {
    for (const iv of lista) {
      if (hhmmParaMin(iv.inicio) < entrada || hhmmParaMin(iv.fim) > saida)
        return `O intervalo ${iv.inicio}-${iv.fim} está fora do expediente (${expediente?.entrada}–${expediente?.saida}).`;
    }
    if (totalIntervaloMin(csv) >= saida - entrada)
      return "Os intervalos consomem o expediente inteiro — não sobra jornada.";
  }
  return null;
}

/**
 * Deriva o trio legado a partir do CSV, para que ninguém que leia os campos
 * antigos veja um valor que o cálculo não usa. `intervalo_inicio`/`fim` ficam
 * com o **maior** intervalo (o almoço, na prática), e `intervalo_min` com o
 * total — que é o único dos três que entra em conta quando o CSV some.
 */
export function sincronizarTrio<T extends { intervalos?: string }>(
  registro: T,
): T & { intervalo_inicio?: string; intervalo_fim?: string; intervalo_min?: number } {
  const lista = listarIntervalos(registro.intervalos);
  if (lista.length === 0) return registro;
  const maior = lista.reduce((a, b) =>
    hhmmParaMin(b.fim) - hhmmParaMin(b.inicio) > hhmmParaMin(a.fim) - hhmmParaMin(a.inicio) ? b : a,
  );
  return {
    ...registro,
    intervalo_inicio: maior.inicio,
    intervalo_fim: maior.fim,
    intervalo_min: totalIntervaloMin(registro.intervalos),
  };
}

/**
 * Caminho de volta, para registro antigo que só tem o trio: monta o CSV a
 * partir do par. Sem isso, abrir e salvar um cadastro desses pelo formulário
 * novo apagaria o intervalo dele.
 */
export function csvDoTrio(registro: {
  intervalos?: string;
  intervalo_inicio?: string;
  intervalo_fim?: string;
}): string {
  if (registro.intervalos && registro.intervalos.trim()) return registro.intervalos.trim();
  const { intervalo_inicio: i, intervalo_fim: f } = registro;
  if (i && f && HORA.test(i) && HORA.test(f) && hhmmParaMin(f) > hhmmParaMin(i))
    return `${i}-${f}`;
  return "";
}

/** Só para exibição em lista: "09:00-09:15 · 11:30-13:00 · 15:00-15:15". */
export function rotularIntervalos(csv: string | undefined | null): string {
  const lista = listarIntervalos(csv);
  if (lista.length === 0) return "—";
  return lista.map((iv) => `${iv.inicio}-${iv.fim}`).join(" · ");
}

/** Reexportado por conveniência de quem monta CSV a partir de minutos. */
export { minParaHHMM };
