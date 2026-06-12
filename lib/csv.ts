/**
 * Exportação CSV compatível com Excel pt-BR: separador ";", BOM UTF-8
 * (acentos corretos) e CRLF.
 */
const BOM = String.fromCharCode(0xfeff); // faz o Excel reconhecer UTF-8

export function baixarCSV(
  nomeArquivo: string,
  cabecalho: string[],
  linhas: Array<Array<string | number>>,
): void {
  const escapar = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const conteudo =
    BOM + [cabecalho, ...linhas].map((linha) => linha.map(escapar).join(";")).join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
