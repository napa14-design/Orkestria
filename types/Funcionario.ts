import type { Auditoria, Escala, Turno } from "./comum";

export interface Funcionario extends Auditoria {
  id: string;
  nome: string;
  genero: string;
  sede_id: string;
  turno: Turno;
  /** Formato HH:mm — horário padrão (segunda a sexta). */
  entrada: string;
  /** Formato HH:mm */
  saida: string;
  intervalo_min: number;
  /** Formato HH:mm — almoço principal (compatibilidade) */
  intervalo_inicio: string;
  /** Formato HH:mm */
  intervalo_fim: string;
  /**
   * Vários intervalos do dia (lanches + almoço), CSV de pares "HH:mm-HH:mm"
   * separados por ";" (ex.: "09:00-09:15;11:30-13:00;15:00-15:15"). Quando
   * presente, substitui o intervalo único nos cálculos e na agenda.
   */
  intervalos?: string;
  /** Dias da semana trabalhados. Ausente/"" = seg_sex. */
  escala?: Escala;
  /** Horário só de sábado (ex.: turno de 4h). Vazio = usa o padrão. HH:mm */
  entrada_sabado?: string;
  saida_sabado?: string;
  /**
   * Intervalos do sábado, no mesmo formato de `intervalos` (ex.: "09:00-09:15").
   * Só valem com o horário de sábado preenchido; vazio = sábado sem pausa.
   */
  intervalos_sabado?: string;
  cargo: string;
  /**
   * Nome completo, como no RH. O `nome` continua sendo como a equipe chama a
   * pessoa (é ele que aparece nas colunas da agenda). Obrigatório desde
   * 13/11/2026 em quem está no quadro (ver `validarFuncionario`).
   */
  nome_completo?: string;
  /**
   * Matrícula do RH — a chave com que outros sistemas (o Chromos) acham a pessoa.
   * O nome não serve: há homônimos ativos. Obrigatória desde 13/11/2026.
   */
  matricula?: string;
  /**
   * Empresa que registra a pessoa ("Apel - Matriz", "Ipade"…): cada empresa numera
   * a sua, então matrícula sozinha não é única. Desde 13/11/2026 o dono do dado é
   * o Orkestria (decisão do dono: daqui ela vai para o Chromos); obrigatória e
   * editável no cadastro.
   */
  empresa?: string;
  /** Data de admissão (AAAA-MM-DD). Obrigatória desde 13/11/2026. */
  data_admissao?: string;
  /**
   * Desligamento (AAAA-MM-DD): a partir deste dia a pessoa sai da geração e da
   * agenda. Pode ser futuro (aviso prévio). Ver `lib/desligamento.ts`.
   */
  desligado_em?: string;
  motivo_desligamento?: string;
  /** Código da vaga de substituição aberta no SGCP. Vazio = ainda não abriu. */
  vaga_sgcp?: string;
  /** Id de quem assumiu o posto ("Assume o posto de"). Preenchido = não é mais posto vago. */
  substituido_por?: string;
  /** No desligamento, o posto deixou de existir: a rota foi apagada e não há posto vago. */
  posto_extinto?: boolean;
  /**
   * Transferência (27/10/2026): na ficha que FICOU na sede de origem, a sede
   * para onde a pessoa foi. Só o "Transferir" grava. A ficha de origem é
   * encerrada como desligamento com motivo "Transferência" — mas a tela mostra
   * "Transferida para X", não "Desligado".
   */
  transferido_para?: string;
  /** Na ficha nova, na sede de destino: o id da ficha de origem. */
  transferido_de?: string;
  /**
   * Transferida para fora das sedes (ex.: cantina), em texto: o setor não é um
   * cadastro daqui. Mesmo encerramento da ficha, sem ficha nova. Só o "Transferir" grava.
   */
  transferido_setor?: string;
  ativo: boolean;
  observacoes: string;
}
