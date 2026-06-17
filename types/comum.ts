/** Tipos compartilhados entre as entidades do sistema. */

export type Perfil = "administrador" | "supervisor" | "visualizador";

export type Turno = "manha" | "tarde" | "noite" | "integral";

/** Dias trabalhados na semana. seg_sab cobre escalas tipo 44h (sáb 4h). */
export type Escala = "seg_sex" | "seg_sab" | "todos";

export type TipoLocal =
  | "sala"
  | "banheiro"
  | "corredor"
  | "area_comum"
  | "area_externa"
  | "copa"
  | "escada"
  | "recepcao"
  | "auditorio"
  | "almoxarifado"
  | "outros";

export type RegraCalculo = "fixo" | "por_m2" | "por_unidade" | "manual";

/**
 * Natureza do esforço de uma tarefa de limpeza — multiplica o tempo previsto:
 *  - "rotina"        → limpeza de manutenção do dia a dia (fator 1,0);
 *  - "pesada"        → limpeza reforçada/profunda (fator 1,5);
 *  - "desincrustante"→ remoção de sujeira aderida/encardido (fator 2,0).
 * Ausente = "rotina". Os multiplicadores são calibráveis (constantes em
 * `lib/calculations.ts`).
 */
export type TipoServico = "rotina" | "pesada" | "desincrustante";

export type Frequencia =
  | "diaria"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "sob_demanda";

export type Prioridade = "alta" | "media" | "baixa";

/** Restrição de gênero de uma tarefa. "" = sem restrição. */
export type RestricaoGenero = "" | "feminino" | "masculino";

/**
 * Natureza de um registro avulso (fora da rotina planejada):
 *  - "eventual"   → trabalho não planejado que surgiu e foi executado;
 *  - "imprevisto" → ocorrência/imprevisto que consumiu tempo (não é ociosidade).
 */
export type TipoEventual = "eventual" | "imprevisto";

/**
 * Tipo de requisito de execução (conformidade):
 *  - "aptidao"     → aptidão física/médica (ex.: apto a esforço, altura/NR-35);
 *  - "treinamento" → capacitação que pode vencer (ex.: produtos químicos);
 *  - "epi"         → EPI exigido pela atividade (ex.: luvas nitrílicas).
 * aptidão e treinamento são possuídos pelo funcionário (bloqueiam alocação);
 * epi é exigido pela tarefa e exibido como lembrete (confirmação é fase futura).
 */
export type TipoRequisito = "aptidao" | "treinamento" | "epi";

export type StatusRotina =
  | "planejada"
  | "realizada"
  | "nao_realizada"
  | "remanejada"
  | "cancelada"
  | "pendente";

export type StatusRealizado =
  | "conforme_planejado"
  | "com_atraso"
  | "parcial"
  | "nao_realizada"
  | "remanejada"
  | "cancelada";

export type ClassificacaoOcupacao =
  | "subutilizado"
  | "adequado"
  | "alta_ocupacao"
  | "sobrecarga";

/** Campos de auditoria presentes na maioria das entidades. */
export interface Auditoria {
  criado_por: string;
  criado_em: string; // ISO 8601
  atualizado_por: string;
  atualizado_em: string; // ISO 8601
}

/** Resultado de uma validação de alocação na agenda. */
export interface AlertaValidacao {
  /** "erro" bloqueia a operação; "alerta" apenas avisa. */
  nivel: "erro" | "alerta";
  codigo: string;
  mensagem: string;
}
