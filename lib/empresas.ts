/**
 * Empresa — a MESMA régua do Quadro da Infra (Chromos, `src/lib/quadro/empresas.ts`),
 * copiada de propósito: o dono decidiu (13/11/2026) que a empresa daqui vai para o
 * Chromos, e as duas pontas precisam escrever igual. Mudou lá, muda aqui. Três
 * diferenças, todas para fechar grafias que a revisão de segurança passou pela trava
 * de matrícula ou que a folha do RH traz: saem os invisíveis (`\p{Cf}`), todo traço
 * Unicode e o ponto viram separador, e sai o zero à esquerda do número ("IPADE 07"
 * → "IPADE 7", como está escrito no próprio Quadro). Limite conhecido: homóglifo
 * (o "А" cirílico) passa — só de propósito; não lê dado de ninguém (o nome segue
 * sendo a trava no cruzamento com o Quadro).
 *
 * Não existe catálogo fixo: a lista oferecida na tela sai do próprio cadastro.
 * Normaliza o que é inequívoco ("Apel - Matriz" → "APEL MATRIZ", "Apel Filial 7"
 * → "APEL 7") e recusa o que é decisão de RH ("APEL FILIAL" sem número).
 *
 * Puro: usado na validação, na trava de matrícula única, no cruzamento com o Quadro
 * e na tela.
 */

const AMBIGUAS: Record<string, string> = {
  "APEL FILIAL": "não diz qual filial",
};

export function normalizarEmpresa(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let texto = String(valor)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Caractere invisível (espaço de largura zero, marca de direção) não faz outra empresa.
    .replace(/\p{Cf}/gu, "")
    .toUpperCase()
    // Todo traço (\p{Pd}: o travessão que vem colado do Word ou do e-mail) e o ponto
    // contam como separador — "Apel – Matriz" e "APEL MATRIZ." eram outra empresa e
    // passavam a mesma matrícula pela importação (revisão de segurança, 13/11/2026).
    .replace(/[\p{Pd}_/.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  texto = texto.replace(/([A-Z])(\d)/g, "$1 $2"); // APEL7 → APEL 7
  texto = texto.replace(/^([A-Z]+) FILIAL (\d)/, "$1 $2"); // APEL FILIAL 9 → APEL 9
  // Zero à esquerda: a folha do RH escreve "IPADE - Filial 07" e "Ipade 02"; o Quadro, "IPADE 7".
  return texto.replace(/\b0+(\d)/g, "$1");
}

/** O motivo da ambiguidade, ou `null` quando a empresa está resolvida. */
export function empresaAmbigua(valor: unknown): string | null {
  const normalizada = normalizarEmpresa(valor);
  if (!normalizada) return "campo vazio";
  return AMBIGUAS[normalizada] ?? null;
}

/** As empresas já vistas no cadastro, sem as ambíguas — oferecê-las seria ensinar o erro. */
export function empresasConhecidas(registros: { empresa?: string }[]): string[] {
  const vistas = new Set<string>();
  for (const r of registros) {
    const normalizada = normalizarEmpresa(r.empresa);
    if (normalizada && !empresaAmbigua(normalizada)) vistas.add(normalizada);
  }
  return [...vistas].sort();
}
