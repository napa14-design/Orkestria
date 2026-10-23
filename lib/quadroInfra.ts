/**
 * Cruzamento com o Quadro de Funcionários da Infra (Chromos, 23/10/2026).
 *
 * O Chromos é a fonte de quem entra, sai e muda de sede; aqui só se APONTA a
 * diferença — nada desliga nem cadastra sozinho. Funções puras: a leitura da
 * rede e o escopo da sessão moram em `services/quadroInfraService.ts`.
 *
 * ⚠️ O VÍNCULO SÓ VALE COM O NOME CONFERINDO. A matrícula é digitável no
 * cadastro; se bastasse ela, o coordenador de uma sede escreveria a matrícula
 * de alguém da Universidade e leria a sede e o desligamento dessa pessoa
 * (revisão de segurança, 23/10/2026). Sem o nome, a resposta é só "não confere".
 */

/** As duas únicas mensagens de falha que chegam à tela (a tela esconde a primeira). */
export const QUADRO_NAO_CONFIGURADO = "A integração com o Quadro da Infra não está configurada.";
export const QUADRO_FORA_DO_AR = "O Quadro da Infra não respondeu agora. Tente de novo em instantes.";

/** O que o Chromos manda de cada pessoa (`GET /api/quadro-externo`). */
export interface PessoaQuadro {
  id: string;
  matricula: string;
  empresa: string;
  nome: string;
  /** Sede canônica do Chromos ("SUL1", "DT1", "BEN"…). */
  sede: string;
  admissao: string;
  /** AAAA-MM-DD ou "". */
  desligamento: string;
  situacao: "ATIVO" | "INATIVO";
}

const CAMPOS_PESSOA = ["id", "matricula", "empresa", "nome", "sede", "admissao", "desligamento"] as const;
/** Mais que isso não é o Quadro ASG (~400 pessoas na rede toda): é resposta torta. */
export const TETO_PESSOAS = 5000;
const TETO_CAMPO = 200;

/**
 * Lê a resposta do Chromos campo a campo — o que não está na lista não entra,
 * mesmo que o outro lado mande a mais. Item torto é descartado; resposta torta
 * estoura (vira "Quadro indisponível", nunca "sem divergências").
 */
export function lerPessoas(corpo: unknown): PessoaQuadro[] {
  const lista = (corpo as { pessoas?: unknown } | null)?.pessoas;
  if (!Array.isArray(lista) || lista.length > TETO_PESSOAS) throw new Error("resposta do Quadro fora do formato");
  const saida: PessoaQuadro[] = [];
  for (const bruto of lista) {
    if (!bruto || typeof bruto !== "object") continue;
    const b = bruto as Record<string, unknown>;
    if (CAMPOS_PESSOA.some((c) => typeof b[c] !== "string" || (b[c] as string).length > TETO_CAMPO)) continue;
    if (b.situacao !== "ATIVO" && b.situacao !== "INATIVO") continue;
    if (!b.id || !b.nome || !b.sede) continue;
    saida.push({
      id: b.id as string,
      matricula: normalizarMatricula(b.matricula as string),
      empresa: (b.empresa as string).trim(),
      nome: (b.nome as string).trim(),
      sede: (b.sede as string).trim(),
      admissao: b.admissao as string,
      desligamento: b.desligamento as string,
      situacao: b.situacao,
    });
  }
  return saida;
}

/** "9508.0" e " 9508 " são a matrícula 9508 (a planilha de origem grava número). */
export function normalizarMatricula(m: string | undefined): string {
  return (m ?? "").trim().replace(/\.0+$/u, "");
}

/** Maiúsculas, sem acento, espaços colapsados. */
export function normalizarNome(nome: string): string {
  return nome.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/gu, " ").trim();
}

const LIGACOES = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const partes = (nome: string) => normalizarNome(nome).replace(/[.-]/gu, " ").split(" ").filter((p) => p && !LIGACOES.has(p));

