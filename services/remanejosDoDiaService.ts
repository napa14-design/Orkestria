/**
 * "Remanejos do dia" (24/11/2026): junta o que a regra pura precisa e devolve já com nomes, só o
 * mínimo — quem está fora (sem o tipo nem a observação da ausência), as tarefas e para quem foram.
 */
import { remanejosDoDia, type ComoPassou, type PessoaFora, type SituacaoDaTarefa } from "@/lib/remanejosDoDia";
import { getAusencias } from "./ausenciasService";
import { getFuncionarios } from "./funcionariosService";
import { getRotaPadrao } from "./modelosService";
import { getRotinasByData } from "./rotinasService";
import { getServicosEventuais } from "./servicosEventuaisService";
import { getTarefas } from "./tarefasService";

export interface RemanejoDaPessoa {
  funcionario_id: string;
  nome: string;
  motivo: PessoaFora["motivo"];
  janela: string;
  tarefas: { rotina_id: string; inicio: string; fim: string; tarefa: string; situacao: SituacaoDaTarefa; para?: string; como?: ComoPassou }[];
}

export async function getRemanejosDoDia(sedeId: string, data: string): Promise<RemanejoDaPessoa[]> {
  const [rotinas, itens, ausencias, eventuais, funcionarios, tarefas] = await Promise.all([
    getRotinasByData(data, sedeId),
    getRotaPadrao(sedeId),
    getAusencias({ data, sedeId }),
    getServicosEventuais(data, data, sedeId),
    getFuncionarios(sedeId),
    getTarefas(sedeId),
  ]);
  const nome = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const tarefa = new Map(tarefas.map((t) => [t.id, t.nome_tarefa]));
  const nomeDe = (id: string) => nome.get(id) ?? "Pessoa de outra sede";
  // Ausência ou empréstimo de quem já saiu (desligado, transferido, inativo) é resíduo.
  const noQuadro = new Set(
    funcionarios.filter((f) => (f.desligado_em ? f.desligado_em > data : f.ativo !== false)).map((f) => f.id),
  );
  const ausentes = new Set(ausencias.map((a) => a.funcionario_id).filter((id) => noQuadro.has(id)));
  const emprestimos = eventuais.filter((e) => noQuadro.has(e.funcionario_id));
  return remanejosDoDia({ rotinas, itensDaRota: itens, ausentes, eventuais: emprestimos })
    .map((g) => ({
      funcionario_id: g.funcionario_id,
      nome: nomeDe(g.funcionario_id),
      motivo: g.motivo,
      janela: g.janela,
      tarefas: g.tarefas.map((t) => ({
        rotina_id: t.rotina_id,
        inicio: t.inicio,
        fim: t.fim,
        tarefa: tarefa.get(t.tarefa_id) ?? "Tarefa",
        situacao: t.situacao,
        ...(t.para ? { para: nomeDe(t.para), como: t.como } : {}),
      })),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
