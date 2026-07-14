/**
 * Importação de rota por planilha — FONTE ÚNICA das colunas do modelo e da
 * derivação. O modelo é a própria rota: **uma linha por tarefa do dia**. Dela
 * derivamos funcionários (jornada/intervalos), locais, tarefas (com o tempo) e
 * as rotinas — do mesmo jeito que as planilhas reais do Christus são escritas.
 *
 * Puro (sem I/O): usado pelo gerador do modelo, pela análise e pelos testes.
 */

export interface ColunaModelo {
  chave: string;
  rotulo: string;
  obrigatorio: boolean;
  exemplo: string;
  ajuda: string;
  largura: number;
}

export const COLUNAS: ColunaModelo[] = [
  { chave: "funcionario", rotulo: "Funcionário", obrigatorio: true, exemplo: "Aurilene", ajuda: "Nome da pessoa. Repita o nome em todas as tarefas dela.", largura: 22 },
  { chave: "entrada", rotulo: "Entrada", obrigatorio: true, exemplo: "06:00", ajuda: "Início da jornada (HH:mm).", largura: 10 },
  { chave: "saida", rotulo: "Saída", obrigatorio: true, exemplo: "16:00", ajuda: "Fim da jornada (HH:mm).", largura: 10 },
  { chave: "intervalos", rotulo: "Intervalos", obrigatorio: false, exemplo: "09:00-09:15;11:30-13:00;15:00-15:15", ajuda: "Pausas do dia (lanche/almoço), separadas por ponto e vírgula.", largura: 34 },
  { chave: "escala", rotulo: "Escala", obrigatorio: false, exemplo: "seg_sex", ajuda: "seg_sex ou seg_sab. Vazio = seg_sex.", largura: 10 },
  { chave: "genero", rotulo: "Gênero", obrigatorio: false, exemplo: "feminino", ajuda: "feminino ou masculino — só usado em tarefas com restrição de gênero.", largura: 12 },
  { chave: "inicio", rotulo: "Início da tarefa", obrigatorio: true, exemplo: "06:05", ajuda: "Hora em que a tarefa começa (HH:mm).", largura: 15 },
  { chave: "fim", rotulo: "Fim da tarefa", obrigatorio: true, exemplo: "07:00", ajuda: "Hora em que termina. A DURAÇÃO sai daqui (fim − início).", largura: 15 },
  { chave: "tarefa", rotulo: "Tarefa", obrigatorio: true, exemplo: "Varrer a frente da escola", ajuda: "Nome da tarefa.", largura: 40 },
  { chave: "local", rotulo: "Local", obrigatorio: true, exemplo: "Portaria", ajuda: "Onde a tarefa é feita.", largura: 22 },
  { chave: "andar", rotulo: "Andar", obrigatorio: false, exemplo: "Térreo", ajuda: "Andar/setor do local.", largura: 12 },
  { chave: "metragem", rotulo: "Metragem (m²)", obrigatorio: false, exemplo: "120", ajuda: "Área do local. Só é preciso para tarefas calculadas por m².", largura: 13 },
  { chave: "categoria", rotulo: "Categoria", obrigatorio: false, exemplo: "Limpeza concorrente", ajuda: "Deve existir no catálogo de Categorias (senão a linha entra sem categoria).", largura: 22 },
  { chave: "tipo_servico", rotulo: "Tipo de serviço", obrigatorio: false, exemplo: "rotina", ajuda: "rotina, pesada ou desincrustante. Vazio = rotina.", largura: 15 },
  { chave: "frequencia", rotulo: "Frequência", obrigatorio: false, exemplo: "diaria", ajuda: "diaria, semanal, quinzenal ou mensal. Vazio = diaria.", largura: 12 },
  { chave: "dias_semana", rotulo: "Dias da semana", obrigatorio: false, exemplo: "1,3,5", ajuda: "Só para frequência semanal: 0=dom, 1=seg … 6=sáb.", largura: 14 },
  { chave: "epis", rotulo: "EPIs", obrigatorio: false, exemplo: "Luvas nitrílicas;Máscara descartável (PFF2)", ajuda: "Nomes do catálogo de Requisitos (tipo EPI), separados por ponto e vírgula.", largura: 38 },
];

export type LinhaPlanilha = Record<string, string>;

export interface FuncionarioImp {
  nome: string;
  entrada: string;
  saida: string;
  intervalos: string;
  escala: string;
  genero: string;
}
export interface LocalImp {
  nome_local: string;
  andar: string;
  metragem: number;
}
export interface TarefaImp {
  nome_tarefa: string;
  local: string;
  tempo_base_min: number;
  categoria: string;
  tipo_servico: string;
  frequencia: string;
  dias_semana: string;
  epis: string[];
}
export interface RotinaImp {
  funcionario: string;
  tarefa: string;
  local: string;
  inicio: string;
  fim: string;
  minutos: number;
}
export interface Problema {
  linha: number; // 1-based (linha da planilha, já sem o cabeçalho)
  campo?: string;
  mensagem: string;
}
export interface Analise {
  funcionarios: FuncionarioImp[];
  locais: LocalImp[];
  tarefas: TarefaImp[];
  rotinas: RotinaImp[];
  erros: Problema[]; // bloqueiam a importação
  avisos: Problema[]; // não bloqueiam
}

const RE_HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const min = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const norm = (s: string) => (s ?? "").trim();
const chaveNome = (s: string) => norm(s).toLowerCase();