/**
 * É a mesma pessoa pelo nome? O cadastro daqui costuma ser mais curto que o do
 * RH ("Maria Souza" × "MARIA APARECIDA DE SOUZA"), então: mesmo primeiro nome,
 * e todo nome seguinte do mais curto aparece entre os nomes SEGUINTES do mais
 * longo — inicial ("A.") vale para qualquer um com aquela letra.
 *
 * ⚠️ OS SEGUINTES CONTRA OS SEGUINTES, e pelo menos um deles por extenso. Contra
 * o nome inteiro, "Maria M" conferia com qualquer MARIA (a inicial casava com o
 * próprio primeiro nome), e a trava do vínculo virava só o primeiro nome
 * (revisão de segurança, 23/10/2026).
 *
 * ⚠️ E TEM DIREÇÃO: é o nome DAQUI que precisa caber no de LÁ, nunca o
 * contrário, e o daqui não pode ter mais nomes. Escolhendo o "curto" pela
 * contagem, um cadastro "Joana" + trinta sobrenomes comuns conferia com quase
 * toda JOANA da rede — o nome daqui é digitável (segunda revisão, mesmo dia). Se
 * o RH tiver o nome mais curto que o cadastro, dá "não confere" e o cadastro se
 * corrige; esse falso negativo é o preço aceito.
 */
export function nomeConfere(daqui: string, deLa: string): boolean {
  const pa = partes(daqui);
  const pb = partes(deLa);
  if (pa.length < 2 || pa.length > pb.length || pa[0] !== pb[0]) return false;
  const resto = pa.slice(1);
  const restoLa = pb.slice(1);
  if (!resto.some((p) => p.length >= 2)) return false;
  return resto.every((p) => (p.length === 1 ? restoLa.some((l) => l.startsWith(p)) : restoLa.includes(p)));
}

/**
 * Dentro da MESMA sede, o primeiro nome basta quando o cadastro daqui só tem
 * ele — o caso de 110 dos 148 ativos em 23/10/2026 ("Aurilene"). Seguro porque
 * tudo o que a resposta mostra já é da sede de quem pergunta. Para ATRAVESSAR
 * sede, vale só `nomeConfere`: "Joana" com a matrícula de alguém de outra sede
 * continua dando "não confere".
 */
export function nomeConfereNaSede(daqui: string, deLa: string): boolean {
  const pa = partes(daqui);
  if (pa.length === 1) return pa[0] === partes(deLa)[0];
  return nomeConfere(daqui, deLa);
}

/** Onde o código daqui não é o de lá (decisão do dono, 23/10/2026). */
const SEDE_NO_CHROMOS: Record<string, string> = { DT: "DT1", BN: "BEN", CES: "CESIU" };

const compactar = (codigo: string) => codigo.toUpperCase().replace(/\s+/gu, "");

/**
 * Sede daqui → sede canônica do Chromos. Sem código, sem sede. Duas sedes daqui
 * que caem no mesmo código ficam AS DUAS sem Quadro: uma não pode receber o
 * pessoal da outra por causa de uma grafia.
 */
export function mapaDeSedes(sedes: { id: string; codigo?: string }[]): Map<string, string> {
  const destino = new Map<string, string>();
  const contagem = new Map<string, number>();
  for (const s of sedes) {
    const c = compactar(s.codigo ?? "");
    if (!c) continue;
    const alvo = SEDE_NO_CHROMOS[c] ?? c;
    destino.set(s.id, alvo);
    contagem.set(alvo, (contagem.get(alvo) ?? 0) + 1);
  }
  for (const [id, alvo] of destino) if ((contagem.get(alvo) ?? 0) > 1) destino.delete(id);
  return destino;
}

export interface FuncionarioCruzado {
  id: string;
  nome: string;
  sede_id: string;
  matricula?: string;
  empresa?: string;
  ativo: boolean;
  desligado_em?: string;
}

export interface Sugestao {
  quadro_id: string;
  nome: string;
  admissao: string;
  situacao: PessoaQuadro["situacao"];
}

