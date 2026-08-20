/**
 * Valida um dia inteiro de blocos com as MESMAS regras que a agenda manual usa.
 *
 * Por que existe: a invariante ("não pode sobrepor, não pode cair no intervalo,
 * não pode sem o requisito exigido") era aplicada em **1 das 4 portas** que criam
 * `rotinas_planejadas`. Só o arrasto na agenda passava por `validarAlocacao`; a
 * geração pela rota padrão, a importação de planilha e a cópia de dia gravavam
 * direto. Medido na base em 20/08: **38 sobreposições e 7 blocos dentro do
 * próprio intervalo** gravados desde junho, em silêncio.
 *
 * A premissa que justificava não validar — *"a rota é dado já validado"* — é
 * falsa quando a rota nasce de uma importação, que também não validava.
 *
 * **Não bloqueia.** Rota que não cabe na jornada é o dado que interessa (é o caso
 * da CESIU, com 27 blocos deliberadamente depois da saída). O que este módulo faz
 * é **contar e nomear** o que a agenda manual teria recusado, para aparecer no
 * resultado da geração/importação em vez de virar exceção às 7h da manhã.
 */
import { validarAlocacao } from "./validations";
import { hhmmParaMin } from "./dateUtils";
import type {
  Funcionario,
  Local,
  ParametrosResolvidos,
  QualificacaoFuncionario,
  Requisito,
  RotinaPlanejada,
  Tarefa,
} from "@/types";

/**
 * Erros que este módulo NÃO reporta, e o porquê de cada um.
 *
 * `FORA_DO_EXPEDIENTE`: a rota que estoura a jornada é justamente o dado que se
 * quer registrar. Já é sinalizado onde importa — hachura amaranto no card e
 * contagem no cabeçalho da coluna ("· 10 passam da saída"). Reportar aqui de novo
 * transformaria 27 blocos propositais da CESIU em 27 "erros" e afogaria os que
 * importam.
 */
export const NAO_REPORTADOS = new Set(["FORA_DO_EXPEDIENTE"]);

/** O mínimo que um bloco precisa ter para ser validado. */
export type BlocoDoDia = Pick<
  RotinaPlanejada,
  "funcionario_id" | "tarefa_id" | "inicio_planejado" | "fim_planejado" | "tempo_previsto_min"
> & { id?: string; local_id?: string; status?: RotinaPlanejada["status"] };

export interface ProblemaDoDia {
  funcionario_id: string;
  funcionario: string;
  /** Início do bloco problemático, para achar na agenda. */
  inicio: string;
  tarefa: string;
  codigo: string;
  mensagem: string;
}

/**
 * Devolve um problema por BLOCO, não por par. Uma sobreposição entre dois blocos
 * aparece nos dois — é de propósito: quem lê a lista quer achar cada bloco na
 * agenda, e esconder um dos lados esconderia metade do conserto.
 */
export function validarDia(args: {
  blocos: BlocoDoDia[];
  funcionarios: Map<string, Funcionario>;
  tarefas: Map<string, Tarefa>;
  locais?: Map<string, Local>;
  parametros: ParametrosResolvidos;
  data: string;
  requisitos?: Requisito[];
  qualificacoes?: QualificacaoFuncionario[];
}): ProblemaDoDia[] {
  const { blocos, funcionarios, tarefas, locais, parametros, data } = args;
  const problemas: ProblemaDoDia[] = [];

  // Agrupa por pessoa uma vez: validar bloco a bloco varrendo a lista inteira
  // seria O(n²) sobre o dia todo da sede (277 blocos em DT).
  const porFuncionario = new Map<string, BlocoDoDia[]>();
  for (const b of blocos) {
    if (b.status === "cancelada") continue;
    const lista = porFuncionario.get(b.funcionario_id);
    if (lista) lista.push(b);
    else porFuncionario.set(b.funcionario_id, [b]);
  }

  for (const [funcionarioId, doDia] of porFuncionario) {
    const funcionario = funcionarios.get(funcionarioId);
    if (!funcionario) continue; // pessoa de outra sede ou removida: não é caso daqui
    const quali = (args.qualificacoes ?? []).filter((q) => q.funcionario_id === funcionarioId);

    for (const bloco of doDia) {
      const inicioMin = hhmmParaMin(bloco.inicio_planejado);
      const fimMin = hhmmParaMin(bloco.fim_planejado);
      if (Number.isNaN(inicioMin) || Number.isNaN(fimMin)) continue;

      const tarefa = tarefas.get(bloco.tarefa_id);
      const alertas = validarAlocacao({
        funcionario,
        // Os OUTROS blocos da pessoa no dia — incluindo os que ainda vão ser
        // gravados, senão a geração não enxerga conflito entre dois novos.
        rotinasExistentes: doDia.filter((o) => o !== bloco) as RotinaPlanejada[],
        inicioMin,
        fimMin,
        tarefa,
        local: tarefa && locais ? locais.get(tarefa.local_id) : undefined,
        parametros,
        tempoPrevistoNovo: bloco.tempo_previsto_min,
        requisitosCatalogo: args.requisitos,
        qualificacoesFuncionario: quali,
        data,
      });

      for (const a of alertas) {
        // Só erro: `SOBRECARGA` e `LOCAL_SEM_METRAGEM` são alerta e apareceriam
        // em todo bloco de uma sede sobrecarregada — ruído que esconde o resto.
        if (a.nivel !== "erro" || NAO_REPORTADOS.has(a.codigo)) continue;
        problemas.push({
          funcionario_id: funcionarioId,
          funcionario: funcionario.nome,
          inicio: bloco.inicio_planejado,
          tarefa: tarefa?.nome_tarefa ?? "(tarefa removida)",
          codigo: a.codigo,
          mensagem: a.mensagem,
        });
      }
    }
  }
  return problemas;
}

/** Resumo curto para caber no `detalhes` do resultado, sem despejar 151 linhas. */
export function resumirProblemas(problemas: ProblemaDoDia[], limite = 5): string[] {
  if (problemas.length === 0) return [];
  const porCodigo = new Map<string, number>();
  for (const p of problemas) porCodigo.set(p.codigo, (porCodigo.get(p.codigo) ?? 0) + 1);
  const cabecalho = `${problemas.length} bloco(s) que a agenda manual teria recusado: ${[...porCodigo]
    .map(([c, n]) => `${n}× ${c}`)
    .join(", ")}.`;
  const linhas = problemas
    .slice(0, limite)
    .map((p) => `${p.funcionario} às ${p.inicio} (${p.tarefa}): ${p.mensagem}`);
  if (problemas.length > limite) linhas.push(`…e mais ${problemas.length - limite}.`);
  return [cabecalho, ...linhas];
}

