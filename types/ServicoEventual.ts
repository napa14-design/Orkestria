import type { Auditoria, TipoEventual } from "./comum";

/**
 * Serviço eventual / eventualidade — o "segundo eixo" do Orkestria: trabalho
 * NÃO planejado, registrado a posteriori (não parte de uma rotina). Distingue-se
 * pelo `tipo`: trabalho avulso ("eventual") ou imprevisto que consumiu tempo
 * ("imprevisto"). Alimenta a calibração da folga (buffer) por sede.
 */
export interface ServicoEventual extends Auditoria {
  id: string;
  /** Sede onde ocorreu (obrigatório). */
  sede_id: string;
  /** Quem executou — opcional ("" quando não atribuído a uma pessoa). */
  funcionario_id: string;
  /** Local, quando aplicável — opcional (""). */
  local_id: string;
  /** Categoria de atividade, quando aplicável — opcional. */
  categoria_id?: string;
  /** Data da ocorrência (YYYY-MM-DD). */
  data: string;
  tipo: TipoEventual;
  /** O que foi feito / o que ocorreu. */
  descricao: string;
  /** Início/fim (HH:mm) — opcionais; o que vale para o cálculo é `tempo_min`. */
  inicio: string;
  fim: string;
  /** Duração real em minutos (tempo consumido). */
  tempo_min: number;
  observacao: string;
  /** Quem registrou (supervisor/admin). */
  supervisor_id: string;
}
