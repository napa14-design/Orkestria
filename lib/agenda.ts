/**
 * Lógica de exibição da agenda (pura, sem React) — testável isolada.
 */
import type {
  Funcionario,
  Local,
  ParametrosResolvidos,
  QualificacaoFuncionario,
  Requisito,
  RotinaPlanejada,
  StatusRotina,
  Tarefa,
  TempoPersonalizado,
} from "@/types";
import { NIVEL_ORDEM } from "@/types";
import { tempoPlanejadoMin, tempoPrevistoMin, tempoVisualMin } from "./calculations";
import { hhmmParaMin, minParaHHMM } from "./dateUtils";
import { sugerirPorHabilitacao, temErro, validarAlocacao } from "./validations";

/**
 * Um "run" é um grupo de rotinas iguais e contíguas (mesma tarefa, fim de uma =
 * início da próxima), renderizado como UM card só. As rotinas-membro seguem
 * individuais por baixo (leitura OMR/realizado intactas).
 */
export type Run = {
  id: string;
  tarefa_id: string;
  local_id: string;
  status: StatusRotina;
  inicio: string;
  fim: string;
  membros: RotinaPlanejada[];
};

/** Agrupa as rotinas de um funcionário em runs (ver {@link Run}). */
export function agruparRuns(rotinas: RotinaPlanejada[]): Run[] {
  const ordenadas = [...rotinas].sort((a, b) =>
    a.inicio_planejado.localeCompare(b.inicio_planejado),
  );
  const runs: Run[] = [];
  for (const r of ordenadas) {
    const ult = runs[runs.length - 1];
    if (ult && ult.tarefa_id === r.tarefa_id && ult.fim === r.inicio_planejado) {
      ult.fim = r.fim_planejado;
      ult.membros.push(r);
    } else {
      runs.push({
        id: r.id,
        tarefa_id: r.tarefa_id,
        local_id: r.local_id,
        status: r.status,
        inicio: r.inicio_planejado,
        fim: r.fim_planejado,
        membros: [r],
      });
    }
  }
  return runs;
}

export interface SugestaoAlocacao {
  funcionario_id: string;
  inicio: string;
  tempo_previsto_min: number;
  ocupacao_atual_min: number;
}

/**
 * Sugere um encaixe válido para uma tarefa sem gravar nada.
 *
 * Critério: maior habilitação exigida → menor carga já planejada → primeiro
 * horário livre. A validação definitiva continua sendo `validarAlocacao`, a
 * mesma usada pelo cliente e pelo servidor. Retorna `null` quando nenhum
 * encaixe sem erro existe no conjunto de funcionários informado.
 */
export function sugerirAlocacao(args: {
  tarefa: Tarefa;
  local?: Local;
  funcionarios: Funcionario[];
  rotinas: RotinaPlanejada[];
  parametros: ParametrosResolvidos;
  blocoMin: number;
  data: string;
  temposPersonalizados?: TempoPersonalizado[];
  requisitos?: Requisito[];
  qualificacoes?: QualificacaoFuncionario[];
  ausentes?: { has(id: string): boolean };
}): SugestaoAlocacao | null {
  const requisitos = args.requisitos ?? [];
  const qualificacoes = args.qualificacoes ?? [];
  const nivelPorFuncionario = new Map(
    sugerirPorHabilitacao({
      tarefa: args.tarefa,
      funcionarios: args.funcionarios,
      qualificacoes,
      requisitosCatalogo: requisitos,
      data: args.data,
    }).map(({ funcionario, nivel }) => [funcionario.id, NIVEL_ORDEM[nivel]]),
  );

  const candidatos: Array<SugestaoAlocacao & { nivel: number; nome: string }> = [];
  for (const funcionario of args.funcionarios) {
    if (!funcionario.ativo || args.ausentes?.has(funcionario.id)) continue;
    const entrada = hhmmParaMin(funcionario.entrada);
    const saida = hhmmParaMin(funcionario.saida);
    if (!Number.isFinite(entrada) || !Number.isFinite(saida) || saida <= entrada) continue;

    const rotinasDoFuncionario = args.rotinas.filter(
      (r) => r.funcionario_id === funcionario.id,
    );
    const pessoal = args.temposPersonalizados?.find(
      (tp) =>
        tp.funcionario_id === funcionario.id && tp.tarefa_id === args.tarefa.id,
    );
    const calculado = pessoal?.tempo_min ?? tempoPrevistoMin(args.tarefa, args.local);
    // Presença/manual pergunta a duração ao aplicar; o valor-base só dimensiona
    // a sugestão inicial e nunca substitui a confirmação do supervisor.
    const previsto = Math.max(5, calculado || args.blocoMin * 2);
    const visual = tempoVisualMin(previsto, args.blocoMin);

    for (let inicioMin = entrada; inicioMin < saida; inicioMin += args.blocoMin) {
      const alertas = validarAlocacao({
        funcionario,
        rotinasExistentes: rotinasDoFuncionario,
        inicioMin,
        fimMin: inicioMin + visual,
        tarefa: args.tarefa,
        local: args.local,
        parametros: args.parametros,
        tempoPrevistoNovo: previsto,
        requisitosCatalogo: requisitos,
        qualificacoesFuncionario: qualificacoes.filter(
          (q) => q.funcionario_id === funcionario.id,
        ),
        data: args.data,
      });
      if (temErro(alertas)) continue;
      candidatos.push({
        funcionario_id: funcionario.id,
        inicio: minParaHHMM(inicioMin),
        tempo_previsto_min: previsto,
        ocupacao_atual_min: tempoPlanejadoMin(rotinasDoFuncionario),
        nivel: nivelPorFuncionario.get(funcionario.id) ?? 0,
        nome: funcionario.nome,
      });
      break;
    }
  }

  candidatos.sort(
    (a, b) =>
      b.nivel - a.nivel ||
      a.ocupacao_atual_min - b.ocupacao_atual_min ||
      a.inicio.localeCompare(b.inicio) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const melhor = candidatos[0];
  if (!melhor) return null;
  return {
    funcionario_id: melhor.funcionario_id,
    inicio: melhor.inicio,
    tempo_previsto_min: melhor.tempo_previsto_min,
    ocupacao_atual_min: melhor.ocupacao_atual_min,
  };
}
