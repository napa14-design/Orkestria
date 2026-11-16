/**
 * Evento do ciclo de vida de um ASG, lido pelo Chromos (Cromos) para aplicar no
 * Quadro da Infra — contrato "Orkestria → Cromos: contrato de eventos do Quadro
 * (v1)", com as emendas do `seguranca` (13/11/2026). Ver `lib/eventosQuadro.ts`.
 *
 * ⚠️ EXCEÇÃO à regra dos campos em snake_case: o registro é gravado já no formato do
 * contrato (camelCase), para o feed entregar o que está gravado sem tradução — e para
 * "mesmo id com conteúdo diferente" (emenda 6) comparar o que foi de fato gravado.
 *
 * Só de inclusão: atualizar ou excluir lança erro em qualquer banco (`lib/historico.ts`).
 */
export type TipoEventoQuadro = "admissao" | "desligamento" | "transferencia";

export interface EventoQuadro {
  /** `adm_<funcionarioId>`, `desl_<funcionarioId>` ou `transf_<idDaOrigem>`. */
  id: string;
  tipo: TipoEventoQuadro;
  /** AAAA-MM-DD: admissão, desligamento ou dia da transferência. */
  dataEfetiva: string;
  /** Instante da gravação (ISO, UTC). */
  registradoEm: string;
  matricula: string;
  /** Na grafia de `normalizarEmpresa`. */
  empresa: string;
  /** O nome COMPLETO (do RH), nunca o apelido da agenda. */
  nome: string;
  /** Só no tipo "admissao": a data de admissão (AAAA-MM-DD). */
  admissao?: string;
  /** O cargo gravado na ficha. */
  funcao: string;
  /** Última troca de matrícula, empresa ou nome completo (ISO), ou "" se nunca trocou. */
  identidadeAlteradaEm: string;
  /** Código da sede (`sedes.codigo`, cru). "" na admissão. */
  sedeDe: string;
  /** Código da sede de destino; "setor" na transferência para fora das sedes; "" no desligamento. */
  sedePara: string;
  /** Só no tipo "desligamento": um dos 6 motivos do Cromos, ou "" (os 5 do Orkestria). */
  motivo?: string;
  /** E-mail da sessão que fez a mudança. */
  autor: string;
  /** Na transferência, o id da ficha de ORIGEM (o id do evento sai dele). */
  funcionarioId: string;
}