export interface Divergencias {
  /** Sem matrícula aqui; sugestões só do Quadro da MESMA sede, com o nome conferindo. */
  semVinculo: { funcionario_id: string; nome: string; sugestoes: Sugestao[] }[];
  /** Desligado lá, ativo aqui. A data vai para o "Desligar" já preenchida. */
  desligados: { funcionario_id: string; nome: string; data: string }[];
  /** Lá está em outra sede: só o código, nada da pessoa além disso. */
  outraSede: { funcionario_id: string; nome: string; sede: string }[];
  /** A matrícula daqui não acha ninguém de mesmo nome lá. Nenhum dado de lá. */
  naoConfere: { funcionario_id: string; nome: string }[];
  /**
   * ASG ativo no Quadro desta sede sem ninguém vinculado aqui. `null` enquanto
   * houver gente sem vínculo — antes disso a lista repetiria as mesmas pessoas.
   */
  foraDoOrkestria: { nome: string; admissao: string }[] | null;
}

/**
 * A pessoa de lá que este cadastro aponta: mesma matrícula, empresa compatível
 * e nome conferindo — `nomeConfereNaSede` se ela está na sede do cadastro,
 * `nomeConfere` (estrito) se está em outra.
 */
function vinculada(f: FuncionarioCruzado, sedeDoCadastro: string | undefined, quadro: PessoaQuadro[]): PessoaQuadro | undefined {
  const m = normalizarMatricula(f.matricula);
  if (!m) return undefined;
  return quadro.find(
    (p) =>
      p.matricula === m &&
      (!f.empresa || p.empresa === f.empresa) &&
      (p.sede === sedeDoCadastro ? nomeConfereNaSede(f.nome, p.nome) : nomeConfere(f.nome, p.nome)),
  );
}

const estaAtivo = (f: FuncionarioCruzado) => f.ativo && !f.desligado_em;

/**
 * As divergências de UMA sede. `daSede` são os funcionários dela; `todos`, os de
 * todas as sedes (só para saber quem do Quadro já tem vínculo em algum lugar);
 * `mapa`, sede daqui → sede do Chromos (`mapaDeSedes`).
 *
 * ⚠️ DESLIGADO DAQUI NÃO SEGURA VÍNCULO: transferir é desligar numa sede e
 * cadastrar de novo na outra, e o cadastro velho escondia a pessoa das
 * sugestões do novo (auditoria, 23/10/2026).
 */
export function cruzar(args: {
  sedeNoChromos: string;
  daSede: FuncionarioCruzado[];
  todos: FuncionarioCruzado[];
  quadro: PessoaQuadro[];
  mapa: ReadonlyMap<string, string>;
}): Divergencias {
  const { sedeNoChromos, quadro, mapa } = args;
  const ativos = args.daSede.filter(estaAtivo);
  const daqui = quadro.filter((p) => p.sede === sedeNoChromos);
  const jaVinculados = new Set(
    args.todos.filter(estaAtivo).map((f) => vinculada(f, mapa.get(f.sede_id), quadro)?.id).filter(Boolean),
  );

  const r: Divergencias = { semVinculo: [], desligados: [], outraSede: [], naoConfere: [], foraDoOrkestria: null };
  for (const f of ativos) {
    if (!normalizarMatricula(f.matricula)) {
      const sugestoes = daqui
        .filter((p) => !jaVinculados.has(p.id) && nomeConfereNaSede(f.nome, p.nome))
        .slice(0, 3)
        .map((p) => ({ quadro_id: p.id, nome: p.nome, admissao: p.admissao, situacao: p.situacao }));
      r.semVinculo.push({ funcionario_id: f.id, nome: f.nome, sugestoes });
      continue;
    }
    const p = vinculada(f, sedeNoChromos, quadro);
    if (!p) {
      r.naoConfere.push({ funcionario_id: f.id, nome: f.nome });
      continue;
    }
    if (p.situacao === "INATIVO") r.desligados.push({ funcionario_id: f.id, nome: f.nome, data: p.desligamento });
    else if (p.sede !== sedeNoChromos) r.outraSede.push({ funcionario_id: f.id, nome: f.nome, sede: p.sede });
  }
  if (!r.semVinculo.length)
    r.foraDoOrkestria = daqui
      .filter((p) => p.situacao === "ATIVO" && !jaVinculados.has(p.id))
      .map((p) => ({ nome: p.nome, admissao: p.admissao }));
  return r;
}

export function totalDeDivergencias(d: Divergencias): number {
  return (
    d.semVinculo.length + d.desligados.length + d.outraSede.length + d.naoConfere.length + (d.foraDoOrkestria?.length ?? 0)
  );
}
