"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import CadastroVinculadoRapido, {
  type RegistroVinculado,
  type TipoVinculoRapido,
} from "@/components/CadastroVinculadoRapido";
import CrudManager from "@/components/CrudManager";
import ReplicarTarefa from "@/components/ReplicarTarefa";
import { useSessao } from "@/components/SessaoContext";
import { tempoPrevistoMin } from "@/lib/calculations";
import { fetcher } from "@/lib/clientApi";
import { formatarDuracao, rotularDiasSemana } from "@/lib/dateUtils";
import type { Categoria, Local, Requisito, Sede, Tarefa } from "@/types";

const REGRAS = [
  { valor: "fixo", rotulo: "Tempo fixo" },
  { valor: "por_m2", rotulo: "Por m² (× metragem do local)" },
  { valor: "por_unidade", rotulo: "Por unidade (× quantidade)" },
  { valor: "manual", rotulo: "Manual" },
];

const TIPOS_SERVICO = [
  { valor: "rotina", rotulo: "Rotina (manutenção) ×1,0" },
  { valor: "pesada", rotulo: "Pesada (reforçada) ×1,5" },
  { valor: "desincrustante", rotulo: "Desincrustante (encardido) ×2,0" },
];

const FREQUENCIAS = [
  { valor: "diaria", rotulo: "Diária" },
  { valor: "semanal", rotulo: "Semanal" },
  { valor: "quinzenal", rotulo: "Quinzenal" },
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "sob_demanda", rotulo: "Sob demanda" },
];

const PRIORIDADES = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "media", rotulo: "Média" },
  { valor: "baixa", rotulo: "Baixa" },
];

const RESTRICOES_GENERO = [
  { valor: "", rotulo: "Sem restrição (qualquer ASG)" },
  { valor: "feminino", rotulo: "Apenas mulheres" },
  { valor: "masculino", rotulo: "Apenas homens" },
];