/** Lê as linhas da planilha e deriva tudo, acusando erros por linha. */
export function analisarRota(linhas: LinhaPlanilha[]): Analise {
  const erros: Problema[] = [];
  const avisos: Problema[] = [];
  const funcs = new Map<string, FuncionarioImp>();
  const locais = new Map<string, LocalImp>();
  const tarefas = new Map<string, TarefaImp>();
  const rotinas: RotinaImp[] = [];
  // para detectar sobreposição por pessoa
  const ocupacao = new Map<string, Array<{ ini: number; fim: number; linha: number }>>();

  linhas.forEach((raw, idx) => {
    const n = idx + 1;
    const l: LinhaPlanilha = {};
    for (const c of COLUNAS) l[c.chave] = norm(raw[c.chave] ?? "");

    // ignora linha totalmente vazia (comum no fim da planilha)
    if (COLUNAS.every((c) => !l[c.chave])) return;

    // ignora a LINHA DE EXEMPLO do modelo (se o supervisor esquecer de apagar,
    // ela não vira dado real — só um aviso).
    const ehExemplo = COLUNAS.filter((c) => c.obrigatorio).every((c) => l[c.chave] === c.exemplo);
    if (ehExemplo) {
      avisos.push({ linha: n, mensagem: "Linha de exemplo do modelo — ignorada (não foi importada)." });
      return;
    }

    let linhaOk = true;
    for (const c of COLUNAS) {
      if (c.obrigatorio && !l[c.chave]) {
        erros.push({ linha: n, campo: c.rotulo, mensagem: `"${c.rotulo}" é obrigatório.` });
        linhaOk = false;
      }
    }
    for (const campo of ["entrada", "saida", "inicio", "fim"] as const) {
      if (l[campo] && !RE_HORA.test(l[campo])) {
        erros.push({ linha: n, campo, mensagem: `"${l[campo]}" não é uma hora válida (use HH:mm, ex.: 07:05).` });
        linhaOk = false;
      }
    }
    if (!linhaOk) return;

    const ini = min(l.inicio);
    const fim = min(l.fim);
    const ent = min(l.entrada);
    const sai = min(l.saida);
    if (fim <= ini) {
      erros.push({ linha: n, campo: "fim", mensagem: `O fim (${l.fim}) precisa ser depois do início (${l.inicio}).` });
      return;
    }
    if (sai <= ent) {
      erros.push({ linha: n, campo: "saida", mensagem: `A saída (${l.saida}) precisa ser depois da entrada (${l.entrada}).` });
      return;
    }
    if (ini < ent || ini >= sai) {
      avisos.push({ linha: n, campo: "inicio", mensagem: `${l.funcionario}: a tarefa começa ${l.inicio}, fora do expediente (${l.entrada}–${l.saida}).` });
    }

    // funcionário (a 1ª linha da pessoa define a jornada)
    const kf = chaveNome(l.funcionario);
    const jaF = funcs.get(kf);
    if (!jaF) {
      funcs.set(kf, {
        nome: l.funcionario,
        entrada: l.entrada,
        saida: l.saida,
        intervalos: l.intervalos,
        escala: l.escala || "seg_sex",
        genero: l.genero,
      });
    } else if (jaF.entrada !== l.entrada || jaF.saida !== l.saida) {
      avisos.push({ linha: n, campo: "entrada", mensagem: `${l.funcionario} aparece com jornadas diferentes (${jaF.entrada}–${jaF.saida} e ${l.entrada}–${l.saida}). Usei a primeira.` });
    }

    // local
    const kl = chaveNome(l.local);
    if (!locais.has(kl)) {
      locais.set(kl, { nome_local: l.local, andar: l.andar, metragem: Number(l.metragem) || 0 });
    }

    // tarefa (única por nome + local); a duração vem da 1ª ocorrência
    const kt = `${chaveNome(l.tarefa)}@${kl}`;
    const dur = fim - ini;
    const jaT = tarefas.get(kt);
    if (!jaT) {
      tarefas.set(kt, {
        nome_tarefa: l.tarefa,
        local: l.local,
        tempo_base_min: dur,
        categoria: l.categoria,
        tipo_servico: l.tipo_servico || "rotina",
        frequencia: l.frequencia || "diaria",
        dias_semana: l.dias_semana,
        epis: l.epis.split(";").map(norm).filter(Boolean),
      });
    } else if (jaT.tempo_base_min !== dur) {
      avisos.push({ linha: n, campo: "fim", mensagem: `"${l.tarefa}" aparece com durações diferentes (${jaT.tempo_base_min}min e ${dur}min). O tempo padrão da tarefa ficou ${jaT.tempo_base_min}min.` });
    }

    // sobreposição na agenda da pessoa
    const janelas = ocupacao.get(kf) ?? [];
    const choque = janelas.find((j) => ini < j.fim && j.ini < fim);
    if (choque) {
      // +1 porque a mensagem cita a linha COMO ELA APARECE no Excel (com o cabeçalho)
      erros.push({ linha: n, mensagem: `${l.funcionario} já tem tarefa nesse horário (linha ${choque.linha + 1}). Duas tarefas não podem se sobrepor.` });
      return;
    }
    janelas.push({ ini, fim, linha: n });
    ocupacao.set(kf, janelas);

    rotinas.push({ funcionario: l.funcionario, tarefa: l.tarefa, local: l.local, inicio: l.inicio, fim: l.fim, minutos: dur });
  });

  if (!rotinas.length && !erros.length) {
    erros.push({
      linha: 0,
      mensagem: avisos.length
        ? "A planilha só tem a linha de exemplo do modelo. Apague-a e preencha a rota (uma linha por tarefa)."
        : "A planilha não tem nenhuma linha preenchida.",
    });
  }

  return {
    funcionarios: [...funcs.values()],
    locais: [...locais.values()],
    tarefas: [...tarefas.values()],
    rotinas,
    erros,
    avisos,
  };
}
