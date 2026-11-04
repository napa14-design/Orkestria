/**
 * Quem pode assumir um bloco de quem faltou. Uma régua só para a Central e para o
 * painel de Cobertura da Agenda: antes, o painel ordenava só por ociosidade e
 * oferecia em primeiro lugar quem a Central recusaria (consulta de 04/11/2026).
 */
import { funcionarioNoDia, jornadaLiquidaMin, tempoPlanejadoMin } from "./calculations";
import { hhmmParaMin } from "./dateUtils";
import { validarAlocacao } from "./validations";
import type {
  AlertaValidacao,
  Funcionario,
  Local,
  ParametrosResolvidos,
  QualificacaoFuncionario,
  Requisito,
  RotinaPlanejada,
  Tarefa,
} from "@/types";

export interface CandidatoAvaliado {
  funcionario: Funcionario;
  /** Vazio = pode assumir sem conflito, sobrecarga nem alerta cadastral. */
  alertas: AlertaValidacao[];
  /** Fração da jornada já planejada; quem está mais leve vem antes. */
  carga: number;
}

/** Sem alerta primeiro; em cada grupo, o mais leve e depois o nome. */
export function avaliarCandidatos(args: {
  rotina: RotinaPlanejada;
  funcionarios: Funcionario[];
  disponiveisIds: Set<string>;
  /** Só os blocos que ocupam horário (`ocupaHorario`). */
  rotinasDoDia: RotinaPlanejada[];
  tarefa: Tarefa;
  local: Local;
  parametros: ParametrosResolvidos;
  requisitosCatalogo: Requisito[];
  qualificacoes: QualificacaoFuncionario[];
}): CandidatoAvaliado[] {
  const { rotina, funcionarios, disponiveisIds, rotinasDoDia, tarefa, local, parametros, requisitosCatalogo, qualificacoes } = args;
  const inicioMin = hhmmParaMin(rotina.inicio_planejado);
  const fimMin = hhmmParaMin(rotina.fim_planejado);
  return funcionarios
    .filter((f) => f.sede_id === rotina.sede_id && f.id !== rotina.funcionario_id && disponiveisIds.has(f.id))
    .map((funcionario) => {
      const rotinasExistentes = rotinasDoDia.filter(
        (item) => item.funcionario_id === funcionario.id && item.id !== rotina.id,
      );
      const efetivo = funcionarioNoDia(funcionario, rotina.data);
      const alertas = validarAlocacao({
        funcionario: efetivo,
        rotinasExistentes,
        inicioMin,
        fimMin,
        tarefa,
        local,
        parametros,
        tempoPrevistoNovo: rotina.tempo_previsto_min,
        requisitosCatalogo,
        qualificacoesFuncionario: qualificacoes.filter((q) => q.funcionario_id === funcionario.id),
        data: rotina.data,
      });
      const jornada = jornadaLiquidaMin(efetivo);
      return {
        funcionario,
        alertas,
        carga: jornada > 0 ? tempoPlanejadoMin(rotinasExistentes) / jornada : Infinity,
      };
    })
    .sort(
      (a, b) =>
        Number(a.alertas.length > 0) - Number(b.alertas.length > 0) ||
        a.carga - b.carga ||
        a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR"),
    );
}