export default function PaginaTarefas() {
  const sessao = useSessao();
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const { data: locais, mutate: mutateLocais } = useSWR<Local[]>("/api/locais", fetcher);
  const { data: tarefas, mutate: mutateTarefas } = useSWR<Tarefa[]>("/api/tarefas", fetcher);
  const { data: categorias, mutate: mutateCategorias } = useSWR<Categoria[]>("/api/categorias", fetcher);
  const { data: requisitos, mutate: mutateRequisitos } = useSWR<Requisito[]>("/api/requisitos", fetcher);
  const [tarefaParaReplicar, setTarefaParaReplicar] = useState<Tarefa | null>(null);
  const [vinculoRapido, setVinculoRapido] = useState<TipoVinculoRapido | null>(null);
  const preencherVinculoRef = useRef<((valor: string) => void) | null>(null);

  function abrirVinculo(tipo: TipoVinculoRapido, definirValor: (valor: string) => void) {
    preencherVinculoRef.current = definirValor;
    setVinculoRapido(tipo);
  }

  async function vinculoCriado(registro: RegistroVinculado, tipo: TipoVinculoRapido) {
    if (tipo === "local") await mutateLocais();
    if (tipo === "categoria") await mutateCategorias();
    if (tipo === "requisito") await mutateRequisitos();
    preencherVinculoRef.current?.(registro.id);
    preencherVinculoRef.current = null;
  }

  const nomeSede = (id: string) => sedes?.find((s) => s.id === id)?.nome_sede ?? id;
  const localPorId = (id: string) => locais?.find((l) => l.id === id);
  const categoriaPorId = (id?: string) => categorias?.find((c) => c.id === id);
  const requisitosDe = (csv?: string) =>
    (csv ?? "").split(",").filter(Boolean).map((id) => requisitos?.find((r) => r.id === id)).filter(Boolean) as Requisito[];

  return (
    <>
    <CrudManager<Tarefa>
      titulo="Tarefas"
      subtitulo="Serviços atribuíveis. A sede é herdada automaticamente do local selecionado."
      endpoint="/api/tarefas"
      chaveRascunho="tarefas"
      textoNovo="+ Nova tarefa"
      vazio="Cadastre os serviços que a equipe executa. Cada tarefa pertence a um local (a sede vem dele)."
      permitirDuplicar
      rotuloRegistro={(t) => t.nome_tarefa}
      textoBusca={(t) => {
        const local = localPorId(t.local_id);
        const categoria = categoriaPorId(t.categoria_id);
        return `${local?.nome_local ?? ""} ${local ? nomeSede(local.sede_id) : ""} ${categoria?.nome ?? ""} ${requisitosDe(t.requisitos).map((r) => r.nome).join(" ")}`;
      }}
      filtrosRapidos={[
        { valor: "criticas", rotulo: "Críticas", testar: (t) => Boolean(t.critica) },
        { valor: "diarias", rotulo: "Diárias", testar: (t) => t.frequencia === "diaria" },
        { valor: "com_requisitos", rotulo: "Com requisitos/EPI", testar: (t) => Boolean(t.requisitos) },
        { valor: "sem_categoria", rotulo: "Sem categoria", testar: (t) => !t.categoria_id },
        {
          valor: "sem_tempo",
          rotulo: "Sem tempo válido",
          testar: (t) =>
            t.tempo_base_min <= 0 ||
            (t.regra_calculo === "por_unidade" && t.quantidade <= 0),
        },
      ]}
      acoesExtra={(t) => (
        <>
          {sessao.perfil !== "visualizador" && t.ativo && (
            <button type="button" className="btn btn-mini btn-fantasma" onClick={() => setTarefaParaReplicar(t)}>
              Replicar
            </button>
          )}{" "}
          <Link className="btn btn-mini btn-fantasma" href={`/rotinas?sede=${encodeURIComponent(t.sede_id)}&tarefa=${encodeURIComponent(t.id)}`}>
            Usar na agenda →
          </Link>
        </>
      )}
      campos={[
        {
          key: "nome_tarefa",
          rotulo: "Nome da tarefa",
          tipo: "texto",
          obrigatorio: true,
          dica: "O nome do serviço que será feito, como aparecerá na agenda. Ex.: \"Limpeza concorrente\", \"Higienização de banheiro\", \"Coleta de resíduos\".",
          secao: "Identificação e local",
          descricaoSecao: "Defina o que será feito e onde; a sede é herdada automaticamente do local.",
        },
        {
          key: "categoria_id",
          rotulo: "Categoria",
          tipo: "select",
          opcoes: (categorias ?? [])
            .filter((c) => c.ativo)
            .map((c) => ({ valor: c.id, rotulo: c.nome })),
          ajuda: "Catálogo gerenciado em Categorias (admin)",
          acaoAuxiliar: sessao.perfil === "administrador"
            ? { rotulo: "Criar categoria sem sair", executar: (definir) => abrirVinculo("categoria", definir) }
            : undefined,
          dica: "A categoria de atividade que agrupa esta tarefa (ex.: Higienização, Coleta). Usada nos filtros da paleta e na recalibração em cascata. O catálogo é gerenciado na tela Categorias.",
        },
        {
          key: "tipo_tarefa",
          rotulo: "Tipo (texto livre)",
          tipo: "texto",
          avancado: true,
          ajuda: "Rótulo livre opcional — prefira a Categoria acima",
          dica: "Campo de texto livre legado, anterior à camada de Categorias. Pode usar para uma observação fina de tipo, mas o agrupamento oficial agora é a Categoria.",
        },
        {
          key: "local_id",
          rotulo: "Local",
          tipo: "select",
          obrigatorio: true,
          opcoes: (locais ?? []).map((l) => ({
            valor: l.id,
            rotulo: `${l.nome_local} (${l.andar}) — ${nomeSede(l.sede_id)}`,
          })),
          ajuda: "Obrigatório — a sede vem do local",
          acaoAuxiliar: sessao.perfil !== "visualizador"
            ? { rotulo: "Criar local sem sair", executar: (definir) => abrirVinculo("local", definir) }
            : undefined,
          inteira: true,
          dica: "Onde a tarefa é executada. Ao escolher o local, o sistema já sabe automaticamente a sede e a metragem (m²) dele — por isso não existe tarefa sem local.",
        },
        {
          key: "regra_calculo",
          rotulo: "Regra de cálculo",
          tipo: "select",
          obrigatorio: true,
          opcoes: REGRAS,
          dica: "Como o sistema descobre quanto tempo a tarefa leva. • FIXO: sempre o mesmo tempo (ex.: repor material = 15 min). • POR M²: multiplica o tempo pela metragem do local (ex.: 1 min/m² numa sala de 80 m² = 80 min). • POR UNIDADE: multiplica pela quantidade (ex.: 20 min × 3 banheiros = 60 min). • MANUAL: você digita o tempo na mão.",
          secao: "Cálculo do tempo",
          descricaoSecao: "Configure a fórmula que transforma o ambiente em duração prevista.",
        },
        {
          key: "tipo_servico",
          rotulo: "Tipo de serviço",
          tipo: "select",
          padrao: "rotina",
          avancado: true,
          opcoes: TIPOS_SERVICO,
          ajuda: "Multiplica o tempo previsto pela natureza do esforço",
          dica: "A natureza do esforço de limpeza, que multiplica o tempo previsto. • ROTINA: manutenção do dia a dia (×1,0). • PESADA: limpeza reforçada/profunda (×1,5). • DESINCRUSTANTE: remover sujeira aderida/encardido (×2,0). Combina-se com a intensidade do ambiente (cadastrada no Local): o tempo final = m² × intensidade do local × tipo de serviço.",
        },
        {
          key: "tempo_base_min",
          rotulo: "Tempo base (min)",
          tipo: "numero",
          passo: "0.1",
          obrigatorio: true,
          ajuda: "Fixo/manual: total · por m²: min/m² · por unidade: min/un.",
          dica: "O número que entra na conta da regra acima, sempre em minutos. Se a regra é FIXO ou MANUAL, é o tempo total da tarefa. Se é POR M², é quantos minutos cada m² leva (ex.: 1). Se é POR UNIDADE, é quantos minutos cada unidade leva (ex.: 20).",
        },
        {
          key: "quantidade",
          rotulo: "Quantidade",
          tipo: "numero",
          padrao: 1,
          mostrarSe: (f) => f.regra_calculo === "por_unidade",
          ajuda: "Usada na regra por unidade",
          dica: "Só é usada quando a regra é POR UNIDADE: quantas unidades existem (ex.: 3 banheiros, 5 lixeiras). Nas outras regras pode deixar 1 — não afeta o cálculo.",
        },
        {
          key: "frequencia",
          rotulo: "Frequência",
          tipo: "select",
          opcoes: FREQUENCIAS,
          padrao: "diaria",
          dica: "Com que regularidade a tarefa deveria ser feita. Ajuda o painel \"Ficou de fora hoje\" a avisar quando uma tarefa diária não foi alocada ou uma semanal/mensal está vencida. Não cria a tarefa sozinho — é o supervisor que monta a agenda.",
          secao: "Agenda e restrições",
          descricaoSecao: "Quando a tarefa vence, sua prioridade e quem pode executá-la.",
        },
        {
          key: "dias_semana",
          rotulo: "Dias da semana",
          tipo: "dias_semana",
          inteira: true,
          mostrarSe: (f) => f.frequencia === "semanal",
          ajuda: "Opcional — deixe sem marcar para \"1× por semana\" (janela de 7 dias).",
          dica: "Periodicidade fina: marque os dias fixos em que a tarefa deve ser feita (ex.: terça e quinta). O painel \"Ficou de fora hoje\" passa a cobrar a tarefa exatamente nesses dias, em vez de uma vez a cada 7 dias. Marcar 2 dias equivale a \"2× por semana\". Vale só para frequência Semanal.",
        },
        {
          key: "prioridade",
          rotulo: "Prioridade",
          tipo: "select",
          opcoes: PRIORIDADES,
          padrao: "media",
          dica: "A importância da tarefa (alta, média, baixa). Aparece como cor na lista de tarefas para o supervisor priorizar o que alocar primeiro. Não bloqueia nada.",
        },
        {
          key: "restricao_genero",
          rotulo: "Restrição de gênero",
          tipo: "select",
          padrao: "",
          avancado: true,
          opcoes: RESTRICOES_GENERO,
          ajuda: "Ex.: banheiro feminino → só ASG mulheres podem ser alocadas",
          dica: "Restringe quem pode executar a tarefa por gênero. Ex.: limpeza de banheiro feminino marcada como \"Apenas mulheres\" — a agenda bloqueia alocar essa tarefa para um homem. Deixe \"Sem restrição\" quando qualquer ASG pode fazer.",
        },
        {
          key: "janela_inicio",
          rotulo: "Janela: início",
          tipo: "hora",
          avancado: true,
          dica: "Se a tarefa só pode ocorrer num horário específico, informe o início da janela (ex.: 13:00 para limpar o refeitório só após o almoço). Deixe vazio se pode ser feita a qualquer hora do expediente.",
        },
        {
          key: "janela_fim",
          rotulo: "Janela: fim",
          tipo: "hora",
          avancado: true,
          dica: "Fim da janela em que a tarefa pode ocorrer. A agenda bloqueia alocar a tarefa fora desse intervalo. Preencha junto com a Janela: início.",
        },
        {
          key: "tempo_referencia",
          rotulo: "Tempo é só referência",
          tipo: "checkbox",
          padrao: false,
          avancado: true,
          dica: "Marque quando o tempo previsto é apenas uma base e a execução varia muito (ex.: montagem de palco). Assim o sistema NÃO cobra justificativa de desvio, não inclui a tarefa no \"Top desvios\" nem nas sugestões de ajuste — evita poluir os indicadores com falsos desvios.",
          secao: "Comportamento operacional",
          descricaoSecao: "Exceções que mudam alertas, cobertura e leitura dos indicadores.",
        },
        {
          key: "presenca",
          rotulo: "Presença / plantão",
          tipo: "checkbox",
          padrao: false,
          avancado: true,
          dica: "Marque para atividades de permanência (ex.: acompanhar alunos no intervalo, plantão). É tempo ocupado e necessário: o sistema NÃO cobra desvio (a duração varia por contexto, não é erro de estimativa). Diferente de \"tempo é referência\" só no sentido — aqui é tempo de permanência, não de produção.",
        },
        {
          key: "critica",
          rotulo: "Crítica (circuito essencial)",
          tipo: "checkbox",
          padrao: false,
          avancado: true,
          dica: "Marque tarefas que NÃO podem deixar de ser feitas (ex.: higienização de banheiro). Quando uma crítica fica sem alocação no dia, o painel \"Ficou de fora hoje\" mostra um alerta de “Circuito essencial descoberto” em destaque máximo (vermelho), separado das demais pendências. Diferente de prioridade, que só ordena.",
        },
        {
          key: "depende_calendario",
          rotulo: "Depende do calendário acadêmico",
          tipo: "checkbox",
          padrao: false,
          avancado: true,
          dica: "Marque para tarefas que só fazem sentido em período letivo (ex.: limpeza de sala de aula). Fora do período (férias/recesso), elas deixam de ser cobradas no painel \"Ficou de fora hoje\". O calendário é cadastrado em Estrutura → Calendário acadêmico, por sede.",
        },
        {
          key: "requisitos",
          rotulo: "Requisitos de execução",
          tipo: "multiselect",
          avancado: true,
          inteira: true,
          opcoes: (requisitos ?? []).filter((r) => r.ativo).map((r) => ({ valor: r.id, rotulo: r.nome })),
          ajuda: "Catálogo gerenciado em Requisitos (admin)",
          acaoAuxiliar: sessao.perfil === "administrador"
            ? { rotulo: "Criar requisito sem sair", executar: (definir) => abrirVinculo("requisito", definir) }
            : undefined,
          dica: "Aptidões/treinamentos que o executante precisa ter (a agenda bloqueia quem não tem ou está vencido) e EPIs exigidos (lembrete). Selecione os que esta tarefa demanda.",
        },
        {
          key: "ativo",
          rotulo: "Ativa",
          tipo: "checkbox",
          padrao: true,
          avancado: true,
          secao: "Publicação",
          descricaoSecao: "Revise e disponibilize a tarefa para a agenda.",
        },
        { key: "observacoes", rotulo: "Observações", tipo: "textarea", inteira: true, avancado: true },
      ]}
      colunas={[
        { key: "nome_tarefa", rotulo: "Tarefa" },
        {
          key: "local_id",
          rotulo: "Local / Sede",
          render: (t) => {
            const l = localPorId(t.local_id);
            return l ? `${l.nome_local} — ${nomeSede(l.sede_id)}` : t.local_id;
          },
        },
        {
          key: "categoria_id",
          rotulo: "Categoria",
          render: (t) => {
            const c = categoriaPorId(t.categoria_id);
            if (!c) return <span style={{ color: "var(--tinta-3)", fontSize: 12 }}>—</span>;
            return (
              <span
                className="selo"
                style={{ background: c.cor || "var(--papel-3)", color: "#fff", borderColor: c.cor || "var(--tinta)" }}
              >
                {c.nome}
              </span>
            );
          },
        },
        {
          key: "regra_calculo",
          rotulo: "Regra",
          render: (t) => REGRAS.find((r) => r.valor === t.regra_calculo)?.rotulo.split(" (")[0] ?? t.regra_calculo,
        },
        {
          key: "tempo_base_min",
          rotulo: "Tempo previsto",
          render: (t) => (
            <strong className="num">
              {formatarDuracao(tempoPrevistoMin(t, localPorId(t.local_id)))}
            </strong>
          ),
        },
        {
          key: "prioridade",
          rotulo: "Prioridade",
          render: (t) => (
            <span
              className={`selo ${
                t.prioridade === "alta" ? "selo-vermelho" : t.prioridade === "media" ? "selo-amarelo" : "selo-cinza"
              }`}
            >
              {t.prioridade}
            </span>
          ),
        },
        {
          key: "restricao_genero",
          rotulo: "Regras",
          render: (t) => (
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {t.restricao_genero && (
                <span className={`selo ${t.restricao_genero === "feminino" ? "selo-vermelho" : "selo-azul"}`}>
                  {t.restricao_genero === "feminino" ? "♀ Mulheres" : "♂ Homens"}
                </span>
              )}
              {t.tipo_servico && t.tipo_servico !== "rotina" && (
                <span className="selo selo-laranja">
                  {t.tipo_servico === "pesada" ? "pesada ×1,5" : "desincrustante ×2,0"}
                </span>
              )}
              {t.janela_inicio && t.janela_fim && (
                <span className="selo selo-laranja num">
                  {t.janela_inicio}–{t.janela_fim}
                </span>
              )}
              {t.frequencia === "semanal" && t.dias_semana && (
                <span className="selo selo-azul">{rotularDiasSemana(t.dias_semana)}</span>
              )}
              {t.tempo_referencia && <span className="selo selo-cinza">referência</span>}
              {t.presenca && <span className="selo selo-azul">presença</span>}
              {t.critica && <span className="selo selo-vermelho">⛔ crítica</span>}
              {t.depende_calendario && <span className="selo selo-azul">📅 letiva</span>}
              {requisitosDe(t.requisitos).map((r) => (
                <span key={r.id} className="selo selo-roxo" title={`Requisito: ${r.tipo}`}>
                  {r.tipo === "epi" ? "🧤" : r.tipo === "aptidao" ? "🩺" : "🎓"} {r.nome}
                </span>
              ))}
              {!t.restricao_genero &&
                (!t.tipo_servico || t.tipo_servico === "rotina") &&
                !t.tempo_referencia &&
                !t.presenca &&
                !t.critica &&
                !t.depende_calendario &&
                !(t.requisitos && requisitosDe(t.requisitos).length) &&
                !(t.janela_inicio && t.janela_fim) &&
                !(t.frequencia === "semanal" && t.dias_semana) && (
                  <span style={{ color: "var(--tinta-3)", fontSize: 12 }}>—</span>
                )}
            </span>
          ),
        },
        {
          key: "ativo",
          rotulo: "Status",
          render: (t) => (
            <span className={`selo ${t.ativo ? "selo-verde" : "selo-cinza"}`}>
              {t.ativo ? "Ativa" : "Inativa"}
            </span>
          ),
        },
      ]}
    />
    <ReplicarTarefa
      tarefa={tarefaParaReplicar}
      locais={locais ?? []}
      tarefas={tarefas ?? []}
      aoFechar={() => setTarefaParaReplicar(null)}
      aoConcluir={async () => {
        await mutateTarefas();
      }}
    />
    <CadastroVinculadoRapido
      tipo={vinculoRapido}
      sedes={sedes ?? []}
      aoFechar={() => {
        setVinculoRapido(null);
        preencherVinculoRef.current = null;
      }}
      aoCriado={vinculoCriado}
    />
    </>
  );
}
