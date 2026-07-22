export interface EntradaDiarioProduto {
  id: string;
  data: string | null;
  titulo: string;
  conteudo: string;
  formato: "estruturado" | "bruto";
}

function criarId(valor: string, indice: number): string {
  const base = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return `${base || "entrada"}-${indice + 1}`;
}

/**
 * Converte o DIARIO em uma linha do tempo sem exigir que entradas antigas
 * tenham exatamente o mesmo formato. Um bloco desconhecido continua visível
 * como texto bruto: documentação imperfeita nunca derruba nem apaga a página.
 */
export function parsearDiarioProduto(fonte: string): EntradaDiarioProduto[] {
  const normalizada = fonte.replace(/\r\n?/g, "\n").trim();
  if (!normalizada) return [];

  const blocos = normalizada.split(/^##\s+/m).slice(1);
  if (blocos.length === 0) {
    return [{
      id: "diario-bruto-1",
      data: null,
      titulo: "Registro do projeto",
      conteudo: normalizada,
      formato: "bruto",
    }];
  }

  return blocos.map((bloco, indice) => {
    const [cabecalho = "", ...linhas] = bloco.trim().split("\n");
    const correspondencia = cabecalho.match(
      /^(\d{4}-\d{2}-\d{2})\s+(?:—|-)\s+(.+?)\s*$/u,
    );

    if (!correspondencia) {
      return {
        id: criarId(cabecalho, indice),
        data: null,
        titulo: cabecalho.trim() || `Entrada ${indice + 1}`,
        conteudo: bloco.trim(),
        formato: "bruto" as const,
      };
    }

    const [, data, titulo] = correspondencia;
    return {
      id: criarId(`${data}-${titulo}`, indice),
      data,
      titulo: titulo.trim(),
      conteudo: linhas.join("\n").trim(),
      formato: "estruturado" as const,
    };
  });
}
