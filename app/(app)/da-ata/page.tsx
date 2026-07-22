import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import diarioFonte from "@/DIARIO.md";
import { parsearDiarioProduto } from "@/lib/diarioProduto";
import { podeVerEvolucaoProduto } from "@/lib/permissions";
import { obterSessao } from "@/lib/session";

/**
 * "Da ata ao sistema" — painel de transparência para a direção: cada pedido
 * levantado na reunião de alinhamento (16/06/2026) e na pré-análise, lado a
 * lado com o que o Orkestria faz em resposta. Conteúdo fiel a docs/08 e docs/09.
 */

type Status = "entregue" | "parcial" | "decisao";

const STATUS: Record<Status, { rotulo: string; cor: string; icone: string }> = {
  entregue: { rotulo: "Entregue", cor: "var(--verde)", icone: "✓" },
  parcial: { rotulo: "Parcial", cor: "var(--laranja)", icone: "◐" },
  decisao: { rotulo: "Decisão / cautela", cor: "var(--acento)", icone: "⚖" },
};

type Item = { pediu: string; faz: string; status: Status; nota?: string };
type Bloco = { titulo: string; itens: Item[] };

const BLOCOS: Bloco[] = [
  {
    titulo: "Como o tempo é calculado",
    itens: [
      {
        pediu: "Tempo = atividade × espaço × tipo de limpeza, com base 1 m² ≈ 1 min.",
        faz: "O previsto de uma tarefa por m² = base × metragem × intensidade do local × tipo de serviço. A intensidade saiu da categoria e foi para o LOCAL (leve 0,8 · normal 1,0 · densa 1,5); a tarefa tem tipo de serviço (rotina 1,0 · pesada 1,5 · desincrustante 2,0). Tudo ajustável pela operação.",
        status: "entregue",
      },
      {
        pediu: "O tipo de uso do local deveria puxar o nível de limpeza (laboratório, clínica, pátio são mais pesados só por serem aquilo).",
        faz: "Feito (decisão fechada em 17/07): deixando o fator em branco no cadastro, ele sai do TIPO do local — banheiro e copa densos (1,5), área externa leve (0,8), demais normais. O fator da tarefa continua existindo e os dois multiplicam, com o local como prioritário. Quem digitar um valor sobrepõe o padrão.",
        status: "entregue",
      },
      {
        pediu: "Contar o tempo de deslocamento/transição entre ambientes.",
        faz: "Parâmetro por sede (minutos de deslocamento por tarefa) que entra na ocupação como tempo real.",
        status: "entregue",
      },
      {
        pediu: "Combater o bloco de 30 min — capturar ganhos de poucos minutos.",
        faz: "Os números sempre usam o tempo exato, não o bloco visual. A grade desceu de 30 → 15 min (evidência da planilha real da Aldeota, que trabalha em blocos de 15/10/5). O bloco continua só visual e ajustável.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Previsto, realizado e tempo de referência",
    itens: [
      {
        pediu: "Dois tempos: o previsto e o realizado.",
        faz: "Existe desde o início; o desvio é calculado por tarefa e por dia (previsto × realizado).",
        status: "entregue",
      },
      {
        pediu: "Tempo padrão por pessoa numa atividade — para planejar, sem virar avaliação.",
        faz: "Cada pessoa pode ter um tempo próprio numa tarefa, usado só ao montar a agenda. Não alimenta avaliação/premiação sem decisão explícita.",
        status: "entregue",
      },
      {
        pediu: "Atividades que não devem cobrar desvio (montagem de palco, plantão, presença).",
        faz: "Flag “tempo é referência” e flag de presença/plantão não geram alerta de desvio. O plantão tem a duração informada no dia (varia por designação).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Criticidade e periodicidade",
    itens: [
      {
        pediu: "Circuito essencial: tarefas críticas que não podem ficar descobertas.",
        faz: "A tarefa pode ser marcada como crítica; se ficar sem cobertura, o painel destaca em vermelho “circuito essencial descoberto”, separado das demais pendências.",
        status: "entregue",
      },
      {
        pediu: "Tarefa não-crítica de quem faltou pode esperar um ou dois dias.",
        faz: "A cobertura usa a criticidade — não força realocar o que não é crítico.",
        status: "entregue",
      },
      {
        pediu: "Periodicidade em dias fixos e janela de horário por tarefa.",
        faz: "Tarefa programável em dias da semana escolhidos e com janela de horário (só pode cair entre o início e o fim definidos).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Faltas e remanejo",
    itens: [
      {
        pediu: "Falta → serviços abertos → substituir, inclusive entre sedes.",
        faz: "A tela de remanejo mostra as tarefas dos ausentes de todas as sedes e passa a um colega com folga (mesmo de outra sede, com aviso de deslocamento), validando jornada, conflito e conformidade. Tem também “distribuir automaticamente (sugestão)”.",
        status: "entregue",
      },
      {
        pediu: "Avisar automaticamente quem assumiu a tarefa.",
        faz: "Depende de um canal direto com o ASG — mesmo bloco da confirmação pelo funcionário.",
        status: "decisao",
      },
    ],
  },
  {
    titulo: "Serviços eventuais (o segundo eixo)",
    itens: [
      {
        pediu: "Trabalho não-rotineiro: café, montagem de evento, descarga de caminhão, imprevistos.",
        faz: "Modo próprio de serviço eventual/imprevisto, registrado após o fato. Os imprevistos alimentam o buffer de folga de cada sede.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Ociosidade como buffer por sede",
    itens: [
      {
        pediu: "Ociosidade-alvo por tipo de sede (ex.: educação infantil ~20%), calibrada por dados reais.",
        faz: "Folga mínima por sede; os imprevistos registrados sugerem a folga de cada uma. A sede ganhou tipo e grupo (ex.: “Sul”) para comparar unidades parecidas.",
        status: "entregue",
      },
      {
        pediu: "Visão agregada de ociosidade por grupo (Sul 1/2/3).",
        faz: "Pronto no painel “Panorama de sedes”: soma ocupação e ociosidade de todas as sedes por grupo ou por tipo, com ocupação média, sobrecarga e uma dica de remanejo (sede com mais folga × mais cheia).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Conformidade, aptidão e EPI",
    itens: [
      {
        pediu: "Aptidão/restrição médica e treinamento (com validade) como pré-requisito.",
        faz: "Catálogo de aptidões/treinamentos/EPIs; o sistema bloqueia alocar quem não tem o requisito ou está com o treinamento vencido.",
        status: "entregue",
      },
      {
        pediu: "EPI por atividade e confirmação de que o EPI foi usado.",
        faz: "A tarefa declara o EPI exigido; a ficha de confirmação lista os EPIs e, ao ler a ficha, o sistema marca os EPIs confirmados no realizado.",
        status: "entregue",
      },
      {
        pediu: "Restrições por sexo (banheiro feminino) e limitações físicas (peso máximo).",
        faz: "Gênero é restrição operacional do local, não fator de produtividade. Limitações físicas entram como aptidão/treinamento — restrição por habilitação, não por sexo.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Confirmação do executado (ficha de papel + leitura)",
    itens: [
      {
        pediu: "O ASG não usa celular: confirmar o feito numa ficha de papel e depois inserir no sistema.",
        faz: "Ficha imprimível por funcionário/dia (checklist por ambiente + EPIs + assinatura), com QR e marcadores de canto. A leitura é por OMR (detecta o X marcado, como um gabarito) dentro do próprio sistema — sem serviço externo — e grava o realizado casando com a rotina planejada. Validado em scan real (foto de celular): 12 tarefas + 10 EPIs lidos corretamente.",
        status: "entregue",
      },
      {
        pediu: "Reconhecimento facial (API “Edison”) para o “ok” presencial.",
        faz: "Avaliação futura, depois da ingestão por ficha estar consolidada.",
        status: "decisao",
      },
    ],
  },
  {
    titulo: "Calendário acadêmico",
    itens: [
      {
        pediu: "Período letivo: não cobrar limpeza de sala em férias/recesso.",
        faz: "Calendário acadêmico por sede (intervalo + dias com aula). Tarefas letivas só são cobradas no período; fora dele somem do “Ficou de fora hoje”. Sem calendário cadastrado, a agenda avisa.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Produtividade, pessoas e relatórios",
    itens: [
      {
        pediu: "Score de produtividade por funcionário (apoia o processo de premiação).",
        faz: "Tela de produtividade com a aderência previsto × realizado por pessoa e exportação em planilha.",
        status: "entregue",
      },
      {
        pediu: "Usar idade e sexo na correlação de produtividade.",
        faz: "Fora do sistema, por salvaguarda da própria direção: não entram no motor de produtividade, alocação ou premiação até uma decisão formal (jurídico — Davi Rocha).",
        status: "decisao",
      },
      {
        pediu: "Relatório mensal por funcionário para o cliente assinar e login individual.",
        faz: "Relatório mensal pronto. Login com senha por usuário e “Entrar com Google” (só e-mails já cadastrados).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Demonstração às sedes (17/07)",
    itens: [
      {
        pediu: "Eventos desmontam a rotina — e no dia do evento não há tempo de montar a programação.",
        faz: "Cadastro de rotina por TIPO DE EVENTO: monte o 1º evento na agenda, salve como “modelo de evento” e nos próximos aplique com antecedência (na sexta, para o fim de semana). No dia, gere a rota padrão e aplique o evento por cima — o que conflita de horário é pulado e informado.",
        status: "entregue",
      },
      {
        pediu: "Direcionar a pessoa mais habilitada para a atividade do evento (ex.: montagem de palco).",
        faz: "A qualificação ganhou um nível (apto · experiente · referência) e a lista de tarefas sugere quem chamar primeiro. É degrau de HABILITAÇÃO, não avaliação de desempenho: quem tem a qualificação válida executa, seja qual for o nível.",
        status: "entregue",
      },
      {
        pediu: "Na ficha, o funcionário não deve escolher item a item — deve declarar que usou os EPIs corretos.",
        faz: "A ficha traz uma declaração única, com os EPIs listados nominalmente ao lado (o registro precisa dizer o que foi usado, porque a ficha assinada tem valor probatório). Fichas já impressas no formato antigo continuam sendo lidas.",
        status: "entregue",
      },
      {
        pediu: "Fixar também a coluna da esquerda ao rolar a agenda para o lado.",
        faz: "A régua de horários (visão diária) e a coluna de nomes (visão semanal) ficam fixas na rolagem horizontal.",
        status: "entregue",
      },
      {
        pediu: "Substituir o cadastro por idade por “aptidão”, para evitar etarismo.",
        faz: "O cadastro de funcionário nunca teve idade — a habilitação sempre foi modelada por qualificação/treinamento, que é exatamente o critério pedido. Nada a remover.",
        status: "entregue",
      },
      {
        pediu: "Remanejar automaticamente as tarefas de quem for deslocado para o evento.",
        faz: "Confirmado no escopo do projeto, para uma etapa seguinte. Hoje a falta já aparece no painel de cobertura com sugestão de remanejo.",
        status: "decisao",
      },
      {
        pediu: "Formalizar a origem dos fatores de intensidade (0,8 · 1,0 · 1,5).",
        faz: "Os números são arbitrados e ajustáveis no sistema — a formalização metodológica é decisão da direção com a operação, não de desenvolvimento.",
        status: "decisao",
      },
    ],
  },
];

const MARCOS = [
  {
    numero: "01",
    fase: "Da conversa ao modelo",
    titulo: "A ata deixou de ser memória",
    antes: "Pedidos operacionais espalhados entre reunião, planilha e experiência de cada sede.",
    agora: "Tempo, criticidade, periodicidade, aptidões, EPIs e calendário viraram regras verificáveis.",
    impacto: "A decisão da reunião passou a sobreviver no dado e na validação.",
  },
  {
    numero: "02",
    fase: "Fundação invisível",
    titulo: "Liberdade sem atravessar sedes",
    antes: "Listas estavam escopadas, mas itens por ID e destinos de edição ainda abriam brechas.",
    agora: "Leitura, escrita e vínculos são conferidos no servidor, inclusive o destino da mudança.",
    impacto: "Mais segurança sem acrescentar um único passo ao supervisor.",
  },
  {
    numero: "03",
    fase: "Central do dia",
    titulo: "Uma próxima decisão",
    antes: "Cinco atalhos, indicadores cadastrais e escolhas antes mesmo de começar o dia.",
    agora: "A Central mostra somente a primeira exceção e a ação adequada para resolvê-la.",
    impacto: "O restante do sistema pode esperar até o que bloqueia o dia estar resolvido.",
  },
  {
    numero: "04",
    fase: "Acompanhamento",
    titulo: "O comum virou um toque",
    antes: "Toda tarefa exigia abrir e confirmar um formulário, mesmo quando tudo ocorreu conforme o plano.",
    agora: "“✓ Conforme” registra a execução na linha; formulário completo fica para desvio e EPI.",
    impacto: "O caso mediano perdeu um formulário sem esconder as exceções.",
  },
  {
    numero: "05",
    fase: "Exceção segura",
    titulo: "Resolver deixou de ser um modo",
    antes: "Abrir Agenda, localizar a tarefa órfã, procurar alguém e confirmar o remanejo.",
    agora: "Quando existe uma substituta sem alertas, a Central oferece a alocação pronta em uma decisão.",
    impacto: "A exceção ficou tão curta quanto o dia comum — e o servidor recalcula antes de gravar.",
  },
  {
    numero: "06",
    fase: "Agenda contextual",
    titulo: "Controles aparecem quando servem",
    antes: "Preparação, planejamento e utilidades competiam simultaneamente pela atenção.",
    agora: "Cada ação nasce do estado do dia e desaparece quando deixa de ser necessária.",
    impacto: "Mais capacidade no sistema, menos decisões na superfície operacional.",
  },
] as const;

const ESCOLHAS_PILOTO = [
  {
    classe: "ativo",
    rotulo: "Ativo no main",
    itens: [
      "Central enxuta e próxima exceção",
      "Confirmação conforme na própria linha",
      "Resolução segura em uma decisão",
      "Agenda contextual e rota padrão",
      "Permissões, integridade e auditoria aguardada",
    ],
  },
  {
    classe: "preservado",
    rotulo: "Preservado para depois",
    itens: [
      "Kits e replicação de tarefas",
      "Ações em massa e cadastro dentro da Agenda",
      "Favoritas, recentes e modo foco",
      "Busca global de entidades",
      "Painéis permanentes de prontidão cadastral",
    ],
  },
  {
    classe: "cautela",
    rotulo: "Aguardando validação",
    itens: [
      "Latência do Gerar o dia no Firestore real",
      "ORK4: autenticidade, densidade e teste físico",
      "Próximos retornos guiados pelo piloto",
    ],
  },
] as const;

const ENTRADAS_DIARIO = parsearDiarioProduto(diarioFonte);

function Selo({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className="evolucao-selo" style={{ color: s.cor, borderColor: s.cor }}>
      <span aria-hidden>{s.icone}</span>
      {s.rotulo}
    </span>
  );
}

function TextoComMarcacao({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/gu);
  return partes.map((parte, indice): ReactNode => {
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return <strong key={indice}>{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("`") && parte.endsWith("`")) {
      return <code key={indice}>{parte.slice(1, -1)}</code>;
    }
    const link = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
    if (link) {
      const [, rotulo, href] = link;
      if (/^https?:\/\//u.test(href)) {
        return <a key={indice} href={href} rel="noreferrer" target="_blank">{rotulo}</a>;
      }
      return <span key={indice}>{rotulo}</span>;
    }
    return parte;
  });
}

type TrechoDiario = {
  tipo: "paragrafo" | "item" | "item-numerado" | "subtitulo";
  texto: string;
  numero?: string;
};

function estruturarConteudo(conteudo: string): TrechoDiario[] {
  const trechos: TrechoDiario[] = [];
  let paragrafo = "";

  const guardarParagrafo = () => {
    if (paragrafo.trim()) trechos.push({ tipo: "paragrafo", texto: paragrafo.trim() });
    paragrafo = "";
  };

  for (const linhaOriginal of conteudo.split("\n")) {
    const linha = linhaOriginal.trim();
    if (!linha) {
      guardarParagrafo();
      continue;
    }

    const item = linha.match(/^[-*]\s+(.+)$/u);
    const numerado = linha.match(/^(\d+)\.\s+(.+)$/u);
    const subtitulo = linha.match(/^#{1,6}\s+(.+)$/u);
    if (item || numerado || subtitulo) {
      guardarParagrafo();
      if (item) trechos.push({ tipo: "item", texto: item[1] });
      else if (numerado) trechos.push({ tipo: "item-numerado", numero: numerado[1], texto: numerado[2] });
      else if (subtitulo) trechos.push({ tipo: "subtitulo", texto: subtitulo[1] });
      continue;
    }

    const anterior = trechos.at(-1);
    if (/^\s{2,}\S/u.test(linhaOriginal) && anterior && (anterior.tipo === "item" || anterior.tipo === "item-numerado")) {
      anterior.texto += ` ${linha}`;
    } else {
      paragrafo += `${paragrafo ? " " : ""}${linha}`;
    }
  }
  guardarParagrafo();
  return trechos;
}

function ConteudoDiario({ conteudo, bruto }: { conteudo: string; bruto: boolean }) {
  if (bruto) return <pre className="evolucao-diario-bruto">{conteudo}</pre>;
  return (
    <div className="evolucao-diario-conteudo">
      {estruturarConteudo(conteudo).map((trecho, indice) => {
        if (trecho.tipo === "item" || trecho.tipo === "item-numerado") {
          return (
            <div className="evolucao-diario-item" key={indice}>
              <span aria-hidden>{trecho.tipo === "item" ? "—" : `${trecho.numero}.`}</span>
              <p><TextoComMarcacao texto={trecho.texto} /></p>
            </div>
          );
        }
        if (trecho.tipo === "subtitulo") {
          return <h4 key={indice}><TextoComMarcacao texto={trecho.texto} /></h4>;
        }
        return <p key={indice}><TextoComMarcacao texto={trecho.texto} /></p>;
      })}
    </div>
  );
}

function formatarData(data: string | null): string {
  if (!data) return "Formato livre";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${data}T12:00:00Z`));
}

export default async function PaginaDaAta() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (!podeVerEvolucaoProduto(sessao)) redirect("/inicio");

  const itens = BLOCOS.flatMap((b) => b.itens);
  const conta = (s: Status) => itens.filter((i) => i.status === s).length;

  return (
    <div className="evolucao entra">
      <header className="evolucao-hero">
        <div className="evolucao-hero-pauta" aria-hidden />
        <div className="evolucao-hero-texto">
          <div className="rotulo">Prestação de contas · produto e operação</div>
          <h1>Da ata ao sistema.<br /><em>Do sistema a menos trabalho.</em></h1>
          <p>
            Uma leitura executiva do caminho percorrido pelo Orkestria — incluindo o que entrou,
            o que foi retirado de propósito e o que ainda exige evidência.
          </p>
        </div>
        <blockquote>
          <span className="rotulo">A régua</span>
          “Dados crescem;<br />operação encolhe.”
        </blockquote>
      </header>

      <section className="evolucao-placar" aria-label="Resumo da evolução">
        <div><strong className="num">{MARCOS.length}</strong><span>marcos executivos</span></div>
        <div><strong className="num">3</strong><span>fluxos pilotáveis</span></div>
        <div><strong className="num">1</strong><span>decisão por vez</span></div>
        <div><strong className="num">{ENTRADAS_DIARIO.length}</strong><span>registros completos</span></div>
      </section>

      <section className="evolucao-secao">
        <div className="evolucao-secao-cabecalho">
          <span className="rotulo">01 · A narrativa executiva</span>
          <h2>Seis movimentos, uma direção</h2>
          <p>Os marcos abaixo são curados: contam decisões estáveis, não uma lista de commits.</p>
        </div>
        <div className="evolucao-marcos">
          {MARCOS.map((marco) => (
            <article className="evolucao-marco" key={marco.numero}>
              <div className="evolucao-marco-num num">{marco.numero}</div>
              <div className="evolucao-marco-corpo">
                <span className="rotulo">{marco.fase}</span>
                <h3>{marco.titulo}</h3>
                <div className="evolucao-antes-agora">
                  <div><span>Antes</span><p>{marco.antes}</p></div>
                  <div><span>Agora</span><p>{marco.agora}</p></div>
                </div>
                <p className="evolucao-impacto"><strong>Impacto</strong> {marco.impacto}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="evolucao-secao">
        <div className="evolucao-secao-cabecalho">
          <span className="rotulo">02 · Escolhas explícitas</span>
          <h2>Construído não significa ativo</h2>
          <p>O piloto carrega somente o que substitui trabalho. O restante tem destino declarado.</p>
        </div>
        <div className="evolucao-escolhas">
          {ESCOLHAS_PILOTO.map((grupo) => (
            <article className={`evolucao-escolha ${grupo.classe}`} key={grupo.rotulo}>
              <span className="rotulo">{grupo.rotulo}</span>
              <ul>{grupo.itens.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="evolucao-secao">
        <div className="evolucao-secao-cabecalho">
          <span className="rotulo">03 · Rastreabilidade da reunião</span>
          <h2>O pedido e a resposta</h2>
          <p>{itens.length} pontos preservados da ata, recolhidos por tema para não competir com a apresentação.</p>
        </div>
        <div className="evolucao-status">
          {(Object.keys(STATUS) as Status[]).map((status) => (
            <div key={status}><strong className="num" style={{ color: STATUS[status].cor }}>{conta(status)}</strong><span>{STATUS[status].rotulo}</span></div>
          ))}
        </div>
        <div className="evolucao-atas">
          {BLOCOS.map((bloco) => (
            <details className="evolucao-ata" key={bloco.titulo}>
              <summary><span>{bloco.titulo}</span><small className="num">{bloco.itens.length}</small></summary>
              <div className="evolucao-ata-itens">
                {bloco.itens.map((item, indice) => (
                  <article key={indice}>
                    <div className="evolucao-ata-topo"><span className="rotulo">A ata pediu</span><Selo status={item.status} /></div>
                    <p>{item.pediu}</p>
                    <div className="evolucao-resposta">
                      <span className="rotulo">O sistema responde</span>
                      <p>{item.faz}</p>
                      {item.nota && <small>{item.nota}</small>}
                    </div>
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="evolucao-secao evolucao-arquivo">
        <div className="evolucao-secao-cabecalho">
          <span className="rotulo">04 · Arquivo integral</span>
          <h2>Nada depende da memória</h2>
          <p>
            Esta linha do tempo vem do DIARIO no build. Uma entrada fora do padrão permanece visível
            como texto bruto; nenhuma mudança é descartada porque o parser não a reconheceu.
          </p>
        </div>
        <div className="evolucao-linha-tempo">
          {ENTRADAS_DIARIO.map((entrada) => (
            <details className="evolucao-diario" key={entrada.id}>
              <summary>
                <time dateTime={entrada.data ?? undefined}>{formatarData(entrada.data)}</time>
                <span>{entrada.titulo}</span>
                {entrada.formato === "bruto" && <small>formato livre</small>}
              </summary>
              <ConteudoDiario conteudo={entrada.conteudo} bruto={entrada.formato === "bruto"} />
            </details>
          ))}
        </div>
      </section>

      <footer className="evolucao-rodape">
        <p>
          Planejamento, não punição · planejar ≠ avaliar · decisões sensíveis exigem direção ·
          toda escrita permanece auditada.
        </p>
        <Link href="/inicio">← Voltar à Central</Link>
      </footer>
    </div>
  );
}
