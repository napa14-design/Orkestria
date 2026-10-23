/**
 * DESLIGAMENTO — o "Excluir" do funcionário virou "Desligar" (13/10/2026).
 *
 * Excluir nunca funcionou para quem importava: o cadastro com rota ou histórico
 * é recusado (`deleteFuncionario`), e o caminho que sobrava era desmarcar "Ativo"
 * — sem data, sem motivo e sem ninguém avisado. Desligar grava data e motivo,
 * tira a pessoa da geração a partir da data, guarda a rota como POSTO VAGO (para
 * o "Assume o posto de" de quem for contratado) e abre a vaga no SGCP.
 *
 * Funções puras: usadas pelo serviço, pela geração do dia e pela agenda.
 */
import type { Funcionario, Sede } from "@/types";

/**
 * A junção com a lista que o SGCP aceita (16/10/2026): o que estiver fora dela
 * chega lá como "desligamento" genérico. Justa causa vai como "Desligamento" de
 * propósito (ver `pedidoDeVaga`).
 */
export const MOTIVOS_DESLIGAMENTO = [
  "Pedido de demissão",
  "Demissão sem justa causa",
  "Demissão por justa causa",
  "Término de contrato",
  "Término de experiência",
  "Acordo",
  "Aposentadoria",
  "Transferência",
  "Abandono de emprego",
  "Outros",
] as const;

/**
 * Abandono não abre vaga daqui: depois de 15 dias de falta o Chromos avisa a
 * Coordenação, que pede a vaga por lá (o aviso é sozinho; a vaga, não —
 * conferido no código do Chromos em 23/10/2026). Abrir aqui também daria duas
 * vagas para o mesmo posto.
 */
export function motivoAbreVaga(motivo: string): boolean {
  return motivo !== "Abandono de emprego";
}

/**
 * A pessoa está no quadro NESTA data? Fora quem foi inativado, e fora quem foi
 * desligado a partir do dia do desligamento — antes dele (aviso prévio) ela
 * trabalha normalmente.
 */
export function noQuadro(
  f: Pick<Funcionario, "ativo" | "desligado_em">,
  data: string,
): boolean {
  if (f.ativo === false) return false;
  return !(f.desligado_em && data >= f.desligado_em);
}

/**
 * O `ativo` que as telas veem: falso quando a data do desligamento já chegou.
 * Fica num lugar só (a listagem do serviço) para os mais de dez filtros por
 * `ativo` espalhados nas telas acertarem sem cada um conhecer o desligamento.
 */
export function comAtivoDoDia<F extends Pick<Funcionario, "ativo" | "desligado_em">>(f: F, hoje: string): F {
  return f.desligado_em && f.desligado_em <= hoje && f.ativo !== false ? { ...f, ativo: false } : f;
}

export function validarDesligamento(d: { data?: unknown; motivo?: unknown }): string | null {
  if (typeof d.data !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(d.data)) return "Informe a data do desligamento.";
  if (typeof d.motivo !== "string" || !(MOTIVOS_DESLIGAMENTO as readonly string[]).includes(d.motivo))
    return "Escolha o motivo do desligamento.";
  return null;
}

/**
 * Sigla com que o SGCP conhece cada sede. O SGCP aceita nome ou sigla, e quase
 * todas as siglas do Orkestria já são as dele (SUL 1, DT, BN, PQL 1…). Exceções:
 *  - a DT 2 é divisão daqui: lá é tudo "DIONISIO TORRES";
 *  - a CESIU aqui tem código "CES", que lá não casa com nada — no SGCP ela é
 *    "CESIU" (nome e sigla). Confirmado pelo time do SGCP em 16/10/2026;
 *  - a Benfica daqui é a da UNIVERSIDADE (no quadro de pessoal as quatro estão
 *    como UNIBEN). "BN" no SGCP é a BENFICA do Colégio — a vaga cairia para o RH
 *    errado. Lá a da Universidade é UNIBENFICA [UBN].
 * Conferido contra o cadastro de sedes do SGCP em 16/10/2026: as 19 casam.
 */
const SIGLA_NO_SGCP: Record<string, string> = { DT2: "DT", CES: "CESIU", BN: "UBN" };

export function siglaNoSgcp(sede: Pick<Sede, "codigo" | "nome_sede">): string {
  const codigo = (sede.codigo ?? "").trim();
  return SIGLA_NO_SGCP[codigo.toUpperCase()] ?? (codigo || sede.nome_sede);
}

export interface ItemDaRota {
  inicio: string;
  duracao: number;
  tarefa: string;
}

/** O corpo de `POST /api/vagas-externas` do SGCP (versão 1). */
export function pedidoDeVaga(args: {
  funcionario: Pick<Funcionario, "id" | "nome" | "cargo" | "matricula" | "motivo_desligamento" | "desligado_em">;
  sede: Pick<Sede, "codigo" | "nome_sede">;
  rota: ItemDaRota[];
  solicitante: { nome: string; email?: string };
}) {
  const { funcionario: f, sede, rota, solicitante } = args;
  const [a, m, d] = (f.desligado_em ?? "").split("-");
  const atividades = [...rota]
    .sort((x, y) => x.inicio.localeCompare(y.inicio))
    .map((i) => `${i.inicio} (${i.duracao} min) ${i.tarefa}`)
    .join("; ");
  const descricao = [
    f.desligado_em ? `Desligamento em ${d}/${m}/${a}.` : "",
    atividades ? `Rota do posto: ${atividades}` : "Sem rota padrão cadastrada no Orkestria.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 4000);
  return {
    versao: 1,
    origem: { sistema: "Orkestria", caso: f.id },
    cargo: (f.cargo ?? "").trim() || "ASG",
    setor: "Infraestrutura",
    sede: siglaNoSgcp(sede),
    // Justa causa não vai para o SGCP: a observação da vaga e o log imutável de lá
    // são lidos por muita gente, e o motivo disciplinar não é necessário para
    // contratar a reposição (revisão de segurança, 14/10/2026).
    motivo: f.motivo_desligamento === "Demissão por justa causa" ? "Desligamento" : (f.motivo_desligamento ?? ""),
    substituido: { nome: f.nome, ...(f.matricula ? { matricula: f.matricula } : {}) },
    solicitante: { nome: solicitante.nome, ...(solicitante.email ? { email: solicitante.email } : {}) },
    descricao,
  };
}
